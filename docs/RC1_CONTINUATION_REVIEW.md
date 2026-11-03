# RC1 — devam incelemesi ve temiz kopya doğrulaması

27 Ekim 2026. Bu inceleme önceki [RC1 raporunun](RC1_RELEASE_REPORT.md) devamıdır. **Yayın NO-GO** sürer. `main` / `a28d562` ve mevcut index korunmuştur; branch, staging, commit, push, deploy ve demo veri değişikliği yapılmadı. Önceki 484 dosyalık liste ve kanıtlar kendi tarihindeki snapshot olarak yerinde kalır. Bu turdaki değişiklikleri içeren tam liste [güncel inceleme envanterindedir](rc1/continuation/intended-files.json).

## 37 çalışma dosyasının index ile karşılaştırılması

Başlangıç durumu ve her dosyanın Git blob kimliği: [git-before.json](rc1/continuation/git-before.json). Git index içeriği `git hash-object` ile gerçek çalışma ağacı dosyalarıyla karşılaştırıldı; hiçbir dosya index’e yazılmadı.

| Durum | Dosya |
|---|---:|
| Index’te yok (untracked) | 22 |
| Index var, çalışma içeriği farklı | 9 |
| Index ve çalışma içeriği aynı | 6 |

**Mevcut 44 staged dosyayı tek başına commit etmek RC1 vermez.** Bu 37 dosyanın aşağıdaki dokuzu index ve çalışma ağacında farklıdır; ilgili hunk ve mevcut kullanıcı değişiklikleri incelenmelidir.

| Git status | Kaynak dosya |
|---|---|
| `MM` | `index.html` |
| `MM` | `ritim_flow_lite_sales_polished.html` |
| `·M` | `assets/css/ux-audit.css` |
| `AM` | `assets/js/quantity-model.js` |
| `AM` | `assets/js/shipment-service.js` |
| `·M` | `assets/js/ux-audit.js` |
| `MM` | `assets/js/ux-logistics.js` |
| `MM` | `assets/js/ux-operator.js` |
| `MM` | `assets/js/ux-orders-workorders.js` |

Aşağıdaki 22 public kaynak dosyası henüz index’te yoktur:

- `assets/css/persistence.css`
- `assets/css/ux-p1.css`
- `assets/js/concurrency-ui.js`
- `assets/js/drawing-service.js`
- `assets/js/integrity.js`
- `assets/js/legacy-archive.js`
- `assets/js/operation-ledger.js`
- `assets/js/persistence-ui.js`
- `assets/js/persistence.js`
- `assets/js/planning-service.js`
- `assets/js/quality-service.js`
- `assets/js/stock-ledger.js`
- `assets/js/stock-service.js`
- `assets/js/transactions.js`
- `assets/js/transfer-ledger.js`
- `assets/js/transfer-service.js`
- `assets/js/ux-p1.js`
- `assets/js/ux-planning.js`
- `assets/js/ux-quality-drawings.js`
- `assets/js/ux-stock.js`
- `assets/js/ux-transfers.js`
- `assets/js/workforce-service.js`

Bu liste public runtime içindir; CI, test, belgeler ve staged/unstaged/untracked dosyaların tam güncel review envanteri [güncel dosya listesinde](rc1/continuation/intended-files.json); önceki snapshot [ayrıca korunur](rc1/evidence/intended-files.json). Liste stage izni veya kullanıcı/agent kökeni kanıtı değildir. Candidate için dosya ve hunk seçimi açık inceleme sonrasında yapılmalıdır.

## CI: eksik alan suite ve kurtarma testinin zamanlaması

İzole negatif deneyde `tests/p1-domain.test.cjs` test kopyasından çıkarıldığında eski runner **277/277 ile exit 0** veriyordu: [önce](rc1/continuation/domain-gate-before.json). Bu, uygulama kodu mevcut olsa bile P1 alan testleri eksik candidate’ın CI kapısını geçebileceğini gösterdi.

`scripts/run-domain.cjs` artık yedi zorunlu domain dosyasını arar; en az 292 test, tamamı başarılı ve sıfır skip/cancel gerektirir. Yeni suite'ler de çalıştırılır. Aynı eksik dosya deneyinde **exit 1** üretildi: [sonra](rc1/continuation/domain-gate-after.json). `tests/rc1-domain-gate.test.cjs`, eksik suite ve içerikleri boşaltılmış suite senaryolarını gerçek alt süreçte sınar. [Alan 292/292](rc1/continuation/domain-tests.tap), [paket/kapı 8/8](rc1/continuation/packaging-tests.tap).

