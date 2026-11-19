'use strict';
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
// Deployed 071-073 had mixed LF/CRLF endings before Git normalized them.
// Bind each recorded checksum to its exact canonical SQL, never its filename.
const historical=new Map([
 // The owner-executed 077 script was generated from mixed Windows line endings.
 ['494723db3b538391de2ce6e6a5fa8c0060983f9d40a6cade5132fb37059edf49','70d6ec6605771c0a3ee32c88af32dd797f1063f00f3b6834c4f59814d580f52d'],
 ['a425562aa0e42b945f4d5d47a248995e1cf2d638b56964afdfdd898cd9936c08','8385cd9bb3d304ce6b0b59ede4d91d756301b59f90bd8aaa60f07c100ff45e82'],
 ['3213796aa6ca9d3fe61dbadf3937854d97d03249d1424e8f74df341a1a565125','fd4023d23e8cdc46892ecd9f271cf4f257e661696f042b8521eb8307927e534a'],
 ['eaf2b9f274a257a2bf5c452e440823e82e319227c9627d5030ed2bd76bf78d01','b672162c2bb0f0811f70a524dcd7f9d2c1a89d9a705b463af525142ae32fe37b'],
]);
function checksums(sql){const original=String(sql),lf=original.replace(/\r\n/g,'\n'),canonical=hash(lf),recorded=historical.get(canonical);return [...new Set([hash(original),canonical,hash(lf.replace(/\n/g,'\r\n')),...recorded?[recorded]:[]])];}
module.exports={checksums};
