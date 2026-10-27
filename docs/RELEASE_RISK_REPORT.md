# Ritim Flow Lite — release risk değerlendirmesi

## 27 Ekim 2026 — P0-08 sonrası

Aynı profil/origin/veri anahtarını paylaşan güncel yerel istemciler için P0-08 uygulandı. Gerçek exclusive Web Lock altında son snapshot okunur, komut yeniden doğrulanır; hareket ve idempotency makbuzu aynı artan revizyonla yazılır. Storage event yalnız görünümü eski olarak işaretler; bir kilit değildir. Desteklenmeyen veya erişimi reddedilen kilit ortamında mutasyon kapalıdır. [Güncel kapsam, testler ve sınırlar](P0_08_IMPLEMENTATION_REPORT.md).

Çok cihazlı/sunucu atomikliği, gerçek kimlik/yetki, gerçek mobil kabul ve sabit candidate/paket/CI doğrulaması açık kalır. Kilit protokolüne katılmayan eski kod veya harici same-origin yazıcılar sunucu seviyesinde engellenmiş sayılmaz; yayın geçişinde eski sekmeler kapatılmalıdır. Genel **NO-GO** sürer. Aşağıdaki P0-06/07/08 hata gözlemleri önceki sürümlerin tarihsel kaydıdır.

## 27 Ekim 2026 — P0-06 sonrası

P0-06 uygulandı: planı 150 olan işe 200 fiziksel teslim, 200 tahsis ve olmayan işe tahsis artık yapılandırılmış kritik bulgulardır. Yeni salt okunur motor tüm mevcut domain defterlerini denetler; ortak commit etkilenen hatalı kayda yeni işlem yapılmasını engeller. Tarihsel eksik kanıtlar açık uyarılardır; veri onarımı veya migration yapılmaz. [Kapsam, tarihsel istisnalar ve son test kanıtları](P0_06_IMPLEMENTATION_REPORT.md).

P0-07 korunur. P0-08, gerçek mobil kabul, candidate/paketleme ve gerçek kullanım için sunucu yetkisi açık olduğundan genel **NO-GO** sürer. Aşağıdaki P0-06/P0-07 hata gözlemleri önceki sürüme aittir.

## 27 Ekim 2026 durum notu

**P0-07 uygulandı ve negatif regresyonlarla doğrulandı.** Güncel sonuç: 180/180 alan ve 79/79 tarayıcı testi, sıfır uygulama hatası. [P0-07 uygulama raporu](P0_07_IMPLEMENTATION_REPORT.md) şema, kurtarma, açık kopya/migration onayı, tüm etkin kayıt yolları ve belirsiz yazma davranışını açıklar. Özgün veriler korunur; eski bağımsız satış sayfası salt okunur arşivdir.

Aşağıdaki bulgular **26 Ekim tarihsel incelemesidir**; P0-07 bölümündeki eski hata gözlemleri güncel davranışı anlatmaz. P0-06 tam domain mutabakatı ve P0-08 atomik sekme kilidi açık kalır. Yeni commit katmanının eski snapshot kontrolü bir kilit değildir. Gerçek mobil kabul ve release paketleme de tamamlanmadığından genel **NO-GO** kararı değişmedi.

## 26 Ekim incelemesi (tarihsel)

Tarih: 26 Ekim 2026. İncelenen temel: `a28d562` üzerindeki mevcut çalışma ağacı. Bu tur release incelemesidir; uygulama kodu değiştirilmedi. Ayrı risk deneyleri yalnızca geçici sunucu ve yeni Chrome profillerinde çalıştırıldı. Gerçek demo verisi sıfırlanmadı; commit, staging, branch değişimi, push veya dağıtım yapılmadı.

