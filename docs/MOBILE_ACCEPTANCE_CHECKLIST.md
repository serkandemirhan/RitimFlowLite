# Demo v1.0 RC1 — gerçek mobil cihaz kabulü

27 Ekim 2026. **Henüz çalıştırılmadı.** Masaüstü Chromium/Chrome'da 360/390 genişlikte test, gerçek Android/iOS kabulü değildir. Her satır iki platformda ayrı kanıt ve sonuç gerektirir. Desteklenen cihaz/OS/tarayıcı aralığı sonuçlara göre ilan edilir.

| Kayıt | Android Chrome | iOS Safari |
|---|---|---|
| Cihaz modeli / OS sürümü | Bekliyor | Bekliyor |
| Tarayıcı tam sürümü / normal veya özel mod | Bekliyor | Bekliyor |
| RC sourceDigest / artifact hash | Bekliyor | Bekliyor |
| HTTPS test adresi / ayrı veri kopyasının adresi | Bekliyor | Bekliyor |
| Test eden / tarih / kanıt bağlantısı | Bekliyor | Bekliyor |
| Genel sonuç / engelleyici hata numaraları | Çalıştırılmadı | Çalıştırılmadı |

Testler yalnız kurgusal veriyle, izinli HTTPS kabul ortamında yapılmalı; mevcut canlı yayını bu belgeyi hazırlamak için değiştirmeyin. Gerçek kullanıcının anahtarını silmeyin, tarayıcı verisini temizlemeyin. P0-07 üzerinden **ayrı yeni demo** veya doğrulanmış yedeğin **ayrı kopyası** açılmalı; `:copy:` veri anahtarı içeren adres kaydedilmeli. Aynı origin'de farklı URL yolu localStorage izolasyonu sağlamaz. İki sekme testinde her iki sekme aynı kopya adresini kullanmalı. Ekran kaydında gerçek müşteri/çizim bulunmamalı.

Her senaryoda sonucu, reload sonrası kalıcı kaydı ve UX-07 bulgularını kontrol edin; başarısız kayıt başarı bildirimi üretmemeli. Aşağıdaki sonuç sütunlarına PASS/FAIL, cihaz ve kanıt ekleyin.

