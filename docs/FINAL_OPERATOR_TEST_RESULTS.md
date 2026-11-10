# Operatör son doğrulama sonuçları

## Canlı yayın güncellemesi

Kullanıcının açık yayın talebiyle `90185389aff4c8ab229f605064eeb60d7fc4361d` ana dala gönderildi. 2026-11-08 19:08 UTC kontrolünde canlı PDF modülü, workspace CSS ve premium API JavaScript içerikleri yayımlanan yerel sürümle eşleşti (satır sonları normalize edilerek SHA-256). Yeni giriş tasarımı HTTP 200 ile görüldü. [Yayın kanıtı](../artifacts/cloud-release/iphone-pilot/live-release-check.json). Aşağıdaki yayımlanmadı/sürüm farkı ifadeleri önceki test turunun tarihsel durumudur. Kullanıcının canlı PDF ve iPhone native etkileşim kabulü hâlâ gereklidir; yayın, pilot kabulü anlamına gelmez.

Tarih: 2026-11-08. Karar: **NOT READY** — fiziksel iPhone P0 kabulü tamamlanmadı; yerel düzeltmeler canlı sürümle eşleşmiyor.

## İncelenen kapsam

### iPhone yeniden bağlantı ve PDF kontrolü — son güncelleme

Eski Safari oturumu yanıtsız ve eşleşmiş durumdaydı. Yalnız test sürücüsü yeniden başlatılarak fiziksel iPhone / Safari 26.6.1 oturumu kuruldu. Yerel PDF CSS/modülü test sekmesindeki bağımsız fixture modalına enjekte edildi; canlı dağıtım ve oturum gerektiren operatör akışı değiştirilmedi.

- PDF normal: dialog 694 px, renderer 573 px, viewport 454 px, canvas 430 px. İlk sayfa görünür.
- Tam ekran: renderer 640 px, viewport 596 px. İkinci sayfa, zoom, fit ve normal moda dönüş geçti; yatay taşma yok.
- Yöntem: gerçek Safari rendering, DOM ile kontroller. Yerel preview/sentetik PDF; gerçek pinch/pan ve yayımlanmış uygulama kabulü değildir. T06'nın rendering kısmı artık PASS, toplam T06 **PARTIAL**.
- Native WebDriver click/send keys tekrar denendi: email odaklandı fakat değer uzunluğu 0 kaldı; visualViewport 714 px kaldı. Klavye/dokunma kabulü hâlâ BLOCKED; DOM doldurma yapılmadı.
- [PDF ölçümleri](../artifacts/cloud-release/iphone-pilot/pdf-recheck.json), [normal](../artifacts/cloud-release/iphone-pilot/35-pdf-fixed-normal.png), [tam ekran](../artifacts/cloud-release/iphone-pilot/36-pdf-fixed-expanded.png), [ikinci sayfa](../artifacts/cloud-release/iphone-pilot/37-pdf-fixed-page-two.png), [zoom](../artifacts/cloud-release/iphone-pilot/38-pdf-fixed-zoom.png), [geri dönüş](../artifacts/cloud-release/iphone-pilot/39-pdf-fixed-normal-return.png), [native deneme](../artifacts/cloud-release/iphone-pilot/native-keyboard-retry.json).

Alttaki ilk tur timeout satırları tarihsel sonuçtur; bağlantı engeli bu yeniden denemede aşıldı. Gerçek klavye kabulü ve canlı sürüm eşleşmesi açık olduğundan genel karar NOT READY olarak kalır.

- [Önceki test sonuçları](master-development/14_TEST_RESULTS.md), mevcut operatör, PDF, üretim/kalite/atama kaynakları ve otomatik testler incelendi.
- İstenen `operator-refinement.zip` bulundu ve arşiv girdileri incelendi; önceki ekran kanıtıdır, güncel fiziksel cihaz testi değildir. Güncel [operatör kanıt klasörü](../artifacts/cloud-release/operator-refinement/) korunur; eski ZIP temizlik kapsamındadır.
- Tasarım yeniden yapılmadı. Önceden bekleyen giriş tasarımı değişiklikleri bu test sürümünün parçasıdır; yeni authentication tasarımı yapılmadı.

## Düzeltmeler ve gerekçeler

