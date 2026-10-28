# Ritim Flow Lite Demo v1.0 — RC1 hazırlık raporu

Yerel son sonuçlar: **292/292 alan, 12/12 paketleme/karakterizasyon, 1/1 smoke, kaynak 110/110 ve artifact 110/110 tarayıcı**; ek izolasyon suite'leri kaynak ve artifact için ayrı ayrı **7/7**. Uygulama hatası 0. `test:ci` komutuna izolasyon suite'leri ilk tam koşu başladıktan sonra eklendi; onlar ayrıca çalıştırıldı, güncel birleşik komut henüz tek seferde çalıştırılmadı. `npm ci` başarılı. GitHub Actions **NOT EXECUTED**.

## 28 Ekim 2026 — bağımsız kurgusal demo

**Yayın kararı NO-GO:** GitHub Actions, gerçek cihaz kabulü ve candidate incelemesi açık. Yeni kaynak, `ritimFlowLite:fictional-demo:v1` anahtarını kullanır; eski sabit anahtarlar okunup otomatik aktarılmaz veya değiştirilmez. İlk kurulum Web Locks altında sürümlü komut makbuzuyla kaydedilir; kota veya kilit yokluğunda kayıt kapalıdır. Recovery yeni namespace ve açık yedek kopyalarıyla çalışır. Bu, keyfî aynı-origin koduna karşı güvenlik sınırı değildir. Önceki legacy import incelemesi eski stratejinin tarihsel kaydıdır.

Yerel kurgusal testte `a28d5621f175f2e3f5f101396807d9eba60c4ff7` geçmiş commit'inden çıkarılan gerçek eski HTML/JS ile aynı origin'de yeni UI'dan sipariş oluşturuldu, korumalı test fixture'ı ile üretim tamamlanmış hale getirildi ve yeni sevkiyat yapıldı. Eski sayfanın `saveShipment()` çağrısı yalnız eski key'i değiştirdi; yeni sipariş, sevkiyat, işlem makbuzları ve reload korundu. Yeni ikinci sekmede tekrar komutu idempotentti. Bu yerel commit, halen yayınlanan Pages sürümünün doğrulanması değildir. 5 başlangıç/kurtarma ve 2 birlikte çalışma kontrolü kaynak ve artifact'ta ayrı ayrı başarılıdır. [Ayrıntılar](RC1_DEMO_ISOLATION_REPORT.md).

## 27 Ekim 2026 — sabit RC1 aday doğrulaması

Ayrı worktree'deki `release/demo-v1.0-rc1` branch'i, korunan main index'inden bağımsız hazırlanmıştır. Tam repository envanteri [RC1_INCLUDED_FILES.txt](rc1/continuation/RC1_INCLUDED_FILES.txt); 37 public asset hash'i [manifestte](RC1_ASSET_MANIFEST.md) yer alır. Aday kimliği için `git rev-parse release/demo-v1.0-rc1`; bir commit kendi SHA'sını kendi içinde taşıyamaz. Tam sonuçlar [aday doğrulama raporunda](rc1/continuation/RC1_CANDIDATE_VERIFICATION.md).

**Yayın ve aday onayı: NO-GO.** GitHub Actions çalıştırılmadı; gerçek Android/iOS kabulü ertelendi. Kilitsiz eski sekme aynı origin üzerinde kilidi atlayıp geçmişi silebilir; içerik hash'i bunu engellemez. Güvenli, ayrı origin geçişi, açık yedek/kopya ve mutabakat ve eski yazarların devre dışı bırakılması kanıtlanmadan mevcut origin'e yayın yapılamaz. Aday workflow'unda Pages işi açıkça kapalıdır. Sunucu tarafı transaction ve gerçek kimlik ayrı gerçek kullanım gereklilikleridir.

Eski rapor ve kanıtlar tarihsel kayıtlardır: adaya büyük geçici kanıt/screenshot klasörleri alınmadığından eski belge bağlantılarından bazıları candidate içinde çözülmez; özgün çalışma alanındaki kanıtlar korunmuştur. `assets/test` base commit'ten değişmeden gelir, public pakete girmez.


27 Ekim 2026. **Yerel RC incelemesine hazır; genel yayın için NO-GO.** Bu bir commit/tag veya deploy değildir. Önerilen branch `release/demo-v1.0-rc1`; oluşturulmadı. Mevcut branch `main`, HEAD `a28d5621f175f2e3f5f101396807d9eba60c4ff7` korundu. Yerel upstream `origin/main` ile ahead/behind 0/0; fetch yapılmadı, GitHub'ın anlık durumu doğrulanmadı. Gerçek kullanıcı origin'i/localStorage'ı açılmadı veya sıfırlanmadı.

