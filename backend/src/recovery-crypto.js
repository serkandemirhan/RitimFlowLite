'use strict';
// Encryption keys are provisioned independently of the database and never sent to the browser.
const crypto = require('node:crypto');
const {canonical} = require('./command');
const ALGORITHM = 'aes-256-gcm';
const MAX_BYTES = 32768;
function createRecoveryCipher(encodedKey) {
  if (typeof encodedKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) throw new Error('RECOVERY_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) throw new Error('Invalid recovery key');
  function associated(context) {
    const {actorId,tenantId,siteId,commandId,fingerprint,keyVersion} = context || {};
    if (![actorId,tenantId,siteId,commandId,fingerprint,keyVersion].every(x => typeof x === 'string' && x.length > 0 && x.length <= 200)) throw new Error('Invalid recovery context');
    return Buffer.from(canonical({actorId,tenantId,siteId,commandId,fingerprint,keyVersion}));
  }
  return Object.freeze({
    encrypt(body, context) {
      const plaintext = Buffer.from(canonical(body));
      if (plaintext.length > MAX_BYTES) throw new Error('Recovery payload too large');
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      cipher.setAAD(associated(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return {iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
    },
    decrypt(envelope, context) {
      try {
        const iv=Buffer.from(envelope.iv,'base64'), tag=Buffer.from(envelope.tag,'base64'), ciphertext=Buffer.from(envelope.ciphertext,'base64');
        if(iv.length!==12 || tag.length!==16 || ciphertext.length>MAX_BYTES)throw new Error('Invalid envelope');
        const decipher=crypto.createDecipheriv(ALGORITHM,key,iv);decipher.setAAD(associated(context));decipher.setAuthTag(tag);
        return JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
      } catch (_) {throw new Error('Recovery data cannot be authenticated');}
    }
  });
}
module.exports={createRecoveryCipher,MAX_BYTES};
