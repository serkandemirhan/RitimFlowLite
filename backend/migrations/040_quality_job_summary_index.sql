-- The paged job list computes quality/repair summaries only for its selected
-- jobs; make each summary an indexed work-order lookup under the same RLS.
CREATE INDEX output_dispositions_work_order_discovery ON output_dispositions(tenant_id,site_id,work_order_id,id)
 INCLUDE(production_event_id,outcome,quantity_pieces);
