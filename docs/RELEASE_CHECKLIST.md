# Ritim Flow Lite — P0/P1 release checklist

## 27 Ekim 2026 — sabit RC1 aday doğrulaması

Ayrı worktree'deki `release/demo-v1.0-rc1` branch'i, korunan main index'inden bağımsız hazırlanmıştır. Tam repository envanteri [RC1_INCLUDED_FILES.txt](rc1/continuation/RC1_INCLUDED_FILES.txt); 37 public asset hash'i [manifestte](RC1_ASSET_MANIFEST.md) yer alır. Aday kimliği için `git rev-parse release/demo-v1.0-rc1`; bir commit kendi SHA'sını kendi içinde taşıyamaz. Tam sonuçlar [aday doğrulama raporunda](rc1/continuation/RC1_CANDIDATE_VERIFICATION.md).

**Yayın ve aday onayı: NO-GO.** GitHub Actions çalıştırılmadı; gerçek Android/iOS kabulü ertelendi. Kilitsiz eski sekme aynı origin üzerinde kilidi atlayıp geçmişi silebilir; içerik hash'i bunu engellemez. Güvenli, ayrı origin geçişi, açık yedek/kopya ve mutabakat ve eski yazarların devre dışı bırakılması kanıtlanmadan mevcut origin'e yayın yapılamaz. Aday workflow'unda Pages işi açıkça kapalıdır. Sunucu tarafı transaction ve gerçek kimlik ayrı gerçek kullanım gereklilikleridir.

Eski rapor ve kanıtlar tarihsel kayıtlardır: adaya büyük geçici kanıt/screenshot klasörleri alınmadığından eski belge bağlantılarından bazıları candidate içinde çözülmez; özgün çalışma alanındaki kanıtlar korunmuştur. `assets/test` base commit'ten değişmeden gelir, public pakete girmez.


Tarih: 26 Ekim 2026. Karar: **NO-GO — kayıt alan genel demo/gerçek üretim yayını için açık engeller var.** Mevcut işlev regresyonları başarılı; release onayı verilmiyor. Ayrıntılı teknik bulgular: [RELEASE_RISK_REPORT.md](RELEASE_RISK_REPORT.md).

## 27 Ekim 2026 — RC1 devam doğrulaması

[Devam incelemesi](RC1_CONTINUATION_REVIEW.md) ve [güncel tam dosya envanteri](rc1/continuation/intended-files.json). **Yayın NO-GO** sürer.

- [x] Önceki 37 public kaynağın 22'sinin index'te olmadığı, 9'unun index ile farklı olduğu gösterildi. Mevcut staged küme tek başına candidate değildir; index/HEAD/branch korunmuştur.
- [x] Eksik P1 alan suite'inde yanlışlıkla başarılı dönen CI kapısı düzeltildi. Yedi zorunlu suite, en az 292 başarılı test ve sıfır skip/cancel şartı; eksik suite ve yetersiz test sayısı için iki negatif test eklendi.
- [x] İlk temiz kopya koşusunda recovery kota testi 33/34 ile başarısız oldu; asenkron ret beklemesi düzeltildi, üç odaklı tekrar ve ardından tam koşu geçti. İlk hata kanıtı korunur.
- [x] Node 22.20.0/npm 10.9.3 ile temiz macOS kopyasında `npm ci` ve tam `npm run test:ci`: **292/292 alan, 8/8 paket/gate, 1/1 smoke, kaynak 110/110 ve artifact 110/110**, sıfır beklenmeyen uygulama hatası. [Kanıt](rc1/continuation/clean-mac/ci.log).
- [ ] Desteklenen Linux + managed Chromium ve uzaktaki GitHub Actions koşusu; temiz macOS/yerel Chrome bu kapıyı kapatmaz.
- [ ] Eski/yeni HTML ve asset cache geçişi. Deneyde yeni public artifact önceki hash’li JS'yi taşımıyor; yerel HEAD HTML'sinin 10 eski JS/CSS adresi yeni artifact'ta yok. Önceki artifact'ın kilit protokolü ve gerçek host davranışı doğrulanmalı.
- [ ] Gerçek Android Chrome/iOS Safari kabulü, candidate hunk incelemesi ve sabit commit, hedef origin/backup/rollback doğrulaması.

