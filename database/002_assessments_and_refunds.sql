CREATE TABLE quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL REFERENCES cohorts(id),
  title text NOT NULL, duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 240),
  pass_percent integer NOT NULL CHECK(pass_percent BETWEEN 0 AND 100),
  max_attempts integer NOT NULL DEFAULT 2 CHECK(max_attempts BETWEEN 1 AND 10),
  questions jsonb NOT NULL, published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quiz_id uuid NOT NULL REFERENCES quizzes(id),
  student_id uuid NOT NULL REFERENCES users(id), started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, submitted_at timestamptz, answers jsonb, score integer, passed boolean
);
CREATE UNIQUE INDEX quiz_attempt_active_idx ON quiz_attempts(quiz_id,student_id) WHERE submitted_at IS NULL;
CREATE TABLE refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
  requested_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','provider_pending','processed','rejected')),
  approved_by uuid REFERENCES users(id), provider_refund_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE TABLE privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK(request_type IN ('access','correction','erasure')),
  message text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','completed','declined')),
  response text, reviewed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE device_tokens (
  token text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