## Repository incelemesi ve koruma

Başlangıçta 44 staged, 18 unstaged, 390 tek tek sayılmış untracked dosya vardı; staged/unstaged örtüşür. Tarihsel checklist'teki 16/91 sayıları başka tarihe ve untracked dizin gruplamasına aittir. [Başlangıç dosya hash’leri ve tam status](rc1/evidence/before.json) 445 mevcut dosyayı içerir. Mevcut index’in SHA-256 değeri `1af2c6abe08575778fb927be9b2697b7312ad3a618f331c29d263d8548dca24d` olarak korunur. Staged eski/kısmi P0 içeriği tek başına release değildir; tüm çalışma ağacıyla birlikte incelenmelidir.

İncelemeye sunulan tam repository dosya kümesi [intended-files.json](rc1/evidence/intended-files.json) içindedir; mevcut durum, hash ve bu turda değişip değişmediği dosya bazında listelenir. Bu liste otomatik staging talimatı değildir. Tarihsel belgeler/kanıtlar source review içinde kalır, public artifact’a alınmaz. `.DS_Store` ve `assets/test` korunur ve önerilen dosya kümesinin dışında bırakılır. Kullanıcı/agent hunk kökeni yalnız Git durumundan kesin ayrıştırılamaz; kör `git add .` veya mevcut index’i doğrudan commit etme önerilmiyor.

Bu tur uygulama iş kuralları, HTML kaynakları, CSS, domain/UI modülleri ve mevcut domain testleri değiştirilmedi. Yedi browser harness'ta yalnız sunulan uygulama kökü seçimi ve makineye bağlı varsayılan Chrome yolu değişti; test assertion'ları korunur. README'ye güncel kurulum eklendi, eski notlar tarihsel olarak korundu. Release checklist güncellendi.

| Bu turun dosyaları | Kapsam |
|---|---|
| `.github/workflows/rc1-ci.yml`, `.github/workflows/static.yml` | Yeni doğrulama ve mevcut Pages için test/public artifact kapısı |
| `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore` | Sabit test kurulumu; yerel üretilen dosyaları Git dışında tutma |
| `release/rc1.config.json` | Tam 37 public kaynak whitelist'i |
| `scripts/build-rc1.cjs`, `run-domain.cjs`, `run-browser.cjs`, `smoke-rc1.cjs` | Build, salt okunur verify, test komutları ve HTTP/browser smoke |
| `tests/rc1-packaging.test.cjs` | Altı paketleme negatif/determinism regresyonu |
| `tests/p0-browser.cjs`, `p0-transfer-browser.cjs`, `p0-planning-browser.cjs`, `p1-browser.cjs`, `p0-persistence-browser.cjs`, `p0-integrity-browser.cjs`, `p0-concurrency-browser.cjs` | Yalnız test kökü/Chrome varsayılanı; mevcut assertion'lar korunur |
| `README.md`, bu rapor, `RC1_ASSET_MANIFEST.md`, `MOBILE_ACCEPTANCE_CHECKLIST.md`, `RELEASE_CHECKLIST.md` | Kurulum, envanter, kabul ve yayın kararları |
| `docs/rc1/evidence/` | Başlangıç/son Git hash'leri, tam review kümesi, manifest ve gerçekten çalıştırılan test/lint sonuçları |
 [Son koruma/doğrulama kaydı](rc1/evidence/verification.json) önceki diğer dosyalar, index, HEAD ve branch karşılaştırmasını içerir.

## Paket ve uygulama bağımlılıkları

[Manifest](RC1_ASSET_MANIFEST.md) **37 public dosyanın** kaynak→artifact isim ve SHA-256 eşlemesini içerir. İki giriş HTML’si, yedi CSS, 27 JS ve bir PDF gerekir. Whitelist `release/rc1.config.json`; build aracı `scripts/build-rc1.cjs`dir. Domain factory yükleme bağımlılıkları kontrol edilir; iki deferred DOM modülünün gerçek çalışma sırası raporlanır. Tüm yerel statik HTML bağımlılıkları whitelist içinde olmalıdır. PDF/çizim kullanıcı verisiyle karıştırılmaz.