İlk tam temiz kopya koşusunda P0-07 suite'i **33/34** ile durdu: [hata ve stack](rc1/continuation/clean-source-initial-failure.json), [tam koşu logu](rc1/continuation/clean-initial-ci.log). Hata, recovery-fresh tıklamasından sonra async Web Lock/kopya reddi DOM'a yazılmadan boş hata metninin okunmasıydı; normal command idle hook bu recovery Promise'ini kapsamıyor. `tests/p0-persistence-browser.cjs` artık gerçek ret mesajını bekler ve özgün bozuk verinin ve adresin değişmediğine ek olarak yeni `:copy:` anahtarı oluşmadığını sınar. Uygulama kodu değiştirilmedi. Aynı kota senaryosu [1](rc1/continuation/recovery-recheck-1/browser-results.json), [2](rc1/continuation/recovery-recheck-2/browser-results.json), [3](rc1/continuation/recovery-recheck-3/browser-results.json) olmak üzere üç odaklı koşuda 1/1 geçti. Bu, ilk başarısız sonucu silmez; nihai tam koşu sonucuyla ayrıca değerlendirilir.

## Önbellek / önceki asset geçiş açığı

İzole iki build deneyi [rollout-probe.cjs](rc1/continuation/rollout-probe.cjs) ve [sonucu](rc1/continuation/rollout-probe.json): JS kaynağı değiştiğinde eski HTML eski hash’li dosyayı, yeni HTML yeni hash’li dosyayı işaret ediyor; **yeni 37 dosyalık public artifact eski hash’li dosyayı içermiyor**. Bu, eski HTML önbellekte kaldığında önceki dosyanın hostta bulunacağını garanti etmez. Önceki test edilmiş byte’lar veya gerçek veriler değiştirilmedi.

Ayrıca yerel `HEAD:index.html` içindeki **10 JS/CSS URL'sinin hiçbiri**, hash’li isimlerle hazırlanan mevcut 37 dosyalık public payload içinde eski adresiyle bulunmuyor: [salt okunur HEAD karşılaştırması](rc1/continuation/head-compat-probe.json), [tekrarlama script'i](rc1/continuation/head-compat-probe.cjs). Yerel HEAD'in canlı Pages ile aynı olduğu doğrulanmadı; bu sonuç canlı ortamda kesin hata iddiası değildir.

