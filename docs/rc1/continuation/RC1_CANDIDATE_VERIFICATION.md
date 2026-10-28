# Demo v1.0 RC1 — candidate doğrulaması

Yerel son sonuçlar: **292/292 alan, 12/12 paketleme/karakterizasyon, 1/1 smoke, kaynak 110/110 ve artifact 110/110 tarayıcı**; ek izolasyon suite'leri kaynak ve artifact için ayrı ayrı **7/7**. Uygulama hatası 0. `test:ci` komutuna izolasyon suite'leri ilk tam koşu başladıktan sonra eklendi; onlar ayrıca çalıştırıldı, güncel birleşik komut henüz tek seferde çalıştırılmadı. `npm ci` başarılı. GitHub Actions **NOT EXECUTED**.

## 28 Ekim 2026 — bağımsız kurgusal demo

**Yayın kararı NO-GO:** GitHub Actions, gerçek cihaz kabulü ve candidate incelemesi açık. Yeni kaynak, `ritimFlowLite:fictional-demo:v1` anahtarını kullanır; eski sabit anahtarlar okunup otomatik aktarılmaz veya değiştirilmez. İlk kurulum Web Locks altında sürümlü komut makbuzuyla kaydedilir; kota veya kilit yokluğunda kayıt kapalıdır. Recovery yeni namespace ve açık yedek kopyalarıyla çalışır. Bu, keyfî aynı-origin koduna karşı güvenlik sınırı değildir. Önceki legacy import incelemesi eski stratejinin tarihsel kaydıdır.

Yerel kurgusal testte `a28d5621f175f2e3f5f101396807d9eba60c4ff7` geçmiş commit'inden çıkarılan gerçek eski HTML/JS ile aynı origin'de yeni UI'dan sipariş oluşturuldu, korumalı test fixture'ı ile üretim tamamlanmış hale getirildi ve yeni sevkiyat yapıldı. Eski sayfanın `saveShipment()` çağrısı yalnız eski key'i değiştirdi; yeni sipariş, sevkiyat, işlem makbuzları ve reload korundu. Yeni ikinci sekmede tekrar komutu idempotentti. Bu yerel commit, halen yayınlanan Pages sürümünün doğrulanması değildir. 5 başlangıç/kurtarma ve 2 birlikte çalışma kontrolü kaynak ve artifact'ta ayrı ayrı başarılıdır. [Ayrıntılar](../../RC1_DEMO_ISOLATION_REPORT.md).

## 27 Ekim 2026 — legacy migration incelemesi

**NO-GO; güvenli namespace/import henüz uygulanmadı.** İki sekmeli karakterizasyon, bilinen sabit anahtarlı eski yazıcının ayrı key'deki deneme kaydına dokunmadığını; ancak lock'a katılmayan eski writer'ın kaynak değerini değiştirip geri almasının byte karşılaştırmalarıyla kesin algılanamayacağını gösterdi. 3/3 schema/integrity preflight ve 2/2 browser karakterizasyonu geçti; bunlar entegre kabul testi değildir. Mevcut candidate hâlâ eski anahtarı kullanır ve yayına uygun değildir. [İnceleme ve kalan işler](../../RC1_LEGACY_MIGRATION_REVIEW.md).

27 Ekim 2026. Karar: **NO-GO**; bu branch yalnız inceleme adayıdır. Branch `release/demo-v1.0-rc1` ayrı worktree içindedir. Commit SHA'sı `git rev-parse release/demo-v1.0-rc1` ile elde edilir; dosya içeriğine aynı commit'in SHA'sı yazılamaz. Commit sonrası ayrı yerel doğrulama kaydı SHA'yı ve index sonucunu verir.

## Kapsam ve koruma

[Tam aday dosya listesi](RC1_INCLUDED_FILES.txt) 96 dosyadır. Buna base commit'ten değişmeden gelen `assets/test` de dahildir; public pakete girmez. [Public manifest](../../RC1_ASSET_MANIFEST.md) bütün 37 HTML/CSS/JS/PDF dosyasını ve hash'lerini listeler. Test fixture'ları ve CI kodu source tree'dedir; testler, belgeler, geçici kanıtlar ve node_modules public artifact'a girmez. Gerekli P0/P1, persistence, integrity ve transactions kaynakları dahildir. Kullanıcı çalışma ağacı ve original staged index ayrı worktree nedeniyle değiştirilmedi; kişisel dosyalar, geçici kanıtlar veya credential'lar eklenmedi. Tarihsel markdown içindeki bazı kanıt bağlantıları candidate dışında bırakılan dosyalara gider; özgün yerel dosyalar korunmuştur.

## Gerçek çalıştırmalar

Temiz kurulum: Node 22.20.0, npm 10.9.3, Playwright 1.64.1, macOS Chrome 156.0.8078.48; `npm ci` başarılı. Mevcut macOS ortamında `AUDIT_CHROME` ile yerel Chrome seçildi; Linux CI Playwright Chromium kurar. `npm run test:ci` çıkış kodu 0:

