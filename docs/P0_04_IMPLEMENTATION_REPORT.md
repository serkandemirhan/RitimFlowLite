# P0-04 — Kontrollü fiziksel transfer

26 Ekim 2026. Kaynak: UX_AUDIT_REPORT, UX_GAP_BACKLOG, UX_SCREEN_MAP, UX_E2E_TEST_RESULTS ve önceki P0_IMPLEMENTATION_REPORT. Bu rapor önceki denetimin tarihsel sonuçlarını değiştirmez.

## Sonuç ve kapsam

Aynı siparişin **aynı iç operasyonundaki** iş emirleri arasında işlenmemiş fiziksel parçalar gönderilebilir, hedefte kabul edilebilir ve kullanılmamış lot fiziksel olarak kaynağa döndüğünde gerekçeyle geri alınabilir. Hareket numarası, giriş/çıkış lotu, kaynak/hedef iş emri, rota, miktar, kullanıcı, zaman ve işlem geçmişi kaydedilir.

250 sipariş / 150 kaynak planı / 100 teslim / 60 sağlam / 3 hurda / 12 kontrol bekleyen örneğinde:

| Aşama | Kaynak işlenmemiş | Yolda | Hedef işlenmemiş | Kaynak işe alınmamış |
|---|---:|---:|---:|---:|
| Başlangıç | 25 | 0 | 0 | 50 |
| 25 gönderildi | 0 | 25 | 0 | 50 |
| Hedef kabul etti | 0 | 0 | 25 | 50 |
| Kullanılmadan kaynağa geri geldi ve dönüş onaylandı | 25 | 0 | 0 | 50 |

Transfer, müşteri sevkiyatı veya yeni malzeme kabulü değildir. Kaynak tahsisi serbest bırakılmaz; hedefte aynı parçalar için ikinci hammadde tahsisi gerekmez. 50 plan parçasının tahsis/plan değişikliği bu işlemle yapılmaz.

## Önce incelenen bağımlılıklar

- UX-05 `ux05.received` doğrudan teslim geçmişini; good/scrap/pending/setup/rework üretim sonuçlarını tutuyordu. Fiziksel çıkış boyutu yoktu.
- UX-06 sipariş malzeme kabulü ve iş emri tahsisi, ilk fiziksel teslimin sınırını belirliyordu. Transfer kabulünü yeni hammadde kabulü saymak aynı parçayı iki kez sayardı.
- Ortak miktar modeli yalnızca doğrudan teslimi okuyor; üretim kaynağı kanıtını iş emrinin hammadde tahsisiyle karşılaştırıyordu. Transfer girdisinin bu kanıta eklenmesi gerekti.
- Üretime başlama, sonuç kaydı, kapatma ve UX-07 mutabakatı eski teslim sayacına bağlıydı. Bu bağlantılar transferin net etkisini okuyacak şekilde güncellendi.
- Eski `save()` başarısız yazımı çağırana bildirmiyor. Yeni transfer UI komutları, ayrı bir kopyada doğrulama yapıp localStorage yazımı başarılı olduktan sonra canlı durumu değiştiriyor. Uygulamanın genel kayıt sistemi değiştirilmedi.

## Küçük modüller ve veri sözleşmesi

| Dosya | Bu çalışmadaki değişiklik |
|---|---|
| `assets/js/transfer-ledger.js` | Saf transfer toplamları, giriş lotları, lot kullanılabilirliği ve transfer bağlantı kontrolleri. |
| `assets/js/transfer-service.js` | Gönder, kabul, geri al ve üretimde lot tüketimini ayıran komutlar. |
| `assets/js/ux-transfers.js` | Operatör paneli ve tüm iş emirlerine erişen transfer ekranı; kontrollü kayıt. |
| `assets/js/quantity-model.js` | Transfer giriş/çıkışını ortak denkleme ve üretim kaynaklarına bağlar; toplam sağlam üretimi konumdaki doğrulanmış sağlamdan ayırır. |
| `assets/js/ux-operator.js` | Transfer çıkışını üretilebilir miktardan düşer; kabul edilmiş girdiyi üretime açar; hedefte yoldaki miktarı teslim kapasitesinden ayırır; üretimde lot tüketimini kaydeder. |
| `assets/js/ux-audit.js` | Transfer kabulünü teslim denklemine dahil eder; transfer bağlantı uyarılarını gösterir. Genel P0-06 denetim motoru değişikliği değildir. |
| `index.html` | Yeni modülleri bağımlılık sırasıyla yükler. |
| `tests/p0-transfer-fixture.cjs` | Kurgusal 250/150/100 ve hedef iş emri verisi. |
| `tests/p0-transfer.test.cjs` | Transfer, lot, kapasite, tekrar, geri alma ve sevkiyat regresyonları. |
| `tests/p0-transfer-browser.cjs` | Masaüstü/mobil UI, kayıt, yeniden yükleme, kalite ve sevkiyat testleri. |
| `tests/p0-browser.cjs` | Önceki testleri ayrı kanıt dizinine yazmak için isteğe bağlı `P0_EVIDENCE_DIR`. |

`physicalTransfers` yalnızca açık bir gönderme komutuyla oluşur. `physicalLotUses` transferle ilgili iş emirlerinde yeni üretim kaydı yapıldığında oluşur. İlk kez transfer alacak iş emrinin UX-05 defteri, açık gönderme işleminin parçası olarak başlatılır. Okuma işlemleri bu kayıtları yaratmaz; eski veri silinmez veya arka planda dönüştürülmez.