Candidate kimliği ve artifact yolu [asset-manifest.json](rc1/evidence/asset-manifest.json) içindedir. Aynı kaynaklarla ayrı dizinlere build byte düzeyinde aynı sonucu verir. Mevcut candidate dosyası elle değiştirilmişse build onu ezmez; verify beklenmeyen/eksik dosyada ve checksum farkında başarısız olur. `verify:rc1` artifact’a yazmaz; eksik dosyayı yeniden oluşturmaz, manifesti onarmaz. Public artifact’a test, belge, geçici kanıt, node_modules, repository metadata veya yedek dosya girmez.

JS/CSS içerikleri değişmeden tam içerik hash’li isimlere kopyalanır; HTML bağlantıları bu isimleri ve SRI’yi kullanır. Eski HTML eski modüllere referans verebilir fakat yeni HTML farklı içerikli eski modülü aynı URL’den yüklemez. Açık eski kilitsiz sekmeleri kapatma gerekliliği devam eder; hash'leme aktif eski kodu durdurmaz. HTML revalidation ve hedef host geçişi henüz canlıda doğrulanmadı. Örnek PDF’nin tarihsel URL’si korunur. Service worker/offline cache eklenmedi.

Eski `ritim_flow_lite_sales_polished.html`, yalnız `legacy-archive.js` çalıştırır ve `ritimFlowLiteDemo` ham kaydını okur/dışa aktarır. Eski kaynak inert template içinde kalır. Aktif inline script veya arşivde depolama yazıcısı bulunması paketleme kontrolünü düşürür. Kaynak ve artifact B08 testi sevkiyat globallerinin yokluğunu ve ham veri korumasını sınar.

## Tekrarlanabilir test kurulumu

Node **22.20.0** (`.nvmrc`), npm **10.9.3**, Playwright **1.64.1** ve transitive dependency integrity değerleri lockfile ile sabittir. Browser suite'leri varsayılan olarak Playwright’ın yönettiği Chromium'u kullanır; `/tmp` veya `NODE_PATH` kurulumu gerekmez. Linux CI Ubuntu 24.04 kullanır.

```sh
npm ci
npm run browser:install
npm test
npm run build:rc1
npm run verify:rc1
npm run test:smoke
npm run test:rc1
```

CI eşdeğeri: `npx playwright install --with-deps chromium` ardından `npm run test:ci`. `test:ci`, alan, paketleme, build/verify, HTTP asset smoke, kaynak browser ve artifact browser kontrollerini sırayla çalıştırır. Test hatası/eksik suite/uygulama hatası sıfır olmayan exit üretir. Browser sonuçları her koşuda yeni `artifacts/{source-browser,rc1-browser}/<run>/` altına yazılır; tarihsel kanıtlar ezilmez. TEST_FILTER ve NODE_PATH toplu koşudan çıkarılır. Testler geçici loopback sunucuları ve temiz browser context'leri kullanır.

**Bu makinedeki sınır:** Playwright’ın Chromium kurulumu macOS 13 için desteklenmediğinden `npm run browser:install` başarısız oldu. Yerel doğrulamada `AUDIT_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` açıkça verildi. Node 22.20.0/npm 10.9.3/Playwright 1.64.1/Chrome **156.0.8078.48** kullanıldı. Desteklenen OS üzerinde yönetilen Chromium ve uzaktaki GitHub Actions koşusu henüz çalıştırılmış sayılmaz. Temiz Linux CI başarısı yayın öncesi zorunludur.

## Gerçekte çalıştırılan sonuçlar

Son kod ve paketle **292/292 alan, 6/6 paketleme, 1/1 HTTP/browser artifact smoke**, ayrıca **kaynakta 110/110 ve artifact üzerinde 110/110 browser** geçti. Browser toplamı aynı 110 senaryonun iki ayrı hedefte çalıştırılmasıdır; 220 farklı iş senaryosu diye sayılmaz. Hiçbir nihai test başarısız veya skip değildir.

| Kontrol | Gerçek sonuç | Kanıt |
|---|---:|---|
| Alan regresyonu (7 dosya) | 292/292 | [TAP](rc1/evidence/domain-tests.tap) |
| Paketleme negatif/determinism testleri | 6/6 | [TAP](rc1/evidence/packaging-tests.tap) |
| 37 asset HTTP checksum, gerçek script/style yükleme, arşiv ve yazmasız açılış smoke | 1/1 | [JSON](rc1/evidence/asset-smoke.json) |
| Kaynak browser: 16+9+9+11+34+11+20 | 110/110, 0 uygulama hatası | [Summary](rc1/evidence/source-browser/summary.json) |
| Paket browser: 16+9+9+11+34+11+20 | 110/110, 0 uygulama hatası | [Summary](rc1/evidence/rc1-browser/summary.json) |
| Exact lockfile install | npm ci başarılı, 0 audit bulgusu | [Log](rc1/evidence/npm-ci.log) |
| İki GitHub workflow | actionlint exit 0 | [JSON](rc1/evidence/workflow-lint.json) |

