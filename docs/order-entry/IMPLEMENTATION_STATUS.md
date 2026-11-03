# Basitleştirilmiş sipariş girişi — uygulama durumu

Durum: **NO-GO; kapsam tamamlanmadı.**

API kipinde dört temel alanlı üç adımlı taslak, isteğe bağlı parça numarası, daha sonra rota seçimi ve ilk iş emri olmadan sipariş kaydı uygulandı. Müşteri ve parça önerileri mevcut siparişlerdeki metinlerdir; ana veri sicili veya otomatik ana kayıt oluşturma değildir. Şifreli sunucu kurtarma akışı, rotası ertelenen siparişin tamamlanmasına izin verir; plan içeren eski kurtarma kayıtları korunur. Sipariş detayından sınırlı destekli rota örnekleri daha sonra kaydedilebilir; uygun önceki siparişin rotası sunucudan okunup kopyalanabilir. 028 migration parça numarasının bilinmemesini NULL olarak saklar; mevcut kayıtları dönüştürmez.

Kalanlar: kiracı/tesis yetkili kalıcı rota şablonları, yeni akışın gerçek Keycloak ile kaynak ve paket uçtan uca kabulü, test senaryolarının yeni kullanıcı akışına uyarlanması, tam mobil ve fabrika yolculuğu regresyonları. Yerel demo sihirbazı da dört alanlı sipariş ve açık rota erteleme akışına geçirildi; boş rota yalnız açık routeDeferred işaretiyle ve iş emri yokken kabul edilir. İstemci ve sunucu değişiklikleri beraber yayınlanmalı; çalışmakta olan API'ye migration uygulanmadı ve dağıtım yapılmadı.

## Doğrulama

- PostgreSQL 16 restricted runtime/backend regresyonu: 142/142; test şemaları ve test verileri kullanıldı.
- Node 22 ile frontend `npm run test:ci`: 292 alan, 14 kurtarma, 12 paket testi; kaynak ve paket tarayıcı regresyonları 110/110; ayrıca mimari kontroller 3/3.
- Gerçek Fastify/PostgreSQL, kurgusal imzalı kimlik ve ayrı kaynak/paket tarayıcı koşuları: rotasız sipariş, sonradan rota, 5+5 plan, fazla plan reddi ve önceki rota kopyasının kaynağı değiştirmemesi geçti. Bu test gerçek Keycloak değildir.
- Eski I02 browser testi: başarısız; eski sihirbazdaki görünür sipariş numarasını ve iş emri alanlarını beklemektedir. Yeni akışa uygun regresyon ve tüm eski I02 kapsamı hâlâ gözden geçirilmelidir.
- Ekran görüntüleri: `evidence/source-review.png`, `evidence/packaged-review.png`.
