# P0-01 / P0-02 / P0-03 uygulama raporu

Tarih: 26 Ekim 2026. Temel: `a28d562` ve `UX_AUDIT_REPORT.md`, `UX_GAP_BACKLOG.md`, `UX_SCREEN_MAP.md`, `UX_E2E_TEST_RESULTS.md` belgelerindeki bulgular. Denetim belgeleri başlangıç durumunun kaydı olarak korunmuştur; aşağıdaki sonuçlar bu uygulama turuna aittir. GitHub'a push veya dağıtım yapılmadı.

## Önce incelenen veri bağımlılıkları

| Önceki kaynak | Bağımlı ekran / işlem | Karar |
|---|---|---|
| `sampleStageStocks` sabit örnek dağılımı | Dashboard, sipariş kartı, sipariş detayı | Aktif stok ve sevk hesabından çıkarıldı. Özgün değerler sipariş detayında açıkça etiketlenen geçmiş bölümünde görülebilir. |
| `state.shipments` eski iş emri sevkiyatları | Eski sevkiyat listesi ve `saveShipment()` | Kayıtlar değiştirilmez. Salt okunur geçmiş olarak gösterilir; mevcut README'deki ayrım korunarak UX-06 hareketlerine sessizce eklenmez. |
| `state.jobs[].good/scrap` ve `ux05` | Üretim denklemi, yeni sağlam üretim sınırı | Denklemin okuma hesabı ortak modüle taşındı. UX-05 kayıt/kalite/vardiya/kapatma doğrulamaları korunur. `legacyGood`/`legacyBaseline` başlangıç değerleri yeni stok sayılmaz. |
| `state.ux06[orderId]` hareket dizileri | Malzeme, fason, final onay, müşteri sevkiyatı/iadesi | Aktif miktarların tek kaynağı. Üretim kaynağı ve son operasyon uygunluğu ile birlikte hesaplanır. |
| Bağımsız satış HTML'sinin `ritimFlowLiteDemo` anahtarı | Ayrı eski demo | Otomatik veri aktarılmaz. Eski sevkiyat yazma yolları kapalı; geçmiş ve diğer mevcut demo ekranları korunur. |

Başlangıçta iki ayrı sevkiyat yazıcısı ve sabit örnek dağılımı aynı kavramı farklı hesaplıyordu. Artık ana uygulamada müşteri sevkiyatı ekleyen tek işlem `RitimShipping.ship()`; tüm aktif ekranlar `RitimQuantities` modelini okur. Bu değişiklik fiziksel lot/konum sistemi geliştirdiğimiz anlamına gelmez.

## Küçük modüller ve hesap sözleşmesi

`assets/js/quantity-model.js` DOM veya localStorage erişimi olmayan saf okuma modelidir. Okumak için boş defter oluşturmaz, mevcut kaydı değiştirmez. Üretim planını, kabul/sonuç bakiyelerini, malzeme ve tahsis toplamlarını, fason açık miktarını, uygun final onayı ve müşteri sevk bakiyelerini hesaplar. Tarayıcı ve Node testlerinde aynı kod kullanılır.

- `alınan = sağlam + üretim hurdası + ayar firesi + kontrol bekleyen + rework bekleyen + henüz işlenmeyen`
- `net müşteri sevkiyatı = UX-06 müşteri sevkiyatları − ilgili müşteri iadeleri`
- `tamamlanma yüzdesi = net müşteri sevkiyatı / sipariş miktarı × 100`
- `sevke hazır = doğrulanmış final onayı − toplam müşteri sevkiyatı`; karantina iadeleri bu stoğa eklenmez.
- Fason gönderimi/dönüşü müşteri sevkiyatı sayılmaz. Tamamlanma durumu yuvarlanmış yüzdeye göre belirlenmez.

`assets/js/shipment-service.js` fason gönderimi, final onayı ve müşteri sevkiyatı için ortak işlem sınırıdır. İşlem anında miktarı yeniden hesaplar; devre dışı bırakılmış bir butona veya önceden hesaplanmış değere güvenmez. Pozitif güvenli tam sayı, uygun miktar ve benzersiz/zorunlu irsaliye kontrolleri korunur. Başarılı işlem yeni kayıt ekler; mevcut kaydı yeniden yazmaz. Kalıcılaştırma mevcut `save()`/hareket geçmişi yolunda kalmıştır; P0-07/08 kapsamındaki atomiklik ve eşzamanlılık bu turda çözülmemiştir.

Yeni final onayında `id`, rota imzası, son operasyon indeksi, onaylayan kullanıcı ve tüketilen üretim/fason dönüş kaynakları bulunur. Yeni sevkiyatta hangi final onayından kaç adet tüketildiği saklanır. Fason gönderiminde kaynak iş emirleri ve miktarları bulunur. Böylece farklı bir iş emri önceki iş emrinin final onayını devralamaz ve kısmi işlemler aynı kaynağı tekrar tüketemez. Bunlar iş emri/belge düzeyinde bağlantılardır; tam lot veya depo transfer modeli değildir.

