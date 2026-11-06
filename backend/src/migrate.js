'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadConfig}=require('./config');
const {createPool,inTransaction}=require('./db');
const dir=path.join(__dirname,'..','migrations');
async function migrate(pool) {
  return inTransaction(pool,async client=>{
    // One lock serializes schema bootstrap and all version checks; released at transaction end.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ritim-mes-migrations-v1'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const files=fs.readdirSync(dir).filter(f=>/^\d+_[a-z0-9_]+\.sql$/.test(f)).sort();
    const seen=new Set(),applied=[];
    for(const file of files){
      const version=file.split('_')[0]; if(seen.has(version)) throw Error('Duplicate migration version');seen.add(version);
      const sql=fs.readFileSync(path.join(dir,file),'utf8'),validHashes=require('./migration-checksum').checksums(sql),hash=validHashes[0];
      const current=await client.query('SELECT checksum FROM schema_migrations WHERE version=$1',[version]);
      if(current.rowCount){if(!validHashes.includes(current.rows[0].checksum))throw Error('Applied migration checksum mismatch: '+version);continue;}
      await client.query(sql);await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[version,hash]);applied.push(version);
    }
    const known=await client.query('SELECT version FROM schema_migrations');
    if(known.rows.some(r=>!seen.has(r.version))) throw Error('Database has unknown migration version');
    return applied;
  });
}
if(require.main===module){const pool=createPool(loadConfig());migrate(pool).then(v=>console.log('Applied migrations:',v.length?v.join(', '):'none')).catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1;}).finally(()=>pool.end());}
module.exports={migrate};