**Öneri: kayıt alan genel kullanıma açık demo ve gerçek üretim yayını için NO-GO.** P0-01…05 ve yerel P1 işlevlerinin testlerinin geçmesi, P0-06/07/08'in tamamlandığı anlamına gelmez. Önceki “P0/P1 tamamlandı” ifadesi tüm backlog için kullanılamaz: P0-06/07/08 açık; P1-14 kullanıcı kararıyla ertelenmiş durumda. Kontrollü, kurgusal verili ve verisinin kalıcılığına güvenilmeyen tanıtım mevcut sınırlar açıklanarak yapılabilir; bu bir üretim release onayı değildir.

## P0-06 — tüm kayıtların doğrulanması ve audit

**Doğrulanan açık:** 250 adet sipariş içinde planı 150 olan işe 200 fiziksel teslim/200 sağlam ve 200 tahsis; ayrıca olmayan `MISSING` işine 1 tahsis verildi. Audit uyarı listesi boş, `jobBalance.valid=true` döndü. Bu deneyde fiziksel denklemin tutması plan ve referans doğruluğunu kanıtlamıyor.

Kaynaklar: [ux-audit.js](../assets/js/ux-audit.js), [quantity-model.js](../assets/js/quantity-model.js), [operation-ledger.js](../assets/js/operation-ledger.js). Audit mevcut işlerden yürüdüğü için bulunmayan işlere giden bütün hareketleri kapsamıyor. Balance doğrulaması sayısal değerleri ve kullanılan/teslim dengesini inceliyor; tek başına teslim ≤ plan şartını sağlamıyor. Bazı okuma yardımcılarının geçersiz miktarı sıfır sayması veya bozuk defteri boş göstermesi de açık veri doğrulaması yerine geçmez.

**Yayından önce gereken:**

- Sürüm bilgili veri şeması ve saf, tüm kayıtları dolaşan invariant doğrulaması; orders/jobs/events ve tüm ek defterler.
- Referans varlığı/tekilliği, sipariş-operasyon ilişkisi, güvenli tam sayılar, plan/telafi sınırları, fiziksel tahsis, girdi lotu, kalite/sevk/iade bağlantıları ve legacy ayrımı.
- Okuma sırasında sessiz düzeltme yok; bozuk kayıt açıkça gösterilmeli, etkilediği yazma işlemi engellenmeli.
- Kabul: 200/150 ve eksik iş referansı ayrı ayrı yakalanmalı; negatif, null, yanlış tip, bozuk defter ve çift kimlik testleri eklenmeli. Audit sonucu tam bütünlük garantisi gibi sunulmamalı.

**Erteleme kararı:** temel doğrulama Supabase'i beklememeli. Aynı kuralların sunucu tarafında işlem içinde uygulanması Supabase aşamasının zorunlu parçası olmalı.

## P0-07 — bozuk localStorage kurtarma ve başarısız yazma

Üç ayrı hata ve bir olumlu kontrol tekrar üretildi:

| Deney | Gözlem | Sonuç |
|---|---|---|
| Ham değer `{broken snapshot` | İlk açılış ham değeri diskte tutuyor, bellekte 6 siparişli demo açıyor. Kullanıcı seçimiyle yapılan sonraki kayıt ham değerin üzerine yazıyor. | Görünmez fallback, sonraki yazmada veri kaybına dönüşebiliyor. |
| Geçerli JSON, `jobs:null` | `filter` üzerinde uygulama hataları; kurtarma ekranı yok. Ham değer diskte kaldı. | JSON parse başarısı şema doğrulaması değil. |
| Final onaylı 20 adet; sevkiyat kaydında `QuotaExceededError` | Bellekte net sevk 5, kalıcı sevkiyat sayısı 0. | Ekran/kayıt ayrışıyor; yenilemede işlem kaybolur. |
| Yeni P1 malzeme kabulünde aynı yazma hatası | Bellek ve kalıcı ham kayıt aynı kaldı. | Taslak → kalıcı yazma → belleğe uygulama yolu bu örnekte doğru. Tüm yollar için garanti değil. |