- Alan regresyonları **292/292**, fail/skip 0.
- Paketleme ve sürüm geçişi testleri **12/12**, fail/skip 0; dört geçiş testinden biri eski yazıcının veri kaybına yol açabildiğini doğrulayan olumsuz karakterizasyondur ve güvenlik onayı değildir.
- Artifact build ve doğrulama **37/37 dosya**; kaynak digest `33c2d8246743b84e6fc1e6b4d386d8402f4387cc75b6d4e18c02ca8267b4a064`. HTTP/browser smoke **1/1**, 37 dosya kontrolü, uygulama hatası 0.
- Kaynak tarayıcı **110/110** ve public artifact tarayıcı **110/110**, her birinde fail 0, beklenmeyen uygulama hatası 0. İki koşuda sırayla 16 temel, 9 transfer, 9 planlama, 11 P1, 34 persistence, 11 integrity ve 20 concurrency testi geçmiştir.
- Testler izole Chrome profilleri ve kurgusal verilerle yürütüldü; gerçek demo verisi kullanılmadı.

GitHub Actions: **NOT EXECUTED**. Branch push edilmedi; macOS'taki yerel çalıştırma Linux/GitHub çalıştırmasının yerine geçmez. Workflow npm ci, Playwright Chromium ve `npm run test:ci` çalıştırır; hata işi başarısız yapar. Pages deploy işi bu adayda açıkça devre dışıdır. Testlerin ve branch koruma ayarlarının GitHub'da doğrulanması ayrıca gerekir.

## Karma sürüm, veri ve geri dönüş

Yerel eski HEAD'in HTML'i kilitsiz `ux-shell.js`, `ux-orders-workorders.js`, `ux-operator.js`, `ux-logistics.js`, `ux-audit.js` ve beş eski isimli CSS kaynağına başvurur; yeni public artifact bu 10 eski URL'yi içermez. [HEAD incelemesi](head-compat-probe.json) canlı Pages veya cihaz cache'i kanıtı değildir. [Hash geçiş deneyi](rollout-probe.json) yeni artifact'ın önceki sürümün hash'li JS dosyasını tutmadığını gösterir; hedef hosting/cache davranışı ayrıca doğrulanmalıdır. Yeni HTML hash ve SRI kullanır ama açık eski kodu durduramaz. Yeni satış sayfası read-only arşivdir; ayrı eski sayfa/kopya cache'de kalabilir.

Dört yeni Node testi, kurgusal snapshot üzerinde açık kopyayla yükseltmeyi, özgün ham kayıt ve yükseltilmiş kaydı koruyarak salt okunur geri dönüşü, ayrı originlerin mantıksal yalıtımını, desteklenmeyen şemada recovery'yi ve eski yazıcı riskini sınar. Bunlar izole in-memory storage modelleridir; gerçek cihaz, gerçek cache veya gerçek hedef origin testi değildir. **Olumsuz bulgu:** aynı storage üzerinde Web Locks'u kullanmayan eski istemci yeni işlemin üstüne yazabilir. Açık yeni sekme değişikliği/gerileyen revision'ı fark edip sonraki komutu durdursa bile kaybedilmiş geçmişi geri getirmez; sekme yeniden açılınca da önceki revision bilinmez. Yeni sekme işlemlerini kilitlemek eski kodu durdurmaz.

Bu nedenle mevcut origin üzerinde güvenli geçiş henüz sağlanmadı; adayın Pages dağıtımı devre dışıdır. Dağıtımdan önce eski yazarlar kapatılmalı, yetkili veri yedeği dışa aktarılmalı, izole origin/depo üzerinde doğrulanmış açık kopyalama ve kayıt mutabakatı yapılmalı; ayrık geçmişler incelenmeli, hedef cache ve kapatma süreçleri gerçek ortamda doğrulanmalıdır. Aynı origin'de farklı key'ler rastgele eski koda karşı güvenlik sınırı değildir. Kod rollback'i veri rollback'i değildir: yeni kaydı eski kodla yazdırmayın; önce ham yedeği ve yeni hareket geçmişini koruyun, eski veriyi ayrı read-only ortamda inceleyin ve birleştirmeyi açıkça planlayın. Gerçek çok cihazlı kullanım için sunucuda transaction/idempotency/yetkilendirme gerekir.

## Açık kapılar

- GitHub Actions ve branch koruma doğrulaması; tek sabit commit ve artifact üzerinde review.
- Eski kilitsiz yazarlardan ve cache'den güvenli geçiş; kurgusal izole origin ile hedef ortam doğrulaması.
- Android Chrome ve iOS Safari gerçek cihaz kabulü kullanıcı isteğiyle ertelendi; [mobil liste](../../MOBILE_ACCEPTANCE_CHECKLIST.md) açık kalır.
- Gerçek kullanıcı/veri öncesi sunucu kimliği, yetkilendirme, çok cihazlı atomiklik ve merkezi yedekleme.
