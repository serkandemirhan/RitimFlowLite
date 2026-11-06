-- Indexed lookup paths for paged quality and repair discovery.
CREATE INDEX production_events_quality_queue ON production_events(tenant_id,site_id,id)
 INCLUDE(work_order_id,quantity_pieces) WHERE kind IN ('good','pending');
CREATE INDEX output_dispositions_rework_queue ON output_dispositions(tenant_id,site_id,id)
 INCLUDE(order_id,work_order_id,quantity_pieces) WHERE outcome='rework';
CREATE INDEX rework_allocations_decision_queue ON rework_allocations(tenant_id,site_id,decision_id,id) INCLUDE(quantity_pieces);
CREATE INDEX rework_releases_allocation_queue ON rework_allocation_releases(tenant_id,site_id,allocation_id) INCLUDE(quantity_pieces);
