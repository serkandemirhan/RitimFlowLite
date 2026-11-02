SELECT il.lot_code,ip.production_lot_id AS original_input,src.id AS original_output,od.outcome AS original_quality,d.id AS supplier_dispatch,r.id AS supplier_return,f.id AS final_output,se.id AS delivery,ra.id AS rma,rr.lot_id AS return_lot,rd.outcome AS return_disposition,ri.input_lot_id AS rework_input,rework.id AS rework_output, recheck.outcome AS reinspection,recheck.quantity_pieces AS rechecked_quantity
FROM gate4_4436602b03.inventory_lots il
JOIN gate4_4436602b03.inventory_movements im ON im.lot_id=il.id
JOIN gate4_4436602b03.inventory_picks ip ON ip.movement_id=im.id
JOIN gate4_4436602b03.production_output_lots src ON src.input_lot_id=ip.production_lot_id
JOIN gate4_4436602b03.output_dispositions od ON od.output_lot_id=src.id
JOIN gate4_4436602b03.outsourcing_dispatches d ON d.output_lot_id=src.id
JOIN gate4_4436602b03.outsourcing_returns r ON r.dispatch_id=d.id
JOIN gate4_4436602b03.production_output_lots f ON f.input_lot_id=r.input_lot_id
JOIN gate4_4436602b03.shipping_events se ON se.order_id=f.order_id AND se.output_lot_id=f.id AND se.event_type='deliver'
JOIN gate4_4436602b03.rma_authorizations ra ON ra.delivery_id=se.id
JOIN gate4_4436602b03.rma_receipts rr ON rr.rma_id=ra.id
JOIN gate4_4436602b03.rma_inspections i ON i.receipt_id=rr.id
JOIN gate4_4436602b03.rma_dispositions rd ON rd.inspection_id=i.id
JOIN gate4_4436602b03.rma_rework_inputs ri ON ri.disposition_id=rd.id AND ri.source_output_lot_id=f.id
JOIN gate4_4436602b03.production_output_lots rework ON rework.input_lot_id=ri.input_lot_id AND rework.work_order_id=ri.work_order_id
JOIN gate4_4436602b03.output_dispositions recheck ON recheck.output_lot_id=rework.id
WHERE il.lot_code='LOT-16761461';