`INPUT:<iş emri>` mevcut doğrudan teslimlerin **toplu giriş lotudur**. Bu, geçmişte kaydedilmemiş bir tedarikçi parti numarasını varmış gibi göstermez. Her kabul edilen hareket `TRANSFER:<hareket no>` lotunu açar. Yeni üretim tüketimi önce eldeki giriş lotlarına sırayla bağlanır; çıkan ve daha önce tüketilen miktarlar tekrar kullanılamaz. Sonradan yeni hammadde gelmesi tüketilmiş transfer lotunu geri alınabilir yapmaz.

Ortak denklem:

```text
fiziksel alınan = doğrudan teslim + kabul edilen transfer
fiziksel alınan = üretim sonuçları/bekleyen + transfer çıkışı + işlenmemiş
başlanmamış plan = plan − fiziksel alınan
hedef yeni teslim kapasitesi = başlanmamış plan − kabul bekleyen transfer
```

Gönderim anında çıkış kaynak kullanılabilirliğinden düşer. Kabul öncesinde hedef üretim miktarı artmaz. Kabul edilen transfer üretim kaynağı kanıtına dahil olur; final kalite ve müşteri sevkiyatı yine önceki ortak komutlardan geçer. Toplam sağlam üretim geçmişi düşürülmez; mevcut fason/müşteri çıkışlarından ayrı konum bakiyesi gösterilir.

Gönderim/kabul/geri alma Yönetici seçimi gerektirir. Aynı hareket numarası yeniden kullanılamaz; kabul veya geri alma tekrarlandığında ikinci bir miktar etkisi oluşmaz. Tüm durum geçişleri geçmişe eklenir. Kabul ve geri alma hareketin tamamı içindir; kısmi taşıma ayrı hareketlerle yapılır. Geri alma için gerekçe ve parçaların fiziksel olarak kaynakta olduğunun onayı gerekir. Tüketilmiş veya devam eden başka transfere bağlanmış lot geri alınamaz. Kapalı veya vardiya devri bekleyen kaynağa dönüş kabulü engellenir; bu işlem iş emrini sessizce yeniden açmaz.

## Testler ve kanıt

```bash
node --test tests/p0-domain.test.cjs tests/p0-transfer.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p0-transfer-browser.cjs
P0_EVIDENCE_DIR=docs/p0-04/evidence/prior-suite \
  NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p0-browser.cjs
```

- **56/56 domain testi geçti:** önceki 26 test + yeni 30 transfer regresyonu.
- **9/9 yeni tarayıcı senaryosu geçti:** 1440/390/360 genişlikte gönder/kabul/yeniden yükleme; fazla gönderim; yoldaki miktarın hedef teslim kapasitesini ayırması; geri alma; kabul → üretim → kontrol → kapatma → final onay → müşteri sevkiyatı; depolama hatası; eski veriyi okumayla değiştirmeme; makine atanmamış hedefte kabul.
- **16/16 önceki tarayıcı senaryosu geçti:** P0-01/02/03, UX-05 üretim denklemi, kontrol/rework/vardiya devri ve UX-06 kısmi hareket kontrolleri korunuyor.
- Her iki tarayıcı çalışmasında uygulama hatası **0**. Yeni ekranlarda 1440/390/360 genişlikte yatay taşma kontrol edildi; 360px atanmamış hedef ekranı görsel olarak da incelendi.
- Yeni JS dosyaları ve değişen JS dosyalarının sözdizimi ile `git diff --check` kontrol edildi.

Kanıtlar: [domain TAP](p0-04/evidence/domain-tests.tap), [yeni tarayıcı sonuçları](p0-04/evidence/browser-results.json), [önceki testlerin yeniden çalıştırılması](p0-04/evidence/prior-suite/browser-results.json), [360px hedef kabulü](p0-04/evidence/accepted-360.png), [atanmamış hedef](p0-04/evidence/unassigned-target-360.png).

Tarayıcı becerisindeki bağlantı denendi; kullanılabilir uygulama içi tarayıcı bulunamadı. Testler localhost üzerinde kurulu Chrome ve geçici Playwright profilleriyle çalıştı. Kullanıcının gerçek localStorage profiline erişilmedi. Gerçek mobil cihaz veya canlı site testi değildir.

## Açık sınırlar / riskler

- P0-05 operasyon seçimi, miktarlı bölünmüş planlama ve rezervasyon yaşam döngüsü henüz yok. Operasyonlar arası sağlam aktarımı açılmadı; önceki çok operasyonlu rota sevkiyat engeli sürüyor. Bu çalışma P0-04'ün 25 fiziksel / 50 plan ayrımı ve aynı operasyon transfer akışını tamamlar.
- Lokasyon iş emri kimliğiyle temsil edilir; makine bilgisi yardımcı etikettir. Genel depo/raf, tedarikçi lotu, malzeme birimi ve parti bazlı kalite sistemi değildir.
- Mevcut iş emirlerinin eksik `plannedQty` alanında önceki sipariş miktarı varsayımı sürer. Hedef kapasitesi bu mevcut plana göre sınırlandırılır; toplam planların uygunluğu P0-05'e kalır.
- Kullanıcı seçimi gerçek kimlik doğrulama değildir. Rol güvenliği P1-14 kapsamındadır.
- Yeni transfer komutlarının kota hatasında kısmi bellek yazımı önlendi. Eski üretim/lojistik kayıtlarının genel hata kurtarma sorunu ve çok sekmeli eşzamanlı yazma yarışı çözülmedi (P0-07/08). Lot tüketimi de mevcut üretim kaydının kayıt yaşam döngüsünü kullanır.
- Bozuk yeni transfer bağlantıları işlemleri engeller; otomatik onarım veya tarihsel mutabakat yapılmaz. Genel veri şema kurtarma ve kapsamlı invariant motoru bu işin dışında kalır.
- Önceki denetimdeki diğer P0/P1 sorunları değiştirilmedi. Git staging alanına müdahale edilmedi; commit, push ve deploy yapılmadı.
