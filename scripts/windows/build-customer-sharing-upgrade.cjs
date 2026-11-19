'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(__dirname,'../../artifacts/cloud-setup/supabase-upgrade-078.sql');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,require('../../backend/security/customer-sharing-upgrade').upgradeSql());
console.log('Generated:',target);