Kaynak: [index.html](../index.html) başlangıç yüklemesi ve `save()`; [ux-logistics.js](../assets/js/ux-logistics.js) `movement/shipOrder/release/allocate/dispatch`; [ux-operator.js](../assets/js/ux-operator.js) `record`. Eski yollar önce state'i değiştiriyor; `save()` hatayı yakalayıp başarı/başarısızlık sözleşmesi döndürmüyor. Sonraki render ve bazı başarı bildirimleri devam edebiliyor. Yeni taslak kullanan planlama, transfer ve P1 modülleri bu açığı bütün uygulamadan kaldırmıyor.

**Yayından önce gereken:**

1. Parse/şema hatasında yazmayı durduran recovery ekranı; ham veriyi indirme, doğrulanmış yedekten geri alma ve açık kullanıcı kararıyla ayrı demo başlatma. Orijinal veri korunmadan üzerine yazılmamalı. Kota doluyken aynı localStorage'a yedek yazmaya güvenilmemeli.
2. Tüm komutları kapsayan ortak commit katmanı: taslak, şema/domain doğrulaması, kalıcı yazma, başarılıysa bellek/UI güncellemesi. Başarısızlıkta stok, olay ve başarı bildirimi dahil hiçbir kısmi sonuç kalmamalı.
3. Kurtarma testleri: bozuk JSON, `null`, `jobs:null`, eksik alanlar, desteklenmeyen sürüm, erişim reddi, kota; başarısız üretim/kalite/tahsis/fason/sevk/iade/çizim kaydı ve yeniden açma. Ham veri byte eşitliği doğrulanmalı.

**Erteleme kararı:** recovery, dışa aktarma ve bütün yazma yollarının hata davranışı Supabase sonrasına bırakılamaz. Dosyaların harici depoya taşınması ve merkezi yedekleme mimarisi sonraki aşamaya kalabilir.

## P0-08 — iki sekme ve kayıp güncelleme

**Gerçek iki sekmeli deney:** aynı browser context, aynı origin ve ortak localStorage. Önce 20 adet final onaylı stok hazırlandı; iki sayfa bu sürümü yükledi. A sekmesi `TAB-A` ile 15, ardından hâlâ eski state'i taşıyan B sekmesi `TAB-B` ile 15 kabul etti. Her sekmenin belleği net 15 gösterdi; diskte yalnız `TAB-B` kaldı. Toplam kabul edilen istek 30, başlangıç stoku 20; A geçmişi kayboldu. Fiziksel bir sevkiyat yapılmadı; yazılımın iki isteği de kabul ettiği doğrulandı.

Kaynak: snapshot'ı komple yazan `save()` ve yeni modüllerin `localStorage.setItem` çağrıları. Yeni taslak modeli tek yazma hatasını kontrol eder; sekmeler arasında eski state sorununu çözmez. Hareketlerdeki `version:1` şema/provenance alanıdır, snapshot eşzamanlılık sürümü değildir. Belge tekilliği sadece o sekmenin gördüğü state içinde kontrol edilir.

**Yayından önce asgari yerel çözüm:**

- Aynı origin için atomik tek-yazıcı kilidi veya işlemsel yerel depo; kilit altında en güncel snapshot'ı oku, komutu yeniden doğrula, sürümü artırarak yaz.
- Eski sekmeye güncelleme/yeniden deneme davranışı; ikinci yazarı gerçekten engelle. Sadece “tek sekme kullanın” metni veya bir storage-event bildirimi kilit değildir.
- Her komutta kalıcı idempotency anahtarı; başarılı yanıt kaybolduğunda tekrar gönderim ikinci hareket üretmemeli.
- Yarış testi: iki sekme aynı 20'den 15 isterse yalnız biri kabul edilmeli; geçmiş kaybolmamalı. Plan rezervasyonu, final onay ve iade stoğu için de denenmeli. Kilit sahibinin kapanması/askıya alınması test edilmeli.

