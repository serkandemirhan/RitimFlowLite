ALTER TABLE inventory_lots ADD COLUMN order_id uuid;
ALTER TABLE inventory_lots DROP CONSTRAINT inventory_lots_supplier_ref_check;
ALTER TABLE inventory_lots ADD CONSTRAINT inventory_lots_supplier_ref_check CHECK(length(trim(supplier_ref))<=120);
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_receipt_document;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_receipt_document CHECK(document_ref IS NULL OR length(trim(document_ref))<=120);
DROP INDEX inventory_receipt_document_idx;
CREATE UNIQUE INDEX inventory_receipt_document_idx ON inventory_movements(tenant_id,site_id,document_ref) WHERE kind='receipt' AND document_ref IS NOT NULL AND length(trim(document_ref))>0;
ALTER TABLE inventory_lots ADD CONSTRAINT inventory_lot_order FOREIGN KEY(tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id);
CREATE TABLE inventory_documents (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
 movement_id uuid, actor_id uuid NOT NULL, filename text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 5242880),
 sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id),
 FOREIGN KEY(tenant_id,site_id,movement_id) REFERENCES inventory_movements(tenant_id,site_id,id)
);
ALTER TABLE inventory_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY ritim_scope ON inventory_documents USING(ritim_scope_matches(tenant_id,site_id)) WITH CHECK(ritim_scope_matches(tenant_id,site_id));