Eski kilitsiz sekmeler kapatılmalıdır; statik origin, önbellekteki eski kodu sunucu yetkisiyle durduramaz. Gerçek kullanıcı/çok cihazlı üretim için sunucu transaction ve gerçek kimlik/yetki ayrı zorunluluktur. Bu tur stage/commit/push/deploy veya gerçek demo verisi değişikliği yapılmadı.

## 27 Ekim 2026 — Demo v1.0 RC1 hazırlığı

**İncelenebilir yerel artifact hazır; genel yayın NO-GO.** [RC1 raporu](RC1_RELEASE_REPORT.md), [37 public dosyanın tam manifesti](RC1_ASSET_MANIFEST.md), [gerçek mobil kabul listesi](MOBILE_ACCEPTANCE_CHECKLIST.md), [tam review dosya kümesi](rc1/evidence/intended-files.json).

- [x] Güncel kodla **292/292 alan + 6/6 paketleme + 1/1 artifact HTTP/browser smoke** geçti.
- [x] **Kaynak 110/110 ve paket 110/110 browser**, her hedefte sıfır beklenmeyen uygulama hatası. Aynı 110 senaryo iki hedefte çalıştırıldı; [kaynak](rc1/evidence/source-browser/summary.json), [artifact](rc1/evidence/rc1-browser/summary.json).
- [x] package.json/lockfile, sabit Node/Playwright, npm komutları eklendi; `/tmp`/NODE_PATH bağımlılığı kaldırıldı. `npm ci` başarılı.
- [x] Whitelist build, içerik hash'li JS/CSS, SRI, checksum ve beklenmeyen dosya kontrolü; test/docs/yedek public pakete girmez.
- [x] CI hazır; iki workflow actionlint kontrolünden geçti. Pages deploy işi başarılı reusable verification'a bağlı; yalnız doğrulanmış public artifact kullanılır. **Canlı Pages değişmedi; push veya workflow dispatch yok.**
- [x] Özgün staged içerik, HEAD/branch ve kapsam dışı dosyalar korundu; [son kanıt](rc1/evidence/verification.json).
- [ ] **Temiz desteklenen Linux + managed Chromium ve uzaktaki GitHub Actions koşusu.** Bu makinede macOS 13 browser kurulumu desteklenmedi; yerel testler açık AUDIT_CHROME seçeneğiyle Chrome 156 üzerinde geçti.
- [ ] Gerçek Android Chrome/iOS Safari kabulü; cihaz/sürüm/kanıt alanları henüz boş.
- [ ] Tam hunk/dosya review, onay sonrası `release/demo-v1.0-rc1` candidate commit ve aynı commit üzerinde CI. Branch/commit/tag oluşturulmadı.
- [ ] Hedef origin/cache, izinler/artifact aktarımı, özel yedek ve uyumlu rollback doğrulaması. Otomatik kod/veri downgrade yok.

Önceki notlardaki “CI/paketleme eksik” maddelerinin **hazırlığı tamamlandı**; temiz Linux/uzak CI, sabit commit ve gerçek cihaz kabulü hâlâ açık kapılardır. Bundan sonraki öneri: dosya review → yetkili candidate → Linux CI/gerçek mobil → kontrollü yayın kararı. Gerçek auth ve çok cihaz transaction Supabase aşamasında, gerçek kullanıcı/veriden önce zorunlu kalır. Aşağıdaki önceki tarihlere ait envanter ve koşular tarihsel kayıttır.

## 27 Ekim 2026 — P0-08 güncellemesi

P0-08 aynı origin içindeki güncel yerel demo istemcileri için uygulandı: gerçek exclusive Web Locks, kilit altında güncel snapshot/komut doğrulaması, kalıcı komut kimliği ve artan revizyon. Formlar storage event ile sessizce yenilenmez; eski görünüm bildirilir. P0-06 ve P0-07 korunur. [P0-08 uygulama raporu](P0_08_IMPLEMENTATION_REPORT.md).

**Son kodla 292/292 alan ve 110/110 tarayıcı testi geçti; sıfır başarısız test ve beklenmeyen uygulama hatası.** Önceki 264 alan/90 tarayıcı regresyonu ve yeni 28 alan/20 native yarış senaryosu başarılı. [Son koşu/index/veri koruma kanıtı](p0-08/evidence/verification.json). **Genel yayın NO-GO:** gerçek mobil kabul, sabit candidate/paket ve tekrarlanabilir test/CI doğrulaması açık. Çok cihazlı gerçek kullanım için sunucu transaction, idempotency ve gerçek yetkilendirme gerekir.

