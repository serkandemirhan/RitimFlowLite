'use strict';
const fs=require('node:fs'),path=require('node:path');
const {upgradeSql}=require('../../backend/security/customer-portal-upgrade');
const directory=path.resolve(__dirname,'../../artifacts/cloud-setup');
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'supabase-upgrade-076.sql'),upgradeSql());
console.log('Prepared owner-executed 074 to 076 SQL. No database connection or mutation.');