Ham browser JSON’ları summary yanındaki suite dizinlerindedir. Browser telemetrisinde isteğe bağlı `/favicon.ico` için 404 console kayıtları korunur; HTTP/browser smoke yalnız bu adresin 404 verdiğini ve başka console/page/resource hatası olmadığını doğrular. İş asset’lerinde 404 veya uygulama hatası yoktur. İlk paketleme denemesinde statik tarayıcı inline JavaScript içindeki dinamik PDF ifadesini dosya referansı sanmıştı; tarama script gövdelerinden ayrıldı, son altı test geçti. Kurulumun macOS 13 sınırlaması yukarıda açıkça kayıtlıdır. Önceki P0-08 logları yeni başarı kanıtı olarak kullanılmadı. Paketlenmiş uygulama, çalışma ağacından ayrı statik sunucu köküyle aynı suite'lerden geçirilir; fixture/domain yardımcıları test repository'sinden gelir, sunulan JS/CSS byte düzeyinde manifestle doğrulanır.

## CI ve Pages

`.github/workflows/rc1-ci.yml` PR, release branch push, manuel ve reusable çağrılar için doğrulama yapar; deploy işi ve Pages yazma izni yoktur. Yeni CI işindeki Actions sürümleri commit SHA'sıyla sabitlenmiştir. `npm ci`, matching Chromium kurulumu ve `npm run test:ci` başarısızsa candidate artifact yükleme adımı çalışmaz. Hata kanıtları ayrı artifact olarak saklanabilir.

Mevcut `.github/workflows/static.yml` daha önce test beklemeden repository kökünü yayımlıyordu. Hazırlanan değişiklikte `deploy`, reusable `verify` işinin başarılı olmasına bağımlıdır; yalnız onun **rc1-public** artifact’ı indirilip Pages'e aktarılır. Main/manual mevcut tetikleyicileri korunur. Kaynak repo/evidence artık Pages payload’ı değildir. İş akışı dosyasını düzenlemek mevcut canlı yayını değiştirmedi: push, workflow dispatch veya deploy yapılmadı. Başarılı CI mobil kabul yerine geçmez; mevcut environment/branch-protection ayarları burada değiştirilmedi. Main’e gönderim/manuel Pages çalıştırması ayrıca yayın kararı gerektirir.

