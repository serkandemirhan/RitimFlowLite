# Açık sınırlar

- Fason ve iade işlemleri bağlamsal açılır alanlara ayrıldı; daha fazla otomatik adım yönlendirmesi ve tüm beklenmedik gezinmelerde taslak koruması ayrıca doğrulanmalıdır. Kaynak görünümde görevler arası geçişte alanlar DOM'da korunur; sunucu işlemi tamamlanınca mevcut ekran yenileme davranışı sürer.
- PDF yüklenmeden onay kapalıdır. İstemcide yükleme sinyali, operatörün çizimi gerçekten okuduğunu ya da mobil PDF görüntüleyicisinin içeriği eksiksiz gösterdiğini kanıtlamaz. Gerçek iPhone/Android kabulü açıktır.
- Görünüm testleri gerçek mobil cihaz testi değildir. Linux CI, gerçek cihaz kabulü ve diğer yayın koşulları açıktır.
- Yerel geliştirme doğrulaması: **GO**, kapsam ve test sonuçları rapordaki sınırlarla. Gerçek mobil cihaz kabulü, üretim güvenliği ve yayın incelemesi tamamlanmadığından üretim/yayın kararı **NO-GO**.
