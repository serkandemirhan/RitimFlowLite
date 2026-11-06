-- Queue/count plans may start from an operation or a work order. Supply the
-- matching leading keys rather than scanning tenant-wide composite indexes.
CREATE INDEX work_orders_operation_discovery ON work_orders(tenant_id,site_id,operation_id,id) INCLUDE(order_id);
CREATE INDEX production_events_work_order_discovery ON production_events(tenant_id,site_id,work_order_id,id) INCLUDE(kind,quantity_pieces);