İki workflow [actionlint 1.7.12](https://github.com/rhysd/actionlint) ile yerelde doğrulanır; [sonuç](rc1/evidence/workflow-lint.json). CI kurulum yöntemi [Playwright resmi CI belgesi](https://playwright.dev/docs/ci), tetikleyiciler [GitHub Actions belgesi](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) ile karşılaştırıldı. Yerel lint, uzaktaki runner/izin/artifact aktarımı kabulü değildir.

## Veri uyumluluğu, yedekleme ve açık migration

- Ana veri anahtarı `ritimLiteAnonymousDemoV1`, eski arşiv anahtarı `ritimFlowLiteDemo` korunur. RC paketleme localStorage şemasını veya uygulama verisini değiştirmez.
- Desteklenen snapshot `schema: ritim-flow-lite`, `schemaVersion: 1`; P0-08 isteğe bağlı `transactionState.version: 1`, revizyon ve kalıcı command journal kullanır. Protokolsüz geçerli veri okunurken yazılmaz; ilk açık komutta metadata eklenir. Revizyon veya makbuzlar cache temizliği bahanesiyle silinmez.
- Bozuk JSON/null/tanınmayan alan veya gelecek şema/protokol kurtarmaya gider. Veri sessizce normalize edilmez, boş demo ile ezilmez. P0-06 tarihsel provenance istisnaları ayrı uyarıdır; eksik gerçek referans gizlenmez.
- Yazıcı sekmeleri kapatıp seçili kopyanın güncel ham verisini dışa aktarın; tam `dataKey` adresini, origin’i, dosya hash’ini ve artifact kimliğini özel yedek kaydında saklayın. Her kopya/legacy arşiv ayrı yedeklenir. Yedek dosyasını public artifact’a koymayın. Bu tur gerçek kullanıcı yedeği alınmış gibi kabul edilmez.
- Sürümsüz tanınan veri için yalnız P0-07'nin açık onaylı, doğrulanmış **ayrı sürüm 1 kopyası** kullanılmalı; özgün anahtar korunur. Backup import da ayrı `:copy:<UUID>` anahtarı açar. Kaynağı yerinde değiştirme veya otomatik birleştirme yapılmaz; kopya aynı origin kotasını paylaşır.
- Origin (protokol/host/port) değişirse veri kendiliğinden taşınmaz. Aynı origin’de farklı URL yolu ise veri izolasyonu sağlamaz. Gerekirse kullanıcı ham export→doğrulanmış ayrı import yapar. HTTPS/uygun güvenli bağlam ve Web Locks yazılabilir destek için gerekir; destek yoksa güvenli ret/okuma/kurtarma kalır.

## Aktivasyon ve rollback prosedürü

1. Yetkili review sonrasında yukarıdaki tam dosya kümesinden candidate oluşturun; mevcut karışık index'i doğrudan commit etmeyin. Candidate commit ve sourceDigest aynı release kaydına eklenmeli; aynı commit üzerinde Linux CI ve gerçek cihaz kabulü tamamlanmalı.
2. Önceki uyumlu artifact ve ham veri yedeğini güvenli yerde koruyun. Eski kilitsiz sekmeleri kapatın. Hedef origin ve kopya adresini kontrol edin; reset/clearStorage kullanılmaz.
3. Yalnız doğrulanmış 37 public dosyayı içeren artifact etkinleştirilmeli. Önce immutable modüller, sonra giriş HTML'leri; eski hash'li asset’ler geçiş/rollback boyunca korunmalı. Pages'in gelecekteki artifact değişimi ve HTML cache davranışı kontrollü hedefte smoke test gerektirir. Bu rapor deploy yetkisi değildir.
4. Aktivasyon sonrası yalnız kurgusal ayrı kopyada açılış, Web Locks, recovery/export, final kalite→sevk ve reload smoke testi yapın. Kullanıcının gerçek kaydını test fixture'ıyla değiştirmeyin.
5. Rollback yalnız aynı şema/protokolü okuyup koruyan önceki **uyumlu** artifact’a yapılmalı. P0-07/08 öncesi kodu yeni snapshot'a yazıcı olarak açmayın; yeni command journal/alanlar kaybolabilir. Kod rollback'i veri rollback'i değildir.
6. Veri incelemesi gerekiyorsa yazmayı durdurun, ham kaydı koruyun; doğrulanmış yedeği ayrı kopyaya açın. Kaynak anahtara kör geri yazma, metadata silme veya otomatik downgrade yoktur. Yeni kayıtları eski yedekle birleştirmek ayrı kontrollü mutabakat işidir.

## Kalan kapılar ve sonraki adımlar

| Konu | Demo RC / yayın kararı |
|---|---|
| P0-06/07/08 yerel domain | Korundu; RC testleri aşağıda |
| Gerçek Android Chrome/iOS Safari kabulü | **Yayın engeli**; [mobil liste](MOBILE_ACCEPTANCE_CHECKLIST.md) henüz boş |
| Desteklenen temiz Linux/managed Chromium + GitHub Actions | **Yayın engeli**; workflow hazırlanmış olması uzak koşu kanıtı değildir |
| Dosya/hunk review ve sabit candidate commit | **Yayın engeli**; branch/tag/commit oluşturulmadı, index karışık |
| Hedef origin/cache, artifact aktarımı, backup/rollback smoke | **Yayın engeli**; mevcut canlı siteye dokunulmadı |
| Gerçek kimlik/yetki ve çok cihazlı transaction | Kurgusal yerel demo olarak ertelenebilir; **gerçek veri/kullanıcı öncesi Supabase aşamasında zorunlu** |
| İç operasyon → fason → iç operasyon | Kapalı kapsam olarak ertelenebilir; ihtiyaç varsa ayrı domain/lot/input modeli gerekir, backend tek başına çözmez |
| Eski tarihsel lot bilgisi ve localStorage kapasitesi | Bilinmeyen geçmiş üretilmez; journal/çizim büyümesinde güvenli kota reddi vardır, merkezi dosya/yedek deposu sonraki aşama |

Öneri: **RC1 dosya incelemesine GO, yayın için NO-GO.** Önce tam dosya/hunk review, sonra yetkili candidate branch/commit, temiz Linux CI, gerçek mobil kabul ve kontrollü aktivasyon/rollback doğrulaması. P1-14 ve sunucu transaction/idempotency gerçek üretimden önce birlikte tamamlanmalı. Bu tur stage/commit/push/deploy veya gerçek veri dönüşümü yapılmadı.
