ALTER TABLE submissions ADD COLUMN document_id uuid REFERENCES documents(id);
CREATE INDEX submissions_document_id ON submissions(document_id) WHERE document_id IS NOT NULL;
