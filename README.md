# Ritim Flow Lite — UX-01–UX-07 (Entegre HTML5 demo)

## Demo v1.0 RC1 hazırlığı (27 Ekim 2026)

Güncel kapsam ve yayın engelleri: [RC1 release raporu](docs/RC1_RELEASE_REPORT.md), [asset manifest](docs/RC1_ASSET_MANIFEST.md), [gerçek mobil kabul](docs/MOBILE_ACCEPTANCE_CHECKLIST.md). Aşağıdaki eski kurulum/sınırlama notları tarihsel kayıttır; güncel release talimatı bu bölümdür. Mevcut veriyi sıfırlamayın ve depoyu bütünüyle yayınlamayın.

Node **22.20.0**, npm **10.9.3**, kilitli Playwright **1.64.1** kullanılır. Desteklenen işletim sisteminde temiz kurulum:

```sh
npm ci
npm run browser:install
npm test
npm run build:rc1
npm run verify:rc1
npm run test:smoke
npm run test:rc1
```

Linux CI kurulumu: `npx playwright install --with-deps chromium`; tüm kapılar: `npm run test:ci`. Testler geçici loopback sunucusu ve temiz profiller kullanır; gerçek demo origin'ine bağlanmaz. Sonuçlar her browser koşusunda ayrı `artifacts/` klasöründedir. `/tmp` kurulumu veya `NODE_PATH` gerekmez. Testler sıfır olmayan çıkışla başarısız olur; eksik suite/uygulama hatası da başarı sayılmaz.

macOS 13, bu Playwright sürümünün yönetilen Chromium kurulumunda desteklenmez. Desteklenen bir OS kullanın; mevcut yerel Chrome ile açık alternatif: `AUDIT_CHROME="/tam/yol/chrome" npm run test:ci`. Bu alternatif, Playwright'ın sabitlenmiş Chromium sürümüyle temiz CI doğrulamasının yerine geçmez.

`build:rc1` yalnız `release/rc1.config.json` listesini `dist/ritim-flow-lite-demo-v1.0-rc1/<SHA-256>/public/` içine kopyalar. JS/CSS içerik hash'li ve SRI kontrollüdür; manifest komşu `manifest.json` dosyasıdır. Dosyası değiştirilmiş bir candidate'ın üzerine yazılmaz. `dist/`, `node_modules/`, `artifacts/` Git'e dahil edilmez. Hiçbir build/test komutu deploy, staging, commit veya localStorage reset yapmaz.

CI, hem çalışma ağacını hem paketlenmiş uygulamayı sınar. Pages yapılandırmasında `deploy` doğrulamaya bağımlıdır; yalnız başarılı test işinin `rc1-public` artifact'ı yüklenir. Bu değişiklikler henüz GitHub'a gönderilmedi; canlı Pages yayını değişmedi. Gerçek cihaz kabulü ve candidate review olmadan yayın onayı yoktur.

## Önceki kurulum (tarihsel)
ZIP arşivinin içeriğini GitHub deposunun köküne yükleyin (yalnız `index.html` değil, `assets` ve `teknikResim.pdf` dahil). GitHub Pages main/root yayın ayarını doğrulayın. Canlı siteye yüklemeden önce dosyaların yedeğini alın.

## UX-07 güncellemeleri
- Üretim fiziksel teslimi artık **UX-06 iş emri malzeme tahsisi** üst sınırını doğrular. Malzeme kabul + iş emrine tahsis yapılmadan yeni fiziksel teslim yapılamaz.
- Fason gönderimi yalnızca iş emrine tahsis edilmiş **ve UX-05 üzerinde yeni sağlam kayıt olarak doğrulanmış** miktara dayanır.
- Fasonsuz siparişlerde final kontrol onayı aynı doğrulanmış sağlam miktar sınırına uyar.
- İlk sürümden kalan eski demo sağlamları `legacyGood` olarak ayrıştırılır; yeni modüle otomatik stok girişi yapılmaz.
- Yeni `UX-07 Kontrol` ekranında sipariş mutabakat tablosu, açık miktar ve olası tutarsızlık uyarıları, test adımları bulunur.

## Bilinen sınırlamalar — üretimde kullanmayın
- `localStorage` tek tarayıcı verisidir: çok kullanıcılı tutarlılık, oturum yetkilendirmesi ve sunucu işlemleri yoktur.
- Güncel üretimden sonraki operasyonlara fiziksel transfer zinciri henüz eksiksiz entegre değildir. Bu kontrol öncelikle **ilk iç operasyon → fason/son kontrol** demolarını güvenceye alır.
- Operasyonlar arası parti/lot, rezervasyon, üretim kalitesi, fason kayıp/hurda mutabakatı, iade karantina kararı, ters kayıt, transfer onayı ve makine değiştirme henüz eksiktir.
- Demo rolü Yönetici seçimi güvenli kimlik doğrulama değildir.
- Eski demo stokları değişmeden kalır; sürümler arası migrasyon yapılmadı. Test için tarayıcı demo sıfırlama kullanmak eski yerel demo kayıtlarını siler.
- GitHub'a otomatik push yapılmadı; teslimat manuel yüklemeye hazır ZIP'tir.

## Test rotası
1. Demo için malzeme kabul → iş emrine tahsis.
2. Operatörde fiziksel teslim → üretim → kontrol bekleyen.
3. Demo Yönetici yetkisiyle sağlam onayla.
4. Fason rotası varsa fason gönder / kısmi dönüş; yoksa final kontrol.
5. Son kontrol → kısmi sevkiyat → iade.
6. UX-07 Kontrol raporunda tutarsızlık kontrolü.
