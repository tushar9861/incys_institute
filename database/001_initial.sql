CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text UNIQUE,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  password_hash text,
  roles text[] NOT NULL DEFAULT '{patient}',
  active boolean NOT NULL DEFAULT true,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, reset_at timestamptz NOT NULL);
CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL, version text NOT NULL, granted boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category text NOT NULL,
  description text NOT NULL DEFAULT '', duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
  price_paise integer NOT NULL CHECK (price_paise >= 0), active boolean NOT NULL DEFAULT true
);
CREATE TABLE practitioner_services (
  practitioner_id uuid NOT NULL REFERENCES users(id), service_id uuid NOT NULL REFERENCES services(id),
  PRIMARY KEY(practitioner_id, service_id)
);
CREATE TABLE availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practitioner_id uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  UNIQUE(practitioner_id, starts_at)
);
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES users(id),
  practitioner_id uuid NOT NULL REFERENCES users(id), service_id uuid NOT NULL REFERENCES services(id),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','completed','cancelled','no_show')),
  mode text NOT NULL DEFAULT 'in_person' CHECK (mode IN ('in_person','online')),
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  payment_status text NOT NULL DEFAULT 'due' CHECK (payment_status IN ('due','paid','refunded')),
  meeting_url text, created_at timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (practitioner_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status = 'confirmed'),
  EXCLUDE USING gist (patient_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status = 'confirmed')
);
CREATE INDEX appointments_patient_idx ON appointments(patient_id,starts_at);
CREATE TABLE clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL REFERENCES appointments(id),
  author_id uuid NOT NULL REFERENCES users(id), body text NOT NULL,
  supersedes_id uuid REFERENCES clinical_notes(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES users(id),
  practitioner_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, instructions text NOT NULL,
  sessions_total integer NOT NULL CHECK (sessions_total BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE treatment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES treatment_plans(id),
  author_id uuid NOT NULL REFERENCES users(id), note text NOT NULL, performed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, category text NOT NULL,
  description text NOT NULL, duration text NOT NULL, fee_paise integer NOT NULL CHECK (fee_paise >= 0),
  award_type text NOT NULL DEFAULT 'Institute completion certificate',
  published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE course_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES courses(id),
  version integer NOT NULL DEFAULT 1, syllabus text NOT NULL DEFAULT '',
  UNIQUE(course_id,version)
);
CREATE TABLE cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES course_versions(id),
  name text NOT NULL, trainer_id uuid NOT NULL REFERENCES users(id), capacity integer NOT NULL CHECK (capacity > 0),
  starts_at timestamptz NOT NULL, attendance_required integer NOT NULL DEFAULT 75 CHECK (attendance_required BETWEEN 0 AND 100)
);
CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES course_versions(id),
  title text NOT NULL, content text NOT NULL DEFAULT '', resource_url text,
  position integer NOT NULL DEFAULT 0, required boolean NOT NULL DEFAULT true
);
CREATE TABLE enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES users(id),
  cohort_id uuid NOT NULL REFERENCES cohorts(id), status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','active','completed','withdrawn')),
  fee_paise integer NOT NULL CHECK (fee_paise >= 0), paid_paise integer NOT NULL DEFAULT 0 CHECK (paid_paise >= 0 AND paid_paise <= fee_paise),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(student_id,cohort_id)
);
CREATE TABLE lesson_progress (
  enrolment_id uuid NOT NULL REFERENCES enrolments(id), lesson_id uuid NOT NULL REFERENCES lessons(id),
  completed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(enrolment_id,lesson_id)
);
CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL REFERENCES cohorts(id),
  title text NOT NULL, starts_at timestamptz NOT NULL, duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  meeting_url text, status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled'))
);
CREATE TABLE attendance (
  class_id uuid NOT NULL REFERENCES class_sessions(id), student_id uuid NOT NULL REFERENCES users(id),
  present boolean NOT NULL, recorded_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(class_id,student_id)
);
CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL REFERENCES cohorts(id),
  title text NOT NULL, instructions text NOT NULL, due_at timestamptz NOT NULL,
  max_score integer NOT NULL CHECK (max_score > 0), pass_score integer NOT NULL CHECK (pass_score >= 0 AND pass_score <= max_score)
);
CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES assignments(id),
  student_id uuid NOT NULL REFERENCES users(id), body text NOT NULL,
  score integer CHECK (score >= 0), feedback text, graded_by uuid REFERENCES users(id), submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id,student_id)
);
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrolment_id uuid NOT NULL UNIQUE REFERENCES enrolments(id),
  serial text NOT NULL UNIQUE, issued_by uuid NOT NULL REFERENCES users(id),
  issued_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, revocation_reason text
);
CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL UNIQUE REFERENCES users(id),
  name text NOT NULL, description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
  commission_bps integer NOT NULL DEFAULT 500 CHECK (commission_bps BETWEEN 0 AND 10000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES vendors(id),
  name text NOT NULL, category text NOT NULL, description text NOT NULL,
  price_paise integer NOT NULL CHECK (price_paise > 0), stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','archived')),
  regulated boolean NOT NULL DEFAULT false, licence_reference text,
  batch text, expires_on date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES users(id),
  total_paise integer NOT NULL CHECK (total_paise > 0), address jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','processing','completed','cancelled','refunded')),
  idempotency_key text NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(customer_id,idempotency_key)
);
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
  product_id uuid NOT NULL REFERENCES products(id), vendor_id uuid NOT NULL REFERENCES vendors(id),
  product_name text NOT NULL, quantity integer NOT NULL CHECK (quantity > 0),
  unit_paise integer NOT NULL CHECK (unit_paise > 0), commission_paise integer NOT NULL CHECK (commission_paise >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','shipped','delivered','cancelled','refunded')),
  tracking_reference text, UNIQUE(order_id,product_id)
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  reference_type text NOT NULL CHECK (reference_type IN ('order','appointment','enrolment')),
  reference_id uuid NOT NULL, amount_paise integer NOT NULL CHECK (amount_paise > 0), currency text NOT NULL DEFAULT 'INR',
  provider_order_id text UNIQUE, provider_payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','captured','refunded','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_events (event_id text PRIMARY KEY, payment_id uuid NOT NULL REFERENCES payments(id), processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id),
  account text NOT NULL, amount_paise integer NOT NULL, reference_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(payment_id,account,reference_id)
);
CREATE TABLE enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL, interest text NOT NULL,
  message text NOT NULL, status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','resolved','closed')),
  assigned_to uuid REFERENCES users(id), follow_up_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  subject text NOT NULL, message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  response text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL,
  audience text NOT NULL DEFAULT 'public', published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL, body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action text NOT NULL,
  resource_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL, aggregate_id text NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox(next_attempt_at) WHERE published_at IS NULL;
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only record'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER notes_immutable BEFORE UPDATE OR DELETE ON clinical_notes FOR EACH ROW EXECUTE FUNCTION reject_mutation();