Mevcut `static.yml` yalnız yeni `rc1-public` artifact’ını alır; önceki artifact’ların asset’lerini taşıyan veya doğrulayan bir adım içermez. GitHub’ın [deploy-pages dokümanı](https://github.com/actions/deploy-pages), Pages için önceden yüklenmiş artifact’ın yayımlandığını belirtir. Bu bulgu, gerçek hostun eski URL’ye kesin 404 vereceğini iddia etmez; mevcut kodla eski URL’nin erişilebilirliği kanıtlanamaz. SRI/içerik hash’i yeni HTML’nin yanlış modülle karışmasını engeller, eski HTML’nin ve kilit protokolüne katılmayan eski sekmelerin yaşam döngüsünü yönetmez.

Yerel HEAD'in giriş HTML'sinde P0-08 `RitimTransactions.open` bootstrap'ı ve `transactions.js` referansı da yoktur. Bu tek başına canlı sitenin sürümünü kanıtlamaz; fakat önceki artifact'ın kilit protokolüne katılıp katılmadığı incelenmeden eski scriptleri erişilebilir tutmak, eski yazıcıyı yeniden çalıştırma riski taşıyabilir. Eski hash'leri korumak ve eski kilitsiz istemcilerin yazmasını engellemek birlikte ele alınmalıdır. Aynı origin'deki statik site, önceden önbelleğe alınmış/halen açık ve kilide katılmayan kodu sunucu yetkisi gibi zorla durduramaz.

Yayından önce somut kabul: önceki onaylı artifact ve hash manifesti elde edilip saklanmalı; hosting için önceki immutable JS/CSS dosyalarının nasıl korunacağı belirlenmeli, her iki sürümün dosya bütünlüğü ve eski/yeni HTML ile geçiş kontrollü ortamda sınanmalı. İzinli bir yaklaşım seçilip doğrulanmadan “eski asset korunuyor” denmemeli. Eski yazıcı sekmeler kapatılmalı. Bu çalışma canlı siteyi veya Pages ayarlarını değiştirmedi.

Önerilen geçiş testi, önceki gerçek artifact mevcut olduğunda ayrı test origin'inde yapılır:

1. Önceki giriş HTML’sindeki JS/CSS URL'lerini ve checksum'larını belirleyin. Önceki dosyaları güvenilir artifact'tan alın; örnek probe dosyalarını gerçek eski sürüm yerine kullanmayın.
2. Eski HTML ve eski asset'ler önbellekteyken yeni public artifact etkinleştirildiği senaryoyu sınayın. Eski HTML'nin istediği her dosya doğru checksum ile erişilebilir olmalı; yeni HTML yalnız yeni hash'leri yüklemeli.
3. Eski yazıcı sekmeleri kapatıp yeni giriş HTML'sini doğrulayın. Testleri yalnız ayrı kurgusal `:copy:` veri anahtarında yapın; reload, Web Locks ve UX-07 kontrolünden sonra eski/yeni snapshot hash'lerini karşılaştırın.
4. Önceki uyumlu artifact'a rollback ve geçiş süresince her iki sürümün asset erişimini doğrulayın. HTTP cache başlıkları, kullanıcıların açık sekmeleri ve hostun eski dosyaları ne kadar tuttuğu gerçek ortamda kabul edilmelidir.

## Temiz kopya / Node sürümü

İncelenen 484 dosya, hash kontrolüyle ayrı geçici dizine kopyalandı. Gerçek origin ve mevcut tarayıcı profili kullanılmadı. Yeni kabuk ilk denemede Node 20.19.5/npm 10.8.2 seçti; npm `EBADENGINE` uyarısına rağmen devam ettiği için o deneme kesildi. `.nvmrc` tek başına her kabukta sürümü otomatik seçmez. Node 22.20.0/npm 10.9.3 açıkça seçilip `npm ci` ve tam `npm run test:ci` tekrar başlatıldı.

İlgili makinede `nvm use` varsa proje kökünde çalıştırın; ardından `node --version` ve `npm --version` ile sırasıyla 22.20.0 ve 10.9.3 doğrulayın. `nvm` yoksa aynı sürümleri yöneticinizin sağladığı yöntemle seçin. CI `setup-node` ile `.nvmrc` sürümünü kuracak biçimde yapılandırıldı; uzaktaki CI çalışması henüz yapılmadı.

**Son koşu tamamlandı:** temiz macOS kopyasında Node 22.20.0/npm 10.9.3, `npm ci` ve açık Chrome 156.0.8078.48 seçimiyle `npm run test:ci` **exit 0** verdi. Alan **292/292**, paketleme ve yeni gate testleri **8/8**, HTTP/browser smoke **1/1**, kaynak **110/110** ve artifact **110/110**; sıfır beklenmeyen uygulama hatası ve sıfır skip. Bunlar aynı browser senaryolarının iki hedefte çalıştırılmasıdır.

[CI logu](rc1/continuation/clean-mac/ci.log), [sürüm ve npm kurulumu](rc1/continuation/clean-mac/versions.log), [kaynak suite özeti](rc1/continuation/clean-mac/source-browser/summary.json), [RC1 suite özeti](rc1/continuation/clean-mac/rc1-browser/summary.json), [smoke kanıtı](rc1/continuation/clean-mac/smoke.json). Test sunucuları geçici loopback adreslerini, browser temiz profilleri kullanır. Bu koşu **macOS üzerindeki yerel Chrome ile** yapılmıştır; Playwright-managed Chromium veya Linux/GitHub Actions üzerinde çalıştırılmış sayılmaz.

## Bu tur değişen dosyalar

- `scripts/run-domain.cjs`, `package.json`: zorunlu suite, asgari sayım ve sıfır skip kapısı; iki negatif gate testinin npm/CI komutuna eklenmesi.
- `tests/rc1-domain-gate.test.cjs`: eksik suite ve yetersiz test sayısı testleri.
- `tests/p0-persistence-browser.cjs`: asenkron recovery reddini bekleyen ve yeni kopya oluşmadığını doğrulayan test.
- Bu rapor, `docs/RELEASE_CHECKLIST.md` ve `docs/rc1/continuation/`: inceleme, iki build deneyi ve yeni test kanıtları.

Uygulamanın HTML, CSS, JS, PDF ve domain iş kuralları değiştirilmedi. Git index ve gerçek tarayıcı verileri korunur.

## Kalan yayın kapıları

- Desteklenen temiz Linux üzerinde Playwright yönetimli Chromium ve GitHub Actions gerçek koşusu. Bu bilgisayarda container/Linux çalıştırıcısı bulunmadı; macOS 13 yönetilen Chromium kurulumunu desteklemiyor.
- Gerçek Android Chrome ve iOS Safari kabulü: [mobil kabul listesi](MOBILE_ACCEPTANCE_CHECKLIST.md).
- İnceleme sonrası sabit candidate branch/commit, CI ile eşlenmiş dosya kümesi ve kullanıcı yetkisi kapsamındaki release süreci.
- Eski/yeni asset ve HTML cache geçişi, hedef origin, yedek/import ve uyumlu rollback kabulü.
- Gerçek veri/kullanıcı/çok cihazlı kullanım öncesi gerçek kimlik-yetki ve sunucu transaction/idempotency; yerel kurgusal demoda bu kapsam ayrı kalır.

Yerel RC incelemesine devam edilebilir; bu koşullar kapanmadan public yayına GO verilmez.
