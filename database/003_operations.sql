CREATE TABLE event_inbox (event_id uuid PRIMARY KEY REFERENCES outbox(id), processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
  filename text NOT NULL, mime_type text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  storage_key text NOT NULL UNIQUE, purpose text NOT NULL CHECK(purpose IN ('patient_report','admission_document','assignment_attachment')),
  state text NOT NULL DEFAULT 'quarantined' CHECK(state IN ('quarantined','clean','rejected','deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