## Son operasyon / final kalite kapısı

Mevcut uygulamanın kanıtlayabildiği iki rota biçimi desteklenir:

1. **Tek iç operasyon:** İlgili UX-05 iş emri kapanmış olmalı; kontrol/rework/işlenmemiş/işe alınmamış miktar ve vardiya devri açık olmamalı. Yeni sağlam miktar fiziksel teslim ve iş emri tahsisiyle desteklenmeli. Bundan sonra Yönetici final onayı ve müşteri sevkiyatı yapılabilir.
2. **İç operasyon → tek son fason operasyon:** Doğrulanmış sağlam iç üretim kısmen gönderilebilir; üst iş emrindeki diğer parçaların üretimi devam edebilir. Son fason işlemin tamamlanan miktarı, kaynak üretime bağlanan gönderim belgesinin sınırları içindeki sağlam dönüş miktarıdır. Yalnız dönen miktar final kaliteye sunulur ve onaydan sonra sevk edilir. Böylece çalışan UX-06 kısmi hareket davranışı korunur.

`İmalat → Tesviye`, `İmalat → Tesviye → Kaplama`, fason sonrası iç operasyon ve birden fazla fason gibi diğer rotalarda operasyonlar arası fiziksel aktarım kanıtı mevcut değildir. Yalnızca `op` indeksini veya sağlam sayacını değiştirerek final onay ve müşteri sevkiyatı yapılamaz; ekran gerekçeyi gösterir. P0-04/05'i bu turda gerçekleştirmek yerine kanıt eksikken işlem engellenir.

Rota, kaynak iş emri, üretim uygunluğu veya final onay bağlantısı değişirse sevkiyat anındaki yeniden doğrulama başarısız olur. Fasona çıkmış stoğun rotası fasonu kaldıracak şekilde değiştirilirse de final onay engellenir.

## Eski verilerin korunması ve görünür etkiler

Hiçbir localStorage anahtarı silinmedi/değiştirilmedi; reset veya otomatik migration çalıştırılmadı. Eski kayıtlar dizi içinde kaldı. Eski örnek aşama dağılımları ve `state.shipments` kayıtları, aktif net sevkiyatın dışında oldukları belirtilerek gösterilir. Önceki sayılara göre dashboard/sipariş yüzdelerinin değişmesi beklenir; eski sayılar silinmiş veya doğrulanmış stok kabul edilmiş değildir.

Önceden kaydedilmiş UX-06 müşteri sevkiyatları/iadeleri, kayıtlı müşteri hareketleri oldukları için net sevkiyat geçmişinde kalır. Ancak önceki final onayları ve fason gönderimlerinde üretim/operasyon bağlantısı bulunmuyorsa bunlar yeni sevke hazır stok sağlamaz; ilgili siparişte yeni final onay/sevkiyat engellenir ve inceleme mesajı gösterilir. Otomatik bağlantı üretmek veya geçmişi yeniden onaylamak bu kapsamda yapılmamıştır. Geçmişi aktif stokla bağlamak için ayrıca açık ve yetkili mutabakat akışı gereklidir.

`openShip()` doğru siparişin kontrollü formunu açar. `saveShipment()` de ortak işlem sınırına gider; final onay, kaynak ve irsaliye olmadan kayıt oluşturamaz. Eski satış sayfasındaki `ship()`/`openShipment()` artık sevkiyat yazmaz. Sayfa ana uygulamayı açan bir bağlantı sunar; ayrı anahtardaki geçmişi otomatik taşımaz.

## Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `assets/js/quantity-model.js` | Yeni ortak, saf miktar okuma modeli ve uygunluk hesapları. |
| `assets/js/shipment-service.js` | Yeni ortak final onay/sevkiyat/fason gönderim işlemleri ve kaynak bağlantıları. |
| `index.html` | Modülleri ilk render öncesi yükleme; sipariş/dashboard ilerlemesi ve durumu; eski kayıtların açık geçmiş gösterimi; eski sevkiyat fonksiyonlarını ortak kapıya bağlama. |
| `assets/js/ux-operator.js` | Plan, kullanılan ve işlenmemiş miktar okumalarını ortak üretim denklemine bağlama; mevcut işlem doğrulamaları korunur. |
| `assets/js/ux-logistics.js` | Ortak okuma/işlem modüllerini kullanma; mevcut kısmi kabul/tahsis/dönüş/iade sınırlarını koruma; aynı kaynaktan sevkiyat listesi ve uygunluk mesajları. |
| `assets/js/ux-orders-workorders.js` | Sipariş detayı miktar açıklamasını gerçek ortak hesapla uyumlu hale getirme. |
| `ritim_flow_lite_sales_polished.html` | Bağımsız eski demo sevkiyatının UI ve fonksiyon düzeyinde yazmasını engelleme. |
| `tests/p0-fixtures.cjs` | Kurgusal ve yalıtılmış regresyon verileri. |
| `tests/p0-domain.test.cjs` | 26 otomatik alan/regresyon testi. |
| `tests/p0-browser.cjs` | 16 Playwright tarayıcı regresyonu; geçici localhost sunucusu ve temiz profiller. |
| `docs/p0/evidence/*` | Son testlerin TAP/JSON sonuçları ve ekran görüntüleri; ilk denetim kanıtlarının üzerine yazılmaz. |
| `docs/P0_IMPLEMENTATION_REPORT.md` | Bu bağımlılık, davranış, test ve risk raporu. |

