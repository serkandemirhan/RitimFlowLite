'use strict';
const {fail}=require('./orders-planning');
function values(b){if(b.materialSupplier===undefined&&b.subcontractor===undefined)return {};if(typeof b.materialSupplier!=='boolean'||typeof b.subcontractor!=='boolean'||!b.materialSupplier&&!b.subcontractor)fail(400,'SUPPLIER_TYPE_REQUIRED','En az bir tedarikçi türü seçin');return {materialSupplier:b.materialSupplier,subcontractor:b.subcontractor}}
async function requireSubcontractor(c,s,id){const r=await c.query('SELECT id FROM outsourcing_suppliers WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND subcontractor FOR SHARE',[s.tenantId,s.siteId,id]);if(!r.rowCount)fail(409,'SUBCONTRACTOR_REQUIRED','Fason üretim tedarikçisi seçin')}
module.exports={values,requireSubcontractor};