## 27 Ekim 2026 — P0-06 güncellemesi (P0-08 öncesi tarihsel kayıt)

Kesinti sonrası son doğrulama tamamlandı: **264/264 alan + 90/90 tarayıcı testi**, altı tarayıcı paketinde **sıfır beklenmeyen uygulama hatası**. Son makine referansı kontrolü, kayıt reddi ve veri koruma/reload senaryoları yeniden doğrulandı. [Güncel koşu ve hash/index kanıtı](p0-06/evidence/final-20261027T123459Z-fdf694/verification.json). İlk staged içerik korundu; bu devam turunda uygulama kodu değiştirilmedi.

P0-06 salt okunur bütünlük motoru ve UX-07 mutabakatı uygulandı. Etkilenen hatalı siparişe yeni kayıt ortak P0-07 commit sınırında engellenir; tarihsel istisnalar uyarı olarak ayrı kalır. [P0-06 raporu ve güncel test kanıtları](P0_06_IMPLEMENTATION_REPORT.md).

**NO-GO devam ediyor:** P0-08 atomik sekme/yazıcı koruması, gerçek mobil kabul ve candidate/paket doğrulaması açık. P0-08'e başlanmadı. Mevcut kullanıcı verileri ve index korundu; commit/push/deploy yapılmadı. Aşağıdaki önceki tarihli notlar kendi koşularının tarihsel kaydıdır.

## 27 Ekim 2026 — P0-07 güncellemesi (P0-06 öncesi tarihsel kayıt)

P0-07 yerel demo uygulaması tamamlandı: sürümlü şema, açık kurtarma/kopya onayı ve tüm etkin yazma yollarında ortak commit kullanılıyor. **180/180 alan testi, 79/79 tarayıcı testi başarılı; sıfır uygulama hatası.** [Uygulama ve kanıt raporu](P0_07_IMPLEMENTATION_REPORT.md). Eski bağımsız satış sayfası veri dışa aktarabilen salt okunur arşive dönüştürüldü.

**NO-GO devam ediyor:** P0-06, P0-08, gerçek mobil kabul ve candidate/paket doğrulaması açık. Mevcut anahtarlar ve kullanıcı verileri sıfırlanmadı; staging/commit/push yapılmadı. Aşağıdaki 26 Ekim git envanteri ve test kanıtları tarihsel release incelemesine aittir; güncel P0-07 dosyaları ve sonuçları bağlı rapordadır.

## Git ve paket durumu

- [x] Başlangıç branch: `main`; HEAD: `a28d562`. İzlenen upstream `origin/main`; yereldeki remote-tracking kaydına göre ahead/behind 0/0. Fetch yapılmadı; GitHub'ın anlık durumu doğrulanmadı.
- [x] Başlangıçta **44 staged dosya**, **16 unstaged dosya**, **91 untracked dosya** vardı. Staged/unstaged kümeleri örtüşür; sayılar toplanarak benzersiz dosya sayısı elde edilmez.
- [x] Tam dosya adları, staged/unstaged ayrımı ve başlangıç SHA-256 özeti: [git-before.json](release/evidence/git-before.json).
- [x] [Son hash/index doğrulaması](release/evidence/release-verification.json): mevcut dosyaların hiçbiri değişmedi; index, HEAD ve branch aynı kaldı. Mevcut çalışma ağacı ve index korunarak inceleme yapıldı. Bu tur yalnız yeni release belgeleri, risk deney script'i ve release kanıtları eklendi.
- [x] `git diff --check` ve `git diff --cached --check` başarılı.
- [x] Staging/commit/push/dağıtım, reset/clean/checkout veya gerçek demo verisi sıfırlama yapılmadı.
- [ ] Release branch/candidate oluşturulup yalnız gözden geçirilmiş dosyalar seçilmeli. Mevcut staged snapshot eski/kısmi P0 içeriyor; tek başına release değildir.
- [ ] Untracked modüller ve testler pakete dahil edilmeli; çalışma ağacındaki son entegrasyonla birlikte incelenmeli. Kullanıcı değişikliği varsayılarak hiçbir içerik silinmemeli.
- [ ] Review sonrası sabit candidate commit veya artifact üzerinde regresyonlar tekrar doğrulanmalı. Buradaki testler mevcut çalışma ağacını doğrular; henüz oluşturulmamış bir commit/deploy'u doğrulamaz.