## Otomatik testler

Çalıştırma:

```sh
node --test tests/p0-domain.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p0-browser.cjs
```

Playwright önceki denetimin geçici `/tmp/ritim-ux-audit` kurulumundan kullanıldı. Depoya yeni runtime bağımlılığı veya package manifest eklenmedi. Tarayıcı testi kurulu Chrome'u kullanır; başka kurulum için `AUDIT_CHROME` verilebilir. Uygulama içi tarayıcı bağlantısı yine kullanılabilir tarayıcı döndürmediği için bağımsız Playwright kullanıldı.

- Alan testleri: **26/26 başarılı**. Saf okumalar/veri koruma, 250/150/100 denklemi, 20/20 → %100 ve iade5 → %75, kalite/rota/kaynak kapıları, kısmi onay/sevkiyat bağlantıları ve fason üst sınırları.
- Tarayıcı testleri: **16/16 başarılı**, uygulama sayfa/istek hatası **0**. Son çalıştırma sonucu [browser-results.json](p0/evidence/browser-results.json); ayrıntılı test isimleri bu dosyada bulunur. 1440, 390 ve 360 pikselde eski veri byte eşitliği ve üretim→kapatma→kalite→kısmi sevkiyat→iade→tüm aktif ekranlarda aynı miktar senaryoları çalıştırılır. Ayrıca eski API/ayrı HTML bypass denemeleri, karma rotalar, malzeme kısmi kabul/tahsis, fason kısmi dönüş ve vardiya/rework regresyonları yürütülür.
- [domain-tests.tap](p0/evidence/domain-tests.tap) alan testinin gerçek çıktısıdır. Tarayıcı konsol/istek/sayfa hata olayları JSON'da tutulur; favicon404 uygulama hatası olarak sayılmaz.
- İki HTML'nin inline scriptleri, tüm JavaScript modülleri için `node --check` ve `git diff --check` çalıştırılır.

İlk tarayıcı test turunda test kurulumundaki üç sorun düzeltildi: kapalı geçmiş `<details>` içeriği okunmadan önce açıldı; eski API denemesinden kalan test inputları sonraki denemeden kaldırıldı; ayrı demo modalına doğru test iş emri seçildi. Başarısız denemeler geçmişi gizlemek için uygulama kontrolleri gevşetilmedi. İlk denetimin 32 test/14 başarılı/18 başarısız sonucu bu turdaki hedefli regresyon sonucu değildir; kapsam dışındaki denetim bulguları çözülmüş sayılmaz.

## Halen açık riskler / kapsam sınırı

- P0-04 fiziksel transfer/lot/konum ve P0-05 operasyon bazlı planlama yok; bu nedenle karma rotalar güvenli biçimde engellenir. Kaynak bağlantıları tam fiziksel stok konum sistemi değildir.
- Eski kanıtsız final onaylarının ve iki ayrı demo anahtarının yetkili mutabakat/aktarım ekranı yok. Kayıtlar korunur, otomatik güvenilir stok yapılmaz.
- P0-07 depolama kotası/bozuk şema kurtarma ve P0-08 sekmeler arası eşzamanlılık çözülmedi. Mevcut `save()` başarısız olduğunda hafıza/kalıcı veri ayrışabilir; çok kullanıcılı atomik stok garantisi yok.
- Yönetici seçimi gerçek kimlik doğrulama değildir. Tarayıcı belleğini veya localStorage'ı kasıtlı değiştirebilen bir kullanıcıya karşı sunucu yetkilendirmesi sağlanmaz; bu P1 bağımlılığı devam eder.
- UX-07'nin kapsamlı mutabakat eksikleri, ek iş emri planlama, dashboard KPI filtreleri, mobil audit taşması, çizim kimliği/revizyon ve diğer P1/P2 sorunları değiştirilmedi. Ortak saf okuma nedeniyle UX-07'nin boş defter oluşturan yan etkisi ortadan kalktı; bütün P0-06'nın çözüldüğü iddia edilmez.
- Testler localhost üzerinde kurulu Chrome ile yürütülür; canlı GitHub Pages, gerçek iOS/Android ve backend eşzamanlılığı doğrulanmadı.
