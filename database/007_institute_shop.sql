-- INCYS is the retailer; historical marketplace orders retain their original ledger.
CREATE TABLE shop_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  legal_name text NOT NULL DEFAULT 'Institute for Nature Cure & Yogic Sciences',
  address text NOT NULL DEFAULT '', state_code text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  registration text NOT NULL DEFAULT 'pending' CHECK(registration IN ('pending','non_gst','regular','composition')),
  einvoice text NOT NULL DEFAULT 'unknown' CHECK(einvoice IN ('unknown','not_applicable','required')),
  signatory text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO shop_settings(id) VALUES(true);
ALTER TABLE products ADD COLUMN sku text NOT NULL DEFAULT '',
  ADD COLUMN hsn_code text NOT NULL DEFAULT '',
  ADD COLUMN gst_rate_bps integer NOT NULL DEFAULT 0 CHECK(gst_rate_bps BETWEEN 0 AND 10000),
  ADD COLUMN reorder_level integer NOT NULL DEFAULT 5 CHECK(reorder_level BETWEEN 0 AND 100000),
  ADD COLUMN unit text NOT NULL DEFAULT 'PCS';
CREATE UNIQUE INDEX product_vendor_sku ON products(vendor_id,lower(sku)) WHERE sku<>'';
ALTER TABLE vendors ADD COLUMN address text NOT NULL DEFAULT '', ADD COLUMN gstin text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN commerce_model text NOT NULL DEFAULT 'legacy_marketplace'
  CHECK(commerce_model IN ('legacy_marketplace','institute_retail')),
  ADD COLUMN tax_snapshot jsonb;
-- Keep the compatibility default for an older server during rollout/rollback.
-- The new checkout explicitly writes institute_retail with its tax snapshot.
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id),
  delta integer NOT NULL CHECK(delta<>0), balance integer NOT NULL CHECK(balance>=0),
  kind text NOT NULL CHECK(kind IN ('opening','reservation','release','adjustment','receipt','return')),
  reference text NOT NULL, reason text NOT NULL, actor_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_id,kind,reference)
);
CREATE INDEX stock_product_history ON stock_movements(product_id,created_at DESC);
INSERT INTO stock_movements(product_id,delta,balance,kind,reference,reason)
 SELECT id,stock,stock,'opening','migration-007','Opening balance at shop upgrade' FROM products WHERE stock>0;
CREATE TABLE supply_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES vendors(id),
  kind text NOT NULL CHECK(kind IN ('receipt','return')), reference text NOT NULL,
  document_date date NOT NULL, lines jsonb NOT NULL, total_paise integer NOT NULL CHECK(total_paise>0),
  source_id uuid REFERENCES supply_documents(id), note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id), idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(vendor_id,kind,reference)
);
CREATE INDEX supply_vendor_date ON supply_documents(vendor_id,created_at);
CREATE INDEX supply_source ON supply_documents(source_id) WHERE source_id IS NOT NULL;
CREATE TABLE supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES vendors(id),
  amount_paise integer NOT NULL CHECK(amount_paise<>0), reference text NOT NULL, paid_on date NOT NULL,
  note text NOT NULL DEFAULT '', reverses_id uuid UNIQUE REFERENCES supplier_payments(id),
  created_by uuid NOT NULL REFERENCES users(id), idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(vendor_id,reference),
  CHECK((amount_paise>0 AND reverses_id IS NULL) OR (amount_paise<0 AND reverses_id IS NOT NULL))
);
CREATE INDEX supplier_payment_history ON supplier_payments(vendor_id,created_at);
CREATE TABLE invoice_counters (
  financial_year text NOT NULL, kind text NOT NULL, last_number integer NOT NULL CHECK(last_number BETWEEN 1 AND 999999),
  PRIMARY KEY(financial_year,kind)
);
CREATE TABLE shop_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
  kind text NOT NULL CHECK(kind IN ('invoice','credit_note')),
  number text NOT NULL UNIQUE CHECK(length(number)<=16), financial_year text NOT NULL,
  original_id uuid REFERENCES shop_invoices(id), refund_id uuid UNIQUE REFERENCES refund_requests(id),
  document jsonb NOT NULL, total_paise integer NOT NULL CHECK(total_paise>0),
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invoice_per_order ON shop_invoices(order_id) WHERE kind='invoice';
CREATE INDEX invoice_order_history ON shop_invoices(order_id,created_at);
CREATE TRIGGER stock_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER supply_immutable BEFORE UPDATE OR DELETE ON supply_documents FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER supplier_payments_immutable BEFORE UPDATE OR DELETE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON shop_invoices FOR EACH ROW EXECUTE FUNCTION reject_mutation();
