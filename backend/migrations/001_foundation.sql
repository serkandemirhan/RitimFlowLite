-- B01 baseline: relational ownership and numeric constraints, not complete MES business rules.
CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sites (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  code text NOT NULL CHECK (length(trim(code)) > 0),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,code)
);
CREATE TABLE users (
  id uuid PRIMARY KEY,
  issuer text NOT NULL, subject text NOT NULL,
  display_name text NOT NULL,
  disabled_at timestamptz,
  UNIQUE (issuer,subject)
);
CREATE TABLE site_memberships (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('manager','operator','quality','logistics','viewer')),
  PRIMARY KEY (tenant_id,site_id,user_id,role),
  FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE TABLE orders (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL,
  order_number text NOT NULL, customer text NOT NULL, part_number text NOT NULL,
  ordered_qty bigint NOT NULL CHECK (ordered_qty BETWEEN 1 AND 9007199254740991),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','cancelled','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,order_number),
  FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE TABLE operations (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, order_id uuid NOT NULL, id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0), name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('internal','external')),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,order_id,sequence),
  UNIQUE (tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id)
);
CREATE TABLE machines (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, code text NOT NULL,
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,code),
  FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE TABLE work_orders (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, operation_id uuid NOT NULL,
  work_order_number text NOT NULL, planned_qty bigint NOT NULL CHECK (planned_qty BETWEEN 1 AND 9007199254740991),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','running','paused','complete','cancelled')),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,work_order_number),
  UNIQUE (tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,operation_id) REFERENCES operations(tenant_id,site_id,order_id,id)
);
CREATE TABLE work_assignments (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, work_order_id uuid NOT NULL,
  machine_id uuid, user_id uuid REFERENCES users(id), assigned_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz,
  reason text,
  CHECK (machine_id IS NOT NULL OR user_id IS NOT NULL), CHECK (released_at IS NULL OR released_at >= assigned_at),
  PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,machine_id) REFERENCES machines(tenant_id,site_id,id)
);
CREATE UNIQUE INDEX one_active_machine_assignment ON work_assignments(tenant_id,site_id,machine_id) WHERE released_at IS NULL AND machine_id IS NOT NULL;
CREATE TABLE lots (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL,
  lot_code text NOT NULL, kind text NOT NULL CHECK (kind IN ('material','operation','finished','returned','rework')),
  originating_lot_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,lot_code),
  UNIQUE (tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,originating_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE material_receipts (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, lot_id uuid NOT NULL,
  supplier text NOT NULL, document_ref text NOT NULL, quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991),
  source_quantity numeric(24,8) NOT NULL CHECK (source_quantity > 0 AND source_quantity <> 'NaN'::numeric), source_unit text NOT NULL CHECK (source_unit IN ('piece','kg','m','bar')),
  conversion_factor numeric(24,8) NOT NULL CHECK (conversion_factor > 0 AND conversion_factor <> 'NaN'::numeric), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,document_ref),
  FOREIGN KEY (tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE reservations (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, work_order_id uuid NOT NULL, lot_id uuid NOT NULL,
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991), status text NOT NULL CHECK (status IN ('active','released','consumed')),
  PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE physical_transfers (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, lot_id uuid NOT NULL,
  source_work_order_id uuid NOT NULL, destination_work_order_id uuid NOT NULL,
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991),
  status text NOT NULL CHECK (status IN ('in_transit','accepted','reversed')), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_work_order_id <> destination_work_order_id), PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,source_work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,destination_work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE transfer_events (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, transfer_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('sent','accepted','reversed')), occurred_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,transfer_id,event_type),
  FOREIGN KEY (tenant_id,site_id,transfer_id) REFERENCES physical_transfers(tenant_id,site_id,id)
);
CREATE TABLE production_events (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, work_order_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('good','scrap','setup_scrap','pending','rework')),
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991), actor_id uuid NOT NULL REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), FOREIGN KEY (tenant_id,site_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,id)
);
CREATE TABLE quality_decisions (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, work_order_id uuid, lot_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('inspection','final_release','return_disposition')),
  outcome text NOT NULL CHECK (outcome IN ('approved','rejected','rework','scrap','quarantine')),
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991),
  actor_id uuid NOT NULL REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE rework_tasks (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, quality_decision_id uuid NOT NULL,
  work_order_id uuid NOT NULL, source_lot_id uuid NOT NULL,
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991),
  status text NOT NULL CHECK (status IN ('open','in_progress','complete','cancelled')),
  PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,quality_decision_id) REFERENCES quality_decisions(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,work_order_id) REFERENCES work_orders(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,source_lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE external_dispatches (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, operation_id uuid NOT NULL, lot_id uuid NOT NULL,
  supplier text NOT NULL, due_at timestamptz, quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,operation_id) REFERENCES operations(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE external_returns (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, dispatch_id uuid NOT NULL,
  good_qty bigint NOT NULL CHECK (good_qty BETWEEN 0 AND 9007199254740991), scrap_qty bigint NOT NULL CHECK (scrap_qty BETWEEN 0 AND 9007199254740991),
  rework_qty bigint NOT NULL CHECK (rework_qty BETWEEN 0 AND 9007199254740991), lost_qty bigint NOT NULL CHECK (lost_qty BETWEEN 0 AND 9007199254740991),
  CHECK (good_qty::numeric+scrap_qty+rework_qty+lost_qty BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,dispatch_id) REFERENCES external_dispatches(tenant_id,site_id,order_id,id)
);
CREATE TABLE shipments (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, lot_id uuid NOT NULL, release_id uuid NOT NULL,
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991), document_ref text NOT NULL, shipped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,order_id,id), UNIQUE (tenant_id,site_id,document_ref),
  FOREIGN KEY (tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,release_id) REFERENCES quality_decisions(tenant_id,site_id,order_id,id)
);
CREATE TABLE customer_returns (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, shipment_id uuid NOT NULL,
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991), reason text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,shipment_id) REFERENCES shipments(tenant_id,site_id,order_id,id)
);
CREATE TABLE stock_movements (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, lot_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('receipt','allocation','production','transfer','quality','dispatch','shipment','return','adjustment')),
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991),
  source_location text, destination_location text, actor_id uuid NOT NULL REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_location IS NOT NULL OR destination_location IS NOT NULL), PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,lot_id) REFERENCES lots(tenant_id,site_id,order_id,id)
);
CREATE TABLE drawing_revisions (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL,
  revision text NOT NULL, object_key text NOT NULL, sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), UNIQUE (tenant_id,site_id,order_id,revision),
  FOREIGN KEY (tenant_id,site_id,order_id) REFERENCES orders(tenant_id,site_id,id)
);
CREATE TABLE idempotency_records (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), key text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'), status text NOT NULL CHECK (status IN ('pending','completed')),
  response_status integer CHECK (response_status BETWEEN 100 AND 599), response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,actor_id,key), FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id),
  CHECK ((status='pending' AND response_status IS NULL) OR (status='completed' AND response_status IS NOT NULL))
);
CREATE TABLE audit_events (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,site_id,id), FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE TABLE compensations (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, source_decision_id uuid NOT NULL,
  quantity_pieces bigint NOT NULL CHECK (quantity_pieces BETWEEN 1 AND 9007199254740991), reason text NOT NULL,
  PRIMARY KEY (tenant_id,site_id,id),
  FOREIGN KEY (tenant_id,site_id,order_id,source_decision_id) REFERENCES quality_decisions(tenant_id,site_id,order_id,id)
);
-- Historical entries are append-only, including corrections represented as new records.
CREATE FUNCTION prevent_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'history records are append-only' USING ERRCODE = '55000'; END;
$$;
CREATE TRIGGER production_history_immutable BEFORE UPDATE OR DELETE ON production_events FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER transfer_history_immutable BEFORE UPDATE OR DELETE ON transfer_events FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER stock_history_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER audit_history_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
