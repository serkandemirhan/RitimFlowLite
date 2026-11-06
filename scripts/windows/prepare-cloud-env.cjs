'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.join(process.env.LOCALAPPDATA,'RitimFlowLite','cloud'),file=path.join(dir,'ritimflow-test.env');
fs.mkdirSync(dir,{recursive:true});
let password;
if(fs.existsSync(file)){const text=fs.readFileSync(file,'utf8'),line=text.split(/\r?\n/).find(x=>x.startsWith('DATABASE_URL='));password=decodeURIComponent(new URL(line.slice(13)).password)}else{password=crypto.randomBytes(32).toString('base64url');fs.writeFileSync(file,[
'DB_SSL=verify','RITIM_ISOLATED_DEVELOPMENT=false','LOG_LEVEL=info',
'APP_ORIGIN=https://ritimflow-test.vercel.app','SUPABASE_URL=https://tgkmocdddrsqosvtocrr.supabase.co',
'SUPABASE_PUBLISHABLE_KEY=sb_publishable_ZRhLHWZSa7OopNGfLyV_KA_Sy8FxYwY',
'DATABASE_URL=postgresql://ritim_runtime.tgkmocdddrsqosvtocrr:'+password+'@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
'RECOVERY_ENCRYPTION_KEY='+crypto.randomBytes(32).toString('base64'),'RECOVERY_KEY_VERSION=cloud-v1',''].join('\n'),{mode:0o600})}
// Only the salted PostgreSQL verifier is emitted, never the password or environment file.
const salt=crypto.randomBytes(16),salted=crypto.pbkdf2Sync(password,salt,4096,32,'sha256'),client=crypto.createHmac('sha256',salted).update('Client Key').digest(),stored=crypto.createHash('sha256').update(client).digest('base64'),server=crypto.createHmac('sha256',salted).update('Server Key').digest('base64');
console.log("ALTER ROLE ritim_runtime LOGIN PASSWORD 'SCRAM-SHA-256$4096:"+salt.toString('base64')+'$'+stored+':'+server+"';");
