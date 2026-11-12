'use strict';
const {identifier,fail}=require('./orders-planning');
function values(b){const p={};if(b.materials!==undefined)p.materials=require('./order-item-materials').values(b.materials);if(b.cardType!==undefined){if(!['raw','semi','product'].includes(b.cardType))fail(400,'INVALID_INPUT','Kart türü geçersiz');p.cardType=b.cardType}if(b.stockUnitId!==undefined)p.stockUnitId=b.stockUnitId?identifier(b.stockUnitId):null;return p}
async function sync(c,s,row,p){
 const cardType=p.cardType??row.card_type??'product',unitId=p.stockUnitId===undefined?row.stock_unit_id:p.stockUnitId;
 if((cardType!=='product'||p.cardType!==undefined||p.stockUnitId!==undefined)&&!unitId)fail(400,'STOCK_UNIT_REQUIRED','Malzeme kartı için stok birimi seçin');
 let unit=null;if(unitId){unit=(await c.query('SELECT * FROM stock_units WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,unitId])).rows[0];if(!unit)fail(404,'NOT_FOUND','Stok birimi bulunamadı');if(!row.code)fail(400,'MATERIAL_CODE_REQUIRED','Stok kartında kod zorunludur')}
 const existing=(await c.query('SELECT id,unit_id FROM inventory_materials WHERE tenant_id=$1 AND site_id=$2 AND part_id=$3 FOR UPDATE',[s.tenantId,s.siteId,row.id])).rows[0];
 if(existing&&existing.unit_id!==unitId)fail(409,'UNIT_IMMUTABLE','Stok kartının birimi değiştirilemez; yeni kart açın');
 if(p.materials!==undefined){if(p.materials.some(m=>m.materialId===row.id))fail(400,'INVALID_INPUT','Bir kart kendisini malzeme olarak kullanamaz');const materials=await require('./order-item-materials').resolve(c,s,p.materials);await c.query('UPDATE master_parts SET default_materials=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,row.id,JSON.stringify(materials)]);row.default_materials=materials}
 await c.query('UPDATE master_parts SET card_type=$4,stock_unit_id=$5 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,row.id,cardType,unitId||null]);row.card_type=cardType;row.stock_unit_id=unitId||null;
 if(unit){if(existing)await c.query('UPDATE inventory_materials SET code=$4,description=$5 WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[s.tenantId,s.siteId,existing.id,row.code,row.name]);else await c.query('INSERT INTO inventory_materials(tenant_id,site_id,id,part_id,code,description,base_unit,unit_id,lot_tracking) VALUES($1,$2,$3,$3,$4,$5,$6,$7,true)',[s.tenantId,s.siteId,row.id,row.code,row.name,unit.code,unit.id])}
}
module.exports={values,sync};