### Kapsam envanteri

| Grup | Release içinde birlikte değerlendirilmesi gereken dosyalar |
|---|---|
| Temel entegrasyon | `index.html`, `ritim_flow_lite_sales_polished.html`; `assets/js/ux-operator.js`, `ux-logistics.js`, `ux-audit.js`, `ux-orders-workorders.js` |
| P0 ortak domain | `assets/js/quantity-model.js`, `shipment-service.js`, `transfer-ledger.js`, `transfer-service.js`, `operation-ledger.js`, `planning-service.js` |
| P0-06/07 güvenlik | `assets/js/integrity.js`, `persistence.js`, `persistence-ui.js`, `legacy-archive.js`; `assets/css/persistence.css`; P0-06/07 testleri ve uygulama raporları |
| P0-08 | `assets/js/transactions.js`, `concurrency-ui.js`; concurrency alan/tarayıcı testleri, `browser-transactions.cjs`, P0-08 raporu ve kanıtları |
| P0 arayüz | `assets/js/ux-transfers.js`, `ux-planning.js` |
| P1 domain | `assets/js/workforce-service.js`, `quality-service.js`, `drawing-service.js`, `stock-ledger.js`, `stock-service.js` |
| P1 arayüz | `assets/js/ux-p1.js`, `ux-quality-drawings.js`, `ux-stock.js`, `assets/css/ux-p1.css` |
| Testler | `tests/p0-domain.test.cjs`, `p0-transfer.test.cjs`, `p0-planning.test.cjs`, `p1-domain.test.cjs`; dört browser script'i; `p0-fixtures.cjs`, `p0-transfer-fixture.cjs` |
| Belgeler | Dört UX audit belgesi, P0/P0-04/P0-05/P1 uygulama raporları, ilgili kanıt klasörleri ve bu release belgeleri |
| Yeni release incelemesi | `docs/release/risk-probe.cjs`, `docs/release/evidence/*`, `docs/RELEASE_CHECKLIST.md`, `docs/RELEASE_RISK_REPORT.md` |

Staged `ritim_flow_lite_sales_polished.html` değişikliği bağımsız satış sayfasının eski sevkiyat bypass'ını kapatan P0-03 kapsamındadır. Yeni transfer/planning ve P1 modülleri başlangıçta untracked idi. Tam hunk kökeni Git durumundan kullanıcı/agent diye kesin ayrıştırılamaz; bu tur mevcut dosyalara hiç yazılmadı.

## Yeniden çalıştırılan regresyonlar

Ortam: Node v22.20.0, Playwright 1.64.1, Chrome 155.0.8059.85. In-app Browser discovery boş döndüğü için mevcut bağımsız harness kullanıldı. Her suite geçici loopback sunucusu ve temiz profiller oluşturdu. Eski kanıt dosyalarının üzerine yazılmadı.

| Suite | Sonuç | Yeni kanıt |
|---|---:|---|
| P0/P1 domain, dört test dosyası | **94/94**, 0 fail/skip | [domain-tests.tap](release/evidence/domain-tests.tap) |
| P0 temel browser | **16/16**, 0 uygulama hatası | [p0/browser-results.json](release/evidence/p0/browser-results.json) |
| P0-04 transfer browser | **9/9**, 0 uygulama hatası | [transfer/browser-results.json](release/evidence/transfer/browser-results.json) |
| P0-05 planlama browser | **9/9**, 0 uygulama hatası | [planning/browser-results.json](release/evidence/planning/browser-results.json) |
| P1 browser | **11/11**, 0 uygulama hatası | [p1/browser-results.json](release/evidence/p1/browser-results.json) |
| Ayrı risk karakterizasyonu | 7/7 gözlem tekrar üretildi; güvenlik başarısı değildir | [risk-probes/browser-results.json](release/evidence/risk-probes/browser-results.json) |

**Toplam işlev regresyonu: 94 alan + 45 browser.** Risk deneyleri bu toplamın dışında tutulur. `jobs:null` deneyinde beklenen çökme, risk JSON'un observations alanında kayıtlıdır. Uygulama hatası 0 ifadesi dört normal regression suite içindir.