**Supabase aşaması:** çok kullanıcı/çok cihaz için tüm stok komutlarını sunucuda tek transaction içinde doğrulama+yazma; sürüm/çatışma kontrolü, benzersiz komut anahtarı, yetki doğrulaması, hareket geçmişi ve lot tüketimi birlikte atomik olmalı. Client'tan hesaplanmış stok veya rol kabul edilmemeli. Tabloya snapshot yüklemek tek başına bu sorunları çözmez.

**Erteleme kararı:** dağıtık çözüm Supabase aşamasına bırakılabilir; yerelde ikinci yazarı teknik olarak engellemeden kayıt alan demo yayınlanmamalı. Çok cihazlı gerçek kullanım sunucu çözümü tamamlanmadan açılmamalı.

## İç operasyon → Fason → İç operasyon neden desteklenmiyor?

Bu bir menü eksikliği değil, kaynak modelinin sınırı:

- `quantity-model.route()` dış operasyonu yalnız son indekste kabul ediyor. Mevcut destek: bir veya çok iç operasyon; bunların ardından isteğe bağlı **tek terminal fason**.
- `productionSources()`, fason varsa kaynağı son indeksten bir önceki iç operasyon olarak seçiyor. `shipment-service.dispatch()` gönderimi terminal operasyon indeksiyle kaydediyor.
- `operation-ledger.project()` dış operasyon için boş çıktı listesi üretiyor. Girdiler `source` iş emri ve `GOOD:<job>` lotunu bekliyor; kaynak/hedefin bitişik iş emri operasyonları olması gerekiyor.
- Fason sağlam dönüşü gönderim belgesine bağlı sipariş düzeyi dönüş defterinde bulunuyor; sonraki iç iş emrine rezerve/kabul edilebilir bağımsız dış operasyon çıktı lotuna dönüşmüyor.
- Fason varlığına göre final onay kaynak türü dispatch/job olarak seçiliyor. Ara fason + son iç operasyon için final onay son iç işten alınmalı; mevcut ikili seçim bu zinciri ifade etmiyor.

Sadece `supported=true` yapmak veya operasyon numarasını değiştirmek kalite ve fiziksel girdi kanıtını atlatır. Risk deneyinde `İmalat → Kaplama → Montaj` için yeni plan ve final kalite onayı doğru biçimde engellendi.

**Gereken model değişiklikleri:**

1. İsim regex'ine bağımlı olmayan kalıcı operasyon kimliği/türü ve sürümlü rota; mevcut string rotaları ancak açık dönüşüm/mutabakatla ele alma.
2. Ortak çıktı lotu: iç iş ve fason dönüşünün ikisi de operasyon kimliği, kaynak hareket, kalite durumu, konum, miktar ve tüketim geçmişi taşımalı.
3. Her fason gönderim/dönüşü belirli operasyon örneğine bağlama; kısmi sağlam/hurda/rework/kayıp ve tekrar fason gönderimi için ayrı belgeler/lotlar.
4. Sonraki iş için bu onaylı lotlardan rezervasyon → transfer → fiziksel kabul → üretim tüketimi. Gönderim, dönüş ve kabul ayrı stok durumları olmalı.
5. Her adımda miktar/provenance doğrulaması; final uygunluk gerçek terminal operasyonun onaylı çıktısından türemeli. Kaynak üretimi veya rotası değişirse downstream kanıt geçersiz kalmalı.
6. Gerekçeli iptal/ters hareket, değişmez geçmiş ve işlem tekrarı koruması; mevcut veriye sessiz kaynak bağlama yok.

Kabul senaryosu: 100 iç çıktı → 80 fason gönderim → 50 sağlam + 10 rework + 5 hurda + 15 tedarikçide açık. Yalnız 50 onaylı sağlam sonraki iç işe ayrılabilmeli; kabul edilmeyen miktar işlenememeli. Son iç iş 45 sağlam + 5 hurda çıkarırsa final onay en fazla 45 olmalı. Rework dönüşü ayrı izlenmeli; aynı lot iki hedefe fazla ayrılamamalı. İki fasonlu rota ve ara işlem iptalleri de test edilmeli.

