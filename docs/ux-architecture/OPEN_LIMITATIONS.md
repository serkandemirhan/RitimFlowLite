# Açık sınırlar

- İzole gerçek Keycloak/Fastify/PostgreSQL fabrika yolculuğu kaynak ve paket için geçti; bu tek senaryo tüm roller ve tüm mimari kabulü değildir. Son değişikliklerin tamamıyla güncel tam frontend CI sonucu ayrıca doğrulanmalıdır.
- Lot ekranı yetkili doğrudan ilişkileri en fazla 20 lot için izler; kesilen veya yetkisiz ilişkileri belirtir, eksik tarihsel bağları üretmez. Her desteklenmeyen tarihsel bağlantının kapsandığı garanti edilmez.
- Lojistikte belirli kayda adres ve seçili ilişkiler üzerinden ulaşılır. Liste sunucudan durum ve miktar özetleri alır, arama yalnız yüklenmiş sayfaları kapsar; role özgü sonraki eylem kapsamı eksiktir; tüm işlevler henüz tam bağımsız liste → detay → tek işlem ekranlarına dönüştürülmemiştir.
- Kalite bekleyenler görünümü mevcut iş emirlerinin sunucu özetlerini sekizli gruplarla okur. Bu yaklaşım büyük veri kümeleri için sunucu sayfalı kuyruk kadar verimli değildir; okunamayan işler açık uyarıyla gösterilir.
- Arama kapsamı sunucu testlerinde her nesne ve rolde doğrulanmadı; sonuç sınırı aşılırsa kullanıcıdan aramayı daraltması istenir.
- Kaydedilmemiş alanlar ve geçerli bağımsız seçimler gezinmede yalnız bellekte korunur; bağlam değiştiren seçimler ve sayfa yenileme kapsanmaz. Kullanıcı/site değişiminde güvenlik için temizlenir.
- Son backend ve arayüz doğru-origin BFF ile ayrı kurgusal ortamda kaynak ve paket fabrika/okuma senaryolarında doğrulandı. Önceki 44879/farklı UI portu denemesi süreç içi oturum ve callback ayrımı nedeniyle başarısız olarak korundu; bu koşular dağıtım kabulü değildir.
- İki önceki tam CI koşusunda PDF isteği `ERR_ABORTED` görüldü. Test PDF yanıtının gerçek tamamlanmasını bekleyecek şekilde düzeltildi; son tam CI ve tekil kaynak/paket koşuları geçti. Gerçek mobil PDF davranışı ayrıca doğrulanmalıdır.
- Kullanıcının mevcut API konteyneri yeni uçları içermez; güncelleme/deploy yapılmamıştır. Gerçek iPhone/Android ve üretim kabulü açıktır.
- Çizim akışında sunucudan geçerli PDF başlığı ve iframe `load` olayı denetleniyor; bu olay her tarayıcıda PDF içeriğinin gerçekten görünür ve okunabilir olduğunu kanıtlamaz. Özellikle iOS Safari için kullanıcının “PDF açılamazsa onayı kapat” kabulü gerçek cihazda doğrulanmalı; görüntüleyici başarısızlığını güvenilir ayırt etmeden tamamlandı sayılmaz.
