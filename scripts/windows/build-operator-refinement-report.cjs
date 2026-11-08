const fs=require('node:fs'),path=require('node:path');
const out=path.resolve('artifacts/cloud-release/operator-refinement');
const images=fs.readdirSync(out).filter(n=>n.endsWith('.png')&&!n.startsWith('live-')).sort();
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Operatör doğrulaması</title><style>body{font:16px system-ui;margin:24px;color:#20364f;background:#f5f7fb}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:390px}img{width:100%;border-radius:14px}figcaption{padding:12px 0}</style><h1>Operatör — son yerel doğrulama</h1><p>Yerel tarayıcı testleri. Canlı yayın ve gerçek telefon kabulü henüz tamamlanmadı.</p><main>'+images.map(n=>'<figure><figcaption>'+n+'</figcaption><a href="'+n+'"><img loading="lazy" src="'+n+'"></a></figure>').join('')+'</main>');
console.log('Latest UI gallery: '+images.length+' screenshots.');