**Erteleme kararı:** ilan edilen demo yalnız desteklenen rotaları kapsıyorsa bu genişleme sonraki domain/Supabase aşamasına bırakılabilir. Gerçek iş kapsamı ara fason içeriyorsa yayından önce zorunludur. Backend eklemek tek başına rota modelini düzeltmez.

## Gerçek mobil cihaz kabul listesi

Bu tur gerçek iOS/Android cihaz kullanılmadı. 360/390 piksel masaüstü Chrome, dokunma/klavye/PDF/depolama davranışının cihaz kanıtı değildir. Hedef cihaz modeli, OS, tarayıcı sürümü ve test tarihi her kayda yazılmalı.

| Akış | Gerçek cihazda doğrulanacak | Başarı ölçütü |
|---|---|---|
| iOS Safari ve Android Chrome açılış | İlk menü, Diğer, audit/hareket/stok, geri dönüş, ekran dönüşü, safe area | Menü ve ana aksiyonlar görünür; kaydırma/odak kaybı yok |
| Sayısal formlar | 2,5 / 2.5 kg, klavye, birim dönüşümü, tam adet sınırı | Giriş anlamı açık; doğru dönüşüm veya anlaşılır ret; klavye butonu örtmez |
| Çizim | Gerçek PDF/JPG/PNG seçimi, dosya izinleri, zoom/pan, modal kapatma, büyük dosya | Doğru revizyon okunur; önceki bağlam ve revizyon korunur; kota hatası kaydı değiştirmez |
| Üretim/kalite | Teslim, başlat/duraklat/devret, rework seçimi, revizyon onayı | Yanlış işe işlem yok; miktarlar reload sonrası aynı |
| Transfer/planlama | Kısmi gönderim, kabul, iptal; 25 fiziksel / 50 plan | Dokunmayla tekrar işlem çift hareket üretmez |
| Fason/sevk/iade | Kısmi dönüş, final onay, sevk, iade/rework/restock/ters kayıt | Uygun olmayan miktar kapalı; belge ve gerekçe okunur |
| Yaşam döngüsü | Uygulamayı arka plana alma, OS kapatması, yeniden açma; ikinci sekme | Kayıp/çift işlem yok; eski state ile yazma engellenir |
| Depolama/bağlantı | Kısıtlı depolama, gizli mod, sayfa yenilerken bağlantı kesilmesi | Veri kaybı/başarı yanılsaması yok; kurtarma açık |
| Erişilebilirlik | VoiceOver/TalkBack, odak, büyütülmüş yazı, dokunma hedefleri | Alan ve hata adları okunur; modal odağı yönetilir |

Mobil kullanıcıya açılacak release için en az üretim, kalite, transfer, sevk/iade, PDF ve kayıt hatası akışları gerçek cihazlarda geçmeden kabul verilmemeli. Desteklenmeyen bir tarayıcı/cihaz açıkça kapsam dışı tanımlanmalı.

## Kanıtların anlamı

- Ana regresyon sonuçları ve release paketi: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
- Risk deneyleri: [risk-probe.cjs](release/risk-probe.cjs) ve [risk-probes/browser-results.json](release/evidence/risk-probes/browser-results.json).
- Risk deneylerindeki **7 PASS, açıklanan mevcut davranışların tekrar üretildiği** anlamına gelir; açıkların giderildiği anlamına gelmez. Şema deneyinin beklenen sayfa hataları observations içinde ayrıca kayıtlıdır.
- Risk deneyleri düzeltmeler yapılınca güvenli davranışı bekleyen regresyon testlerine çevrilmeli; bug'ı bekleyen assertion'lar release başarı ölçütü yapılmamalı.