| Dosya | Değişiklik / gerekçe |
|---|---|
| [PDF CSS](../assets/css/ux-premium-workspace.css) | Önceki turdan: belirli modal yüksekliği, sıfır minimum flex boyutları; tam ekranda açıklama satırının render sırasında yer değiştirip zoom'u sıfırlaması önlendi. |
| [PDF viewer](../integration/drawing-viewer.mjs) | Önceki turdan: visualViewport yüksekliği, ilk yerleşim sonrası sığdırma, boyut değişiminde yeniden ölçüm ve listener temizliği. |
| [Operatör entegrasyonu](../integration/premium-api.js) | Bu tur: bekleyen işlem sırasında refresh guard; üretim isteğinde scope/order/job kimliklerinin yakalanması; PDF kapandığında önceki kaydırma konumuna dönüş. Önceki görsel değişiklikler korunur. |
| [Komut koruma testi](../tests/operator-command-guard.test.cjs) | Bekleyen işlem sırasında yenileme ve iş değiştirmenin aktif verileri temizlemediği doğrulanır. |
| [Operatör testi](../tests/operator-refinement-browser.test.cjs) | Eski metin beklentisi son kabul edilen tek kalite bekleme açıklamasına uyarlandı; tekrar sayısı ayrıca kontrol edilir. |
| [Kalite sözleşmesi](../backend/docs/QUALITY_API_CONTRACT.md) | Tarihsel üretim sınıfları ile güncel kalite ve sevk miktarı ayrıldı; eski alanlar geriye uyumlu bırakıldı. |
| [Üretim kaynağı](../backend/src/production-execution.js) | Eski alanların yalnızca uyumluluk amaçlı olduğuna kod açıklaması eklendi; davranış değişmedi. |
| [B04A](../backend/docs/B04A_PRODUCTION_EXECUTION.md), [B04B1A](../backend/docs/B04B1A_QUALITY_DISPOSITION.md) | Geçersiz hale gelen milestone sınırlamaları güncel sözleşmeden ayrıldı. |
| [Android PDF testi](../scripts/windows/android-pdf-preview.cjs) | Yerel viewer'ı USB üzerinden gerçek telefonda test eder; canlı kayıt oluşturmaz. |

## Test matrisi

