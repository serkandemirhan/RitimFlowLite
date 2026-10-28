'use strict';
class HttpError extends Error {constructor(status,code,message){super(message);this.statusCode=status;this.code=code;}}
// Only a verified server-side identity adapter may set request.auth. No headers are trusted here.
async function requireIdentity(request) {
  if (!request.auth || request.auth.verified !== true) throw new HttpError(401,'UNAUTHENTICATED','Authentication required');
}
module.exports={HttpError,requireIdentity};
