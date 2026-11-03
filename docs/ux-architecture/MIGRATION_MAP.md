# Geçiş haritası

Eski API bağlantıları korunan işlevlerin sahibine taşınmıştır: İş Emirleri → Planlama; Operatör → Üretim; Malzeme ve Depo → Depo; Sevkiyat/Fason/İadeler → Lojistik; Kalite ve Rework → Kalite. Sipariş ve üretim iş kuralları değiştirilmedi. Arama ve doğrudan lot ilişkileri yeni scoped geliştirme API'lerine dayanır; eski API konteynerinde kullanılamaz ve hata gösterir.

Yerel demo localStorage anahtarları ve veri modeli dönüştürülmez. Sunucu migration veya mevcut verilere otomatik taşıma yapılmadı. Kayıt bazlı lojistik odaklama ve tüm görevlerin hedef ekrana taşınması henüz tamamlanmadı.