- [x] UX-05 250/150/100 denklemi, üretim/kalite/rework/devir korumaları.
- [x] UX-06 kısmi kabul, tahsis, fason dönüş, sevk ve iade üst sınırları.
- [x] Net müşteri sevkiyatıyla tamamlanma; final operasyon/kalite kapıları ve eski sevkiyat bypass engelleri.
- [x] Fiziksel 25 ile planlanmamış/başlanmamış 50 ayrımı; transfer kabulü/tekrarı/ters hareket ve provenance.
- [x] Operasyon planlama, 100+50 bölme, fazla plan reddi, önceki onaylı çıktıyı ayırma ve kabul.
- [x] Yerel P1 sahiplik, politika, rework izi, birim dönüşümü, iade/restock, telafi, revizyon ve gezinme regresyonları.
- [x] 1440/390/360 genişlikte otomatik kontroller. Gerçek mobil cihaz kabulünün yerine geçmez.
- [x] Normal eski verilerde salt okunur gezinti localStorage'ı değiştirmiyor. **Bozuk snapshot kurtarması bu olumlu testin kapsamına girmez.**

### Tekrar çalıştırma

Mevcut makinede:
```sh
node --test tests/p0-domain.test.cjs tests/p0-transfer.test.cjs tests/p0-planning.test.cjs tests/p1-domain.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/release/evidence/p0 node tests/p0-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/release/evidence/transfer node tests/p0-transfer-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/release/evidence/planning node tests/p0-planning-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/release/evidence/p1 node tests/p1-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules node docs/release/risk-probe.cjs
```

- [ ] Temiz ortamda test kurulumu tekrarlanabilir hale getirilmeli: proje test bağımlılıkları/sürümleri, lockfile, test komutları ve browser kurulumu. Mevcut browser harness `/tmp` bağımlılığına ve yerel Chrome'a dayanıyor; `AUDIT_CHROME` ile executable değiştirilebilir.
- [ ] CI'da domain ve browser suite'leri release kapısı olmalı; kanıtlar candidate commit ile eşleştirilmeli.
- [x] P0-06/07 eski risk gözlemleri ayrı güvenli-sonuç negatif regresyonlarıyla kapsandı: `p0-integrity` ve `p0-persistence` suite'leri. Tarihsel risk script'i önceki bulguların kanıtı olarak korunur.
- [x] P0-08: gerçek Web Locks ile aynı profil/origin/depo için özel yazıcı ve iki sayfalı yarış regresyonları eklendi.
- [ ] Yayın geçişinde eski kilitsiz yazıcı sekmeler kapatılıp güncel candidate açılmalı; karışık uygulama sürümleriyle yazma kabul edilmemeli.

## P0/P1 tamamlanma ve release kapıları

| Kapsam | Durum | Kalan kabul |
|---|---|---|
| P0-01/02/03 | Desteklenen rotalarda uygulanmış, regresyon başarılı | Sunucu/çok cihaz atomikliği ve gerçek cihaz kabulü açık |
| P0-04/05 | Uygulanmış, regresyon başarılı | Ara fason yeni model gerektirir |
| P0-06 | **Tamamlandı; son regresyonlar başarılı** | Tarihsel kanıt eksikleri uyarı olarak görünür; şema/lot/plan/miktar kapsamı P0-06 raporunda |
| P0-07 | **Yerel demo uygulandı; regresyon başarılı** | Gerçek cihaz depolama/import/export kabulü açık; ayrıntılar P0-07 raporunda |
| P0-08 | **Tamamlandı; 20/20 native yarış testi başarılı** | Web Locks destekli güncel istemciler; çok cihaz/sunucu transaction ayrı zorunluluk |
| P1-01/02/03 | Yerel demo uygulandı | Kullanıcı seçimi gerçek kimlik değil |
| P1-04/05 | Birimli malzeme ve terminal fason uygulandı | Tedarikçi sicili ve ara fason kapsam dışı |
| P1-06/07/08 | Politika/rework/iade akışları uygulandı | Eski kayıtlardan bilinmeyen lot geçmişi üretilemez |
| P1-09/10/11/12 | Dashboard, yerel gezinme ve responsive düzen uygulandı | Gerçek cihaz kabulü açık |
| P1-13 | Revizyon ve onay uygulandı | Gerçek mobil PDF/zoom/upload ve kota denemeleri açık |
| P1-14 | **Kullanıcı kararıyla ertelendi** | Gerçek kullanım öncesi kimlik ve sunucu yetkisi zorunlu |
| P1-15/16 | Telafi ve bağlama uygun escaping uygulandı | Tam event-listener mimarisi dönüşümü kapsam dışı |