| ID | Akış ve kabul ölçütü | Android | iOS |
|---|---|---|---|
| M01 | Menü, Diğer ve 11 ana rota; portre/yatay, ekran çentiği, klavye açıkken eylem düğmeleri erişilebilir. Kaydırma tablo içinde; belge yatay taşmaz. | Bekliyor | Bekliyor |
| M02 | Sipariş 250 → plan 150 → malzeme/tahsis/teslim 100. 60 sağlam + 3 hurda + 12 kontrol bekleyen + 25 fiziksel kalan; başlamamış plan 50 ayrı görünür. | Bekliyor | Bekliyor |
| M03 | Üretim sayısal klavyesi, 0/negatif/kesir/fazla miktar reddi, çift dokunuş, devralma/devretme/makine bırakma. Tek fiziksel kayıt; geçmiş korunur. | Bekliyor | Bekliyor |
| M04 | Kontrol kuyruğu, sağlam/hurda/rework ve tekrar kontrol; kaynak iş/lot görünür, rework stok iki kez yaratmaz. Öz kontrol politikası demo rolüyle sınanır. | Bekliyor | Bekliyor |
| M05 | Fiziksel transfer kısmi gönderim/kabul/ters kayıt. İki sekmede aynı kabulden yalnız biri geçer; kaynak/hedef bakiyesi ve tarihsel üretim toplamı tutar. | Bekliyor | Bekliyor |
| M06 | Operasyon planı bölme, rezervasyon, kabul ve azaltma. İki sekmede aynı stok rezervasyonu stok aşımına yol açmaz. | Bekliyor | Bekliyor |
| M07 | PDF açma, yakınlaştırma, dikey/yatay kaydırma, kapanış/geri dönüş. iOS yerleşik PDF görüntüleyici ve Android viewer ayrı kontrol edilir. | Bekliyor | Bekliyor |
| M08 | Dosyalar/kamera/galeriden PDF-PNG-JPG revizyonu: dosya seçme, iptal, aynı ad, büyük dosya, revizyon gerekçesi/onayı ve geçmiş sürüm erişimi. Arka plana geçerken bağlam değişmez. | Bekliyor | Bekliyor |
| M09 | Malzeme kabulü adet/kg/m/çubuk dönüşümü, tedarikçi/stok kodu/belge, kısmi tahsis ve gerekçeli ek izin. Olmayan işe/fazla tahsis reddedilir. | Bekliyor | Bekliyor |
| M10 | Terminal fason kısmi gönderim ve sağlam/hurda/rework/kayıp dönüşü. İki sekmede aynı kaynağı fazla tüketme reddi; belge ve termin korunur. Ara fason → iç operasyon yeni kaydı kapalıdır. | Bekliyor | Bekliyor |
| M11 | Son operasyon bitmeden/final kalite olmadan sevk reddi; uygun 20 adetten iki sekme 15'er sevk ister, tek sevk olur. Reload sonrası net sevk/tamamlanma oranı doğru. | Bekliyor | Bekliyor |
| M12 | Sevkiyata bağlı müşteri iadesi, karantina, hurda/rework/yeniden stok ve gerekçeli ters kayıt. Aynı dosya iki kez stoklaşmaz, net sevk ve onaylı bakiye tutar. | Bekliyor | Bekliyor |
| M13 | Belgeli kayıp karşılığı telafi: 10 talep/2 hurda/2 telafi; talep büyümez, aynı kayıp tekrar kullanılamaz. | Bekliyor | Bekliyor |
| M14 | Normal açılış/gezinti/audit yazma yapmaz. Ham JSON yedeği indirilir, Dosyalar/Downloads'ta açılır; doğrulanmış import ayrı anahtara gider, özgün ham değer değişmez. | Bekliyor | Bekliyor |
| M15 | Kontrollü ayrı fixture'da bozuk JSON, null ve gelecekteki şema → kurtarma ekranı. Ham veri birebir indirilir; geçersiz import reddedilir, açık onayla ayrı demo açılabilir. Hiçbir otomatik sıfırlama yok. | Bekliyor | Bekliyor |
| M16 | Ayrılmış test ortamında kota dolumu/erişim reddi: üretim, kalite, transfer, sevk, iade, revizyon kaydı başarısız; bellek ve geçmiş değişmez, başarı bildirimi yok. Alan açmak için kullanıcı anahtarı silinmez. | Bekliyor | Bekliyor |
| M17 | Web Locks gerçek HTTPS ortamında `navigator.locks.request` ile kullanılabilir. Kilit diğer sekmedeyken yazma güvenli ret üretir; sahibi kapandığında aynı komut retry tek kayıt oluşturur. | Bekliyor | Bekliyor |
| M18 | Desteklenmeyen/engellenmiş Web Locks ortamı: yazma kapalı ve açıklama görünür; okuma, audit ve ham export erişilebilir. Bu ortam yazılabilir destek kapsamında ilan edilmez. | Bekliyor | Bekliyor |
| M19 | Eski revizyonlu sekmede açık miktar/not/sipariş sihirbazı korunur; açık yenileme son kaydı yükler. Dosya seçimi native reload sonrası otomatik geri gelmiş varsayılmaz. | Bekliyor | Bekliyor |
| M20 | Sekmeyi arka plana alma, ekran kilidi, uygulama sonlandırma, tekrar açma ve bağlantı kesintisi. Başarısız/belirsiz işlem kör tekrar edilmez; reload+geçmiş+aynı komut kimliği çift hareket üretmez. | Bekliyor | Bekliyor |
| M21 | Özel gezinme ve düşük depolama davranışı ayrı kaydedilir; kalıcılık varsayılmaz. Normal profile dönünce gerçek veriler etkilenmemiştir. | Bekliyor | Bekliyor |
| M22 | Eski sales_polished adresi yalnız arşiv ve ham export sunar; sevk/mutasyon globali yoktur. Geri bağlantı yeni uygulamayı açar. | Bekliyor | Bekliyor |
| M23 | Yeni candidate açıldığında JS/CSS dosya isimleri manifest ile eşleşir; eski modül URL'si yüklenmez. Önce eski yazıcı sekmeler kapatılır; offline yeniden açılış desteklenmiş sayılmaz. | Bekliyor | Bekliyor |

M15/M16 için yalnız izole fixture/hata enjeksiyonu kullanın. Safari/Chrome cihaz inceleyicisiyle kaydedilen hatalar, ağ hataları ve snapshot önce/sonra hash'leri kanıta eklenmeli. Fiziksel cihazda uygulama/disk kesintisine dayanıklılık garantisi üretilemez; belirsiz sonuçta kullanıcı önce geçmişi inceler.

Yazılabilir mobil demo için M02–M20'nin hedef normal profillerde geçmesi ve kritik veri kaybı/çift hareket olmaması zorunludur. PDF/dosya sorunları hedef kullanımın parçasıysa release engelidir. Desteklenmeyen tarayıcıda güvenli salt okunur davranış geçse bile bu cihaz yazılabilir kabul almış sayılmaz. Son onay: cihaz kabul kayıtları + sabit candidate digest + sorumlu kişi/tarih; otomatik kutu işaretleme yoktur.
