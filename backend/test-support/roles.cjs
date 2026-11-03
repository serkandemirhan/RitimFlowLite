'use strict';
const crypto = require('node:crypto');

// Real logins on SCRAM-enabled PostgreSQL, without sharing the bootstrap password.
function roleConnections(databaseUrl) {
  const passwords = new Map();
  function roleUrl(role) {
    if (!passwords.has(role)) throw Error('Test role must be provisioned before connecting');
    const url = new URL(databaseUrl);
    url.searchParams.delete('user');
    url.searchParams.delete('password');
    url.username = role;
    url.password = passwords.get(role);
    return url.toString();
  }
  async function createRole(admin, role) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw Error('Invalid test role');
    const password = crypto.randomBytes(32).toString('hex');
    await admin.query(`CREATE ROLE "${role}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    passwords.set(role, password);
  }
  return {roleUrl, createRole};
}
module.exports = {roleConnections};