## Net öncelik önerisi

| İş | Kayıt alan demo yayını öncesi | Supabase / gerçek üretim aşaması |
|---|---|---|
| Bozuk veri recovery + ham veri dışa aktarma | **P0-07 uygulandı**; gerçek cihaz kabulü açık | Merkezi yedek/geri yükleme eklenir |
| Tüm yazma yollarında başarısız kaydı atomik ele alma | **P0-07 uygulandı**; sekme atomikliği P0-08 | Sunucu hata/timeout/tekrar sözleşmesi eklenir |
| Plan/referans/nümerik bütünlük kontrolleri | **P0-06 uygulandı**; candidate üzerinde yeniden doğrulanmalı | Aynı kurallar sunucuda da zorunlu |
| Aynı tarayıcıdaki ikinci yazarı engelleme | **P0-08 uygulandı**; Web Locks yoksa yazma kapalı | Çok kullanıcı/çok cihaz transaction ve idempotency zorunlu |
| Gerçek auth ve sunucu yetkisi | Kurgusal demo olarak ertelenebilir | **Gerçek veri/kullanıcı öncesi zorunlu**; istemci rolü yetki değildir |
| Ara fason → iç operasyon | Desteklenmediği açıkça belirtilip kapalı tutulursa ertelenebilir | İhtiyaç varsa domain genişlemesi; backend tek başına çözmez |
| Harici çizim deposu/merkezi tedarikçi yönetimi | Yerel sınırlar ve güvenli kota davranışıyla ertelenebilir | Sonraki aşama |
| Gerçek mobil smoke/ana akış kabulü | Mobil hedefleniyorsa **zorunlu** | Sunucu bağlantılı offline/timeout akışları ayrıca test edilir |
| Paket bütünlüğü, tekrarlanabilir test ve candidate review | **Zorunlu** | Devam eden release disiplini |

Önerilen sıra: **Gerçek mobil kabul → tekrarlanabilir test/CI ve candidate paket/test/review.** P1-14 ve çok cihazlı atomik işlemler Supabase geliştirmesinde birlikte ele alınmalı; gerçek üretim açılışından önce tamamlanmalı. Ara fason iş kapsamına göre ayrı domain işi olarak planlanmalı.

## Dağıtım, veri koruma ve rollback

- [ ] Release branch üzerinden PR/candidate incelemesi; main'e doğrudan gönderim yok.
- [ ] Hedefin “kurgusal demo” veya “gerçek üretim” olduğu ve desteklenen rota/cihazlar yazılı olmalı.
- [ ] Gerçek kullanıcı verisine dokunmadan dışa aktarma/geri yükleme yöntemi doğrulanmalı; bu tur gerçek veri yedeği alınmış gibi kabul edilmemeli.
- [ ] Release artefact tüm script/CSS bağlantılarını içermeli; yeni domain modülü eksik paket kabul edilmemeli.
- [ ] Hedef origin'de kontrollü kurgusal profil ile smoke testi; mevcut origin localStorage anahtarı resetlenmemeli.
- [ ] Geri dönüş için önceki kod artefact'ı ve veri uyumluluk planı hazırlanmalı. Yeni alanlar yazılmış veriyi eski kodla açıp yeniden kaydetmek alan kaybına yol açabilir; yalnız kod rollback'i veri rollback'i sayılmaz.
- [x] P0-07: desteklenmeyen/bozuk veride yazma durur ve kurtarma açıklaması görünür.
- [ ] Yayın kararından sonra sürüm/commit, test sonuçları ve cihaz kabul kayıtları aynı release kaydına eklenmeli.

Gerçek mobil test matrisi ve teknik düzeltme kabul ölçütleri [risk raporunda](RELEASE_RISK_REPORT.md). Bu turdaki hazırlık deploy yetkisi veya üretim güvenliği onayı değildir.
