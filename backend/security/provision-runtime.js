'use strict';
// Execute using a controlled schema owner/provisioner after migrations. Role/login is created out of band.
const quote=s=>'"'+s.replace(/"/g,'""')+'"';
async function provisionRuntime(client,schema,role,{isolatedDevelopment=false}={}) {
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)||!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw Error('Invalid identifier');
 const r=await client.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolinherit FROM pg_roles WHERE rolname=$1',[role]);
 if(r.rowCount!==1||Object.values(r.rows[0]).some(Boolean))throw Error('Runtime role must exist and be NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB, NOREPLICATION');
 if((await client.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',[role])).rowCount)throw Error('Runtime role must not have role memberships');
 const owned=await client.query('SELECT 1 FROM pg_namespace WHERE nspname=$1 AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=$2)',[schema,role]);if(owned.rowCount)throw Error('Runtime role must not own schema');
 const objectOwnership=await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname=$1 AND r.rolname=$2 UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname=$1 AND r.rolname=$2`,[schema,role]);
 if(objectOwnership.rowCount)throw Error('Runtime role must not own schema objects');
 const s=quote(schema),u=quote(role);
 await client.query(`REVOKE CREATE ON SCHEMA ${s} FROM PUBLIC, ${u}`);
 await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM PUBLIC, ${u}`);
 await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${s} FROM PUBLIC, ${u}`);
 await client.query(`GRANT USAGE ON SCHEMA ${s} TO ${u}`);
 await client.query(`GRANT EXECUTE ON FUNCTION ${s}.ritim_identity(text,text),${s}.ritim_memberships(uuid),${s}.ritim_open_scope(uuid,uuid,uuid),${s}.ritim_scope_matches(uuid,uuid),${s}.ritim_schema_versions(),${s}.ritim_lock_assignments(uuid,uuid,uuid),${s}.ritim_lock_active_operator(uuid,uuid,uuid),${s}.ritim_eligible_operators(uuid,uuid) TO ${u}`);
 await client.query(`GRANT SELECT ON ${s}.orders,${s}.operations,${s}.machines,${s}.work_orders,${s}.work_assignments,${s}.lots,${s}.material_receipts,${s}.reservations,${s}.physical_transfers,${s}.transfer_events,${s}.production_events,${s}.quality_decisions,${s}.rework_tasks,${s}.external_dispatches,${s}.external_returns,${s}.shipments,${s}.customer_returns,${s}.stock_movements,${s}.drawing_revisions,${s}.audit_events,${s}.compensations,${s}.flow_transfers,${s}.physical_ledger,${s}.production_ledger,${s}.output_dispositions,${s}.production_output_lots,${s}.output_reservation_events,${s}.operation_dispatches,${s}.operation_receipts,${s}.demo_material_sources,${s}.drawing_publications,${s}.drawing_acknowledgements,${s}.drawing_documents TO ${u}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE ON ${s}.idempotency_records TO ${u}`);
 await client.query(`GRANT SELECT,INSERT ON ${s}.pending_recovery_commands TO ${u}; GRANT UPDATE (status,updated_at) ON ${s}.pending_recovery_commands TO ${u}`);
 await client.query(`GRANT SELECT,INSERT ON ${s}.recovery_workflow_revisions TO ${u}`);
 if(isolatedDevelopment)await client.query(`GRANT SELECT,INSERT ON ${s}.shipping_orders,${s}.shipping_events TO ${u}; GRANT USAGE ON SEQUENCE ${s}.shipping_events_sequence_seq TO ${u}`);
 if(isolatedDevelopment)await client.query(`GRANT SELECT,INSERT ON ${s}.inventory_materials,${s}.inventory_locations,${s}.inventory_lots,${s}.inventory_movements,${s}.inventory_picks TO ${u}`);
 if(isolatedDevelopment)await client.query(`GRANT USAGE ON SEQUENCE ${s}.output_reservation_events_event_sequence_seq,${s}.drawing_publications_sequence_seq TO ${u}; GRANT INSERT ON ${s}.drawing_revisions TO ${u}; GRANT INSERT ON ${s}.orders TO ${u}; GRANT UPDATE (order_number) ON ${s}.orders TO ${u}; GRANT UPDATE (status) ON ${s}.work_orders TO ${u}; GRANT UPDATE (released_at) ON ${s}.work_assignments TO ${u}; GRANT INSERT ON ${s}.operations,${s}.work_orders,${s}.audit_events,${s}.flow_transfers,${s}.physical_ledger,${s}.production_events,${s}.production_ledger,${s}.output_dispositions,${s}.production_output_lots,${s}.output_reservation_events,${s}.work_assignments,${s}.lots,${s}.operation_dispatches,${s}.operation_receipts,${s}.material_receipts,${s}.reservations,${s}.demo_material_sources,${s}.drawing_publications,${s}.drawing_acknowledgements,${s}.drawing_documents TO ${u}`);
}
module.exports={provisionRuntime};
if(require.main===module){const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});pool.connect().then(async c=>{try{await c.query('BEGIN');const {loadConfig}=require('../src/config');const config=loadConfig();await provisionRuntime(c,process.env.RITIM_DB_SCHEMA,process.env.RITIM_RUNTIME_ROLE,{isolatedDevelopment:config.isolatedDevelopment});await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}).catch(e=>{console.error('Provision failed:',e.message);process.exitCode=1}).finally(()=>pool.end());}