| ID | Konu / beklenen | Platform ve yöntem | Sonuç / gerçekleşen | Kanıt / açık sorun |
|---|---|---|---|---|
| B01 | Backend, kalite, üretim, yetki, idempotency | Yerel Node 22 + ayrı PostgreSQL; API/test | PASS: 217/217, sıfır skip/fail; 46 migration, restricted readiness, backup/restore | [TAP](../artifacts/native-postgres/backend.tap). Canlı veri kullanılmadı. |
| B02 | 3 üretim → 2 onay + 1 hurda; erken kapatma reddi | Yerel PostgreSQL | PASS: B01 içindeki çapraz endpoint testi | [Test](../backend/test/b04b1a-quality.test.js); önceki odaklı test 21/21. |
| B03 | Rework, yeniden muayene, provenance, çelişkili karar | Yerel PostgreSQL | PASS: B01 kapsamı | Aynı TAP; fiziksel cihaz etkileşimi değildir. |
| U01 | Bekleyen komutta yenileme/geçiş; draft, recovery, scope | Yerel Chromium/VM | PASS: seçilen 5 dosyada 11/11 | [Komut testi](../tests/operator-command-guard.test.cjs), [resilience](../tests/operator-resilience-browser.test.cjs), [scrap recovery](../tests/operator-scrap-recovery-browser.test.cjs), [adapter](../tests/operator-quality-adapter.test.cjs), [refinement](../tests/operator-refinement-browser.test.cjs). İlk eski metin assertion'ı düzeltilip tekrar çalıştırıldı. |
| P01 | PDF normal, tam ekran, 3 sayfa, pinch/pan, fit | Fiziksel Samsung SM-A326B, Android 13 / Chrome; native CDP touch + ADB screenshots; yerel USB preview | PASS: normal renderer 585 px, viewport 466 px; zoom canvas 1638 px; pan 90 px; ana sayfada taşma yok | [Ölçümler](../artifacts/cloud-release/iphone-pilot/android-pdf-preview.json). Sentetik PDF; canlı sürüm değildir. İlk uyku ve kısa tap bekleme denemeleri sonuç sayılmadı; son tur tüm adımları doğruladı. |
| P02 | PDF 390/402/1280 px | Yerel Chromium | PASS: önceki tur | [Ölçümler](../artifacts/cloud-release/iphone-pilot/pdf-local-regression.json); iPhone yerine geçmez. |
| T01 | iPhone işe gerçek dokunmayla başlama | Fiziksel iPhone / Safari | BLOCKED – Physical iPhone interaction required | Safari session URL sorgusu 5 saniyede timeout; bu tur native eylem doğrulanmadı. |
| T02 | Duruş nedeni ve açıklama, klavye açık gönderme | Fiziksel iPhone / Safari | BLOCKED – Physical iPhone interaction required | Önceki DOM sonucu gerçek dokunma kanıtı değildir. |
| T03 | Klavye, Vazgeç, modal geri dönüş | Fiziksel iPhone / Safari | BLOCKED – Physical iPhone interaction required | Yeni ekran kanıtı yok. |
| T04 | Sayısal üretim, tek artış | Fiziksel iPhone / Safari | BLOCKED – Physical iPhone interaction required | Backend idempotency geçti; native giriş doğrulanmadı. |
| T05 | Beş işin durum/miktar/kalite korunması | Fiziksel iPhone / Safari | BLOCKED – Physical iPhone interaction required | Önceki DOM turu ve Android sonuçları ayrı kanıttır. |
| T06 | iPhone normal/tam ekran PDF ve parmak hareketleri | Fiziksel iPhone / Safari | BLOCKED – Physical iPhone interaction required | Eski normal PDF hatası yerelde düzeltildi; Safari kabulü açık. |
| T07 | Yeni atama bildirimi, Gör, mevcut iş korunması | Canlı iPhone | NOT RUN | Bu tur canlı kalıcı test kaydı oluşturulmadı. Önceki Android sonucu: [rapor](../artifacts/cloud-release/pilot-functional/index.html). |
| A01 | Yeni giriş, çıkış, reset, davet gerçek cihazlar | Android/iPhone | NOT RUN | Backend auth regresyonu B01 içinde; yeni tasarımın gerçek cihaz kabulü henüz yok. |
| V01 | Yerel ve canlı asset aynı | HTTPS içerik hash karşılaştırması | FAIL: üç dosyanın hash'i farklı | [Sürüm karşılaştırması](../artifacts/cloud-release/iphone-pilot/version-comparison.json). |
| D01 | Ağ kesintisi/yanıt kaybı | Önceki Android/API fault injection; bu tur yerel recovery | PARTIAL | [Önceki edge raporu](../artifacts/cloud-release/pilot-edge/index.html). Gerçek Wi-Fi kesintisi bu tur NOT RUN. |
| D02 | Pause sırasında reload, request sırasında switch | Yerel koruma testi / fiziksel cihaz | PARTIAL | Bekleyen switch/refresh koruması geçti; fiziksel reload sırasında kayıt bu tur NOT RUN. |
| D03 | Arka plan, kilit açma, aktif vardiya, ayrı card/data-ready süresi | Fiziksel iPhone | NOT RUN | İki saatlik eski pasif Android gözlemi aktif vardiya değildir. |
| C01 | Gerçek müşteri yoğun çok sayfalı PDF | Hedef cihazlar | BLOCKED | Bu tur müşteri PDF'si sağlanmadı. Sentetik 3 sayfalı fixture kullanıldı. |

## Son Android ekranları

[Normal](../artifacts/cloud-release/iphone-pilot/android-pdf-normal.png) · [3. sayfa](../artifacts/cloud-release/iphone-pilot/android-pdf-page-three.png) · [Tam ekran](../artifacts/cloud-release/iphone-pilot/android-pdf-expanded.png) · [Pinch/pan](../artifacts/cloud-release/iphone-pilot/android-pdf-pinch-pan.png) · [Sığdır](../artifacts/cloud-release/iphone-pilot/android-pdf-fit.png) · [Normal moda dönüş](../artifacts/cloud-release/iphone-pilot/android-pdf-returned.png).

## Yayın ve pilot sınırları

Yerel HEAD `1efc15d42b441aa858f7bbbdc6c1d82dc0d2adf6`; çalışma ağacı kirli. Commit tek başına bu test sürümünü tanımlamaz. Yayınlanan commit belirlenemedi; public asset hash'leri farkı doğrudan doğruluyor. [Vercel yapılandırması](../vercel.json) [build-cloud](../scripts/build-cloud.cjs) ile asset kopyalar. İncelenen index/integration kaynaklarında service-worker registration bulunmadı; mevcut tarayıcı kurulumları ve CDN/browser cache yayından sonra ayrıca kontrol edilmeli.

Yayın yapılmadı. Migration gerektiren değişiklik eklenmedi. Canlı smoke NOT RUN. Cihaz bağlantısı ve gerçek dokunma kanıtları tamamlanmadan P0 kapatılamaz. Sonraki adımlar [pilot checklist](PILOT_RELEASE_CHECKLIST.md) içindedir.

**NOT READY**
