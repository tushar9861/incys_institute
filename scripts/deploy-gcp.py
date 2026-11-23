#!/usr/bin/env python3
"""Deploy the reviewed INCYS stack using an already-authorized GCP account.

Default: read-only access/billing check. --apply provisions paid resources and
publishes Hosting only after database readiness. Secrets stay in memory and
Secret Manager; Terraform state must remain private.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
PROJECT = 'incys-institute'
REGION = 'asia-south1'
ORIGIN = 'https://incys-institute.web.app'
STATE_BUCKET = PROJECT + '-incys-terraform-state'
RUNTIME_SECRET = 'incys-runtime-database-url'
MIGRATION_SECRET = 'incys-migration-database-url'
GCLOUD = os.environ.get('GCLOUD_BIN', 'gcloud')
TERRAFORM = os.environ.get('TERRAFORM_BIN', 'terraform')
FIREBASE = os.environ.get('FIREBASE_BIN', 'firebase')
INFRA = ROOT / 'infra' / 'gcp'


def run(exe, args, *, data=None, env=None, cwd=ROOT):
    result = subprocess.run([exe, *args], input=data, text=True, capture_output=True,
                            cwd=cwd, env=env, check=False)
    if result.returncode:
        # Command output may contain credentials. Surface only the operation.
        diagnostic = ROOT / '.deploy' / 'last-error.log'
        diagnostic.parent.mkdir(mode=0o700, exist_ok=True)
        diagnostic.write_text(result.stderr)
        diagnostic.chmod(0o600)
        if 'disabled in state delinquent' in result.stderr.lower():
            raise RuntimeError('Google Cloud rejected resource creation: the linked billing account is disabled in state delinquent. Resolve the billing-account restriction in Cloud Billing, then retry this deployment. No later deployment steps ran.')
        raise RuntimeError(f'{Path(exe).name} operation failed: {args[0]}. Private diagnostics: .deploy/last-error.log')
    return result.stdout.strip()


def gc(*args, data=None):
    return run(GCLOUD, [*args, '--project', PROJECT, '--quiet'], data=data)


def preflight():
    accounts = run(GCLOUD, ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'])
    if not accounts:
        raise RuntimeError('No signed-in GCP deployment account. Authenticate before deploying.')
    p = json.loads(gc('projects', 'describe', PROJECT, '--format=json'))
    if str(p['projectNumber']) != '688961840489':
        raise RuntimeError('Project number differs from the supplied Firebase app.')
    b = json.loads(gc('billing', 'projects', 'describe', PROJECT, '--format=json'))
    if not b.get('billingEnabled'):
        raise RuntimeError('This project needs Firebase Blaze / linked Cloud Billing before deployment.')
    account = json.loads(gc('billing', 'accounts', 'describe', b['billingAccountName'].split('/')[-1], '--format=json'))
    if not account.get('open'):
        raise RuntimeError('The billing account linked to incys-institute is closed (open: false). Reopen it or link an active account before deployment. No resources were provisioned by this run.')
    # Terraform uses ADC rather than the gcloud CLI login. Never print its token.
    run(GCLOUD, ['auth', 'application-default', 'print-access-token'])
    print(f'Access and a billing-account link verified for {PROJECT}. Resource APIs must also accept the billing account.')


def ensure_secret(name, username):
    items = json.loads(gc('secrets', 'list', '--filter=name:' + name, '--format=json'))
    found = any(x['name'].split('/')[-1] == name for x in items)
    if not found:
        gc('secrets', 'create', name, '--replication-policy=user-managed', '--locations=' + REGION)
    versions = json.loads(gc('secrets', 'versions', 'list', name, '--filter=state:ENABLED', '--format=json'))
    if versions:
        value = gc('secrets', 'versions', 'access', 'latest', '--secret=' + name)
        parsed = urllib.parse.urlparse(value)
        host = urllib.parse.parse_qs(parsed.query).get('host', [''])[0]
        if parsed.username != username or parsed.path != '/incys' or host != f'/cloudsql/{PROJECT}:{REGION}:incys-postgres':
            raise RuntimeError(f'{name} points to a different database. Review instead of overwriting it.')
        return value
    password = secrets.token_urlsafe(40)
    value = f'postgresql://{username}:{password}@localhost/incys?host=/cloudsql/{PROJECT}:{REGION}:incys-postgres'
    gc('secrets', 'versions', 'add', name, '--data-file=-', data=value)
    return value


def tf(args, env):
    return run(TERRAFORM, args, env=env, cwd=INFRA)


def apply_plan(env, targets=()):
    plan_path = ROOT / '.deploy' / 'review.tfplan'
    tf(['plan', '-input=false', '-out=' + str(plan_path), *['-target=' + x for x in targets]], env)
    plan = json.loads(tf(['show', '-json', str(plan_path)], env))
    changes = plan.get('resource_changes', [])
    if any('delete' in x['change']['actions'] for x in changes):
        raise RuntimeError('The plan includes deletion/replacement. Review it separately; no destructive apply was performed.')
    summary = [{ 'resource': x['address'], 'actions': x['change']['actions'] }
               for x in changes if x['change']['actions'] != ['no-op']]
    print(json.dumps(summary, indent=2))
    tf(['apply', '-input=false', str(plan_path)], env)
    plan_path.unlink(missing_ok=True)


def configure_identity(env):
    # Inspect and preserve existing authorized domains before managing this config.
    token = run(GCLOUD, ['auth', 'print-access-token'])
    req = urllib.request.Request(
        f'https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/config',
        headers={'Authorization': 'Bearer ' + token, 'x-goog-user-project': PROJECT})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            current = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            current = None
        else:
            raise RuntimeError('Cannot inspect Firebase Authentication. Check Identity Platform access before retrying.')
    except Exception:
        raise RuntimeError('Cannot reach Firebase Authentication. Existing identity settings were not overwritten.')
    env['TF_VAR_manage_identity'] = 'true'
    if current is None:
        return  # Terraform initializes Identity Platform on the new project.
    domains = sorted(set(current.get('authorizedDomains', []) + [PROJECT + '.web.app', PROJECT + '.firebaseapp.com']))
    env['TF_VAR_identity_authorized_domains'] = json.dumps(domains)
    mfa = current.get('mfa', {})
    env['TF_VAR_identity_mfa_state'] = 'MANDATORY' if mfa.get('state') == 'MANDATORY' else 'ENABLED'
    env['TF_VAR_identity_mfa_providers'] = json.dumps(mfa.get('enabledProviders', []))
    if any('totpProviderConfig' not in item for item in mfa.get('providerConfigs', [])):
        raise RuntimeError('An unfamiliar MFA provider is configured. Review its Terraform mapping before changing identity settings.')
    if 'google_identity_platform_config.authentication[0]' not in tf(['state', 'list'], env).splitlines():
        tf(['import', '-input=false', 'google_identity_platform_config.authentication[0]', f'projects/{PROJECT}/config'], env)


def wait_ready(url):
    for _ in range(36):
        try:
            with urllib.request.urlopen(url + '/api/v1/health', timeout=10) as response:
                if json.load(response).get('status') == 'ok':
                    return
        except Exception:
            pass
        time.sleep(5)
    raise RuntimeError(f'Database readiness did not pass at {url}. Inspect the active revision before continuing.')


def deploy():
    # Firebase CLI's bearer-token transport needs an explicit ADC quota project.
    os.environ['GOOGLE_CLOUD_QUOTA_PROJECT'] = PROJECT
    for binary in [TERRAFORM, FIREBASE]:
        if not shutil.which(binary):
            raise RuntimeError(f'{binary} must be installed before applying.')
    # Verify Firebase authorization before provisioning paid infrastructure.
    projects = json.loads(run(FIREBASE, ['projects:list', '--json', '--non-interactive']))
    if not any(p.get('projectId') == PROJECT for p in projects.get('result', [])):
        raise RuntimeError('Firebase CLI is not authorized for incys-institute.')
    print('Enabling the required project services.')
    gc('services', 'enable', 'run.googleapis.com', 'sqladmin.googleapis.com',
       'secretmanager.googleapis.com', 'artifactregistry.googleapis.com',
       'cloudbuild.googleapis.com', 'logging.googleapis.com', 'iam.googleapis.com',
       'cloudresourcemanager.googleapis.com', 'cloudscheduler.googleapis.com',
       'firebase.googleapis.com', 'firebasehosting.googleapis.com',
       'identitytoolkit.googleapis.com', 'storage.googleapis.com', 'fcm.googleapis.com')
    buckets = json.loads(gc('storage', 'buckets', 'list', '--format=json'))
    if not any(b.get('name') == STATE_BUCKET for b in buckets):
        gc('storage', 'buckets', 'create', 'gs://' + STATE_BUCKET, '--location=' + REGION,
           '--uniform-bucket-level-access', '--public-access-prevention')
    gc('storage', 'buckets', 'update', 'gs://' + STATE_BUCKET, '--versioning', '--public-access-prevention')
    runtime = ensure_secret(RUNTIME_SECRET, 'incys_app')
    migration = ensure_secret(MIGRATION_SECRET, 'incys_migrator')
    private_dir = ROOT / '.deploy'
    private_dir.mkdir(mode=0o700, exist_ok=True)
    env = dict(os.environ)
    env.update({
        'TF_VAR_project_id': PROJECT, 'TF_VAR_region': REGION,
        'TF_VAR_container_image': f'{REGION}-docker.pkg.dev/{PROJECT}/incys/platform:initial',
        'TF_VAR_scanner_image': f'{REGION}-docker.pkg.dev/{PROJECT}/incys/scanner:initial',
        'TF_VAR_app_origin': ORIGIN, 'TF_VAR_database_url_secret': RUNTIME_SECRET,
        'TF_VAR_migration_database_url_secret': MIGRATION_SECRET,
        'TF_VAR_database_password': urllib.parse.unquote(urllib.parse.urlparse(migration).password),
        'TF_VAR_availability_type': os.environ.get('TF_VAR_availability_type','ZONAL'), 'TF_VAR_manage_identity': 'false',
        'TF_VAR_scheduler_paused': 'true',
    })
    tf(['init', '-input=false', '-reconfigure', '-backend-config=bucket=' + STATE_BUCKET,
        '-backend-config=prefix=incys/platform'], env)
    # One-time image/database foundation; no application revision is replaced here.
    apply_plan(env, ['google_artifact_registry_repository.images',
                    'google_artifact_registry_repository_iam_member.builder',
                    'google_storage_bucket_iam_member.build_source',
                    'google_project_iam_member.build_logs',
                    'google_sql_user.application', 'google_sql_database.application',
                    'google_storage_bucket.private'])
    print('Building the versioned application image in Cloud Build.')
    build = json.loads(gc('builds', 'submit', '--config=cloudbuild.yaml', '--format=json', '--async',
                         '--region='+REGION,
                         '--service-account=projects/'+PROJECT+'/serviceAccounts/incys-builder@'+PROJECT+'.iam.gserviceaccount.com',
                         '--gcs-source-staging-dir=gs://'+PROJECT+'-incys-build-source/source', '.'))
    build_id = build['id']
    print(f'Cloud Build started: {build_id}')
    for _ in range(260):
        build = json.loads(gc('builds', 'describe', build_id, '--region=' + REGION, '--format=json'))
        if build.get('status') == 'SUCCESS':
            break
        if build.get('status') in ['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']:
            raise RuntimeError(f'Cloud Build {build_id} ended with {build["status"]}. Inspect build logs before retrying.')
        time.sleep(5)
    else:
        raise RuntimeError(f'Cloud Build {build_id} has not completed. Inspect it before starting another build.')
    env['TF_VAR_container_image'] = f'{REGION}-docker.pkg.dev/{PROJECT}/incys/platform:{build["id"]}'
    env['TF_VAR_scanner_image'] = f'{REGION}-docker.pkg.dev/{PROJECT}/incys/scanner:{build["id"]}'
    configure_identity(env)
    print('Applying Cloud Run, identity, database access and scheduled jobs.')
    apply_plan(env)
    gc('run', 'jobs', 'execute', 'incys-migrate', '--region=' + REGION, '--wait')
    gc('run', 'jobs', 'execute', 'incys-worker', '--region=' + REGION, '--wait')
    backend = tf(['output', '-raw', 'application_url'], env)
    wait_ready(backend)
    print('Database ready; publishing Firebase Hosting.')
    run(FIREBASE, ['deploy', '--only', 'hosting', '--project', PROJECT, '--non-interactive'])
    wait_ready(ORIGIN)
    run('node', ['scripts/live-check.mjs'])
    gc('scheduler', 'jobs', 'resume', 'incys-outbox-and-reservations', '--location=' + REGION)
    (private_dir / 'deployment.json').write_text(json.dumps({'project':PROJECT,'buildId':build['id'],'url':ORIGIN,'backend':backend},indent=2))
    print('Published ' + ORIGIN + '. Complete authenticated end-to-end acceptance before launch.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Provision paid GCP services and publish Hosting.')
    args = parser.parse_args()
    try:
        policy = json.loads((ROOT / 'config' / 'deployment.json').read_text())
        if args.apply and policy.get('billingPlan') != 'blaze':
            raise RuntimeError('Deployment paused: this project must stay on Spark. Cloud Run and Cloud SQL require Blaze. No resources were provisioned.')
        preflight()
        if args.apply:
            deploy()
        else:
            print('Read-only preflight complete. Use --apply for the authorized deployment.')
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
