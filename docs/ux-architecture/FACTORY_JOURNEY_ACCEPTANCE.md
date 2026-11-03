# Fabrika yolculuğu kabulü — 2 Kasım 2026

İzole Keycloak, Fastify ve PostgreSQL 16 ile kurgusal kullanıcılar ve kayıtlar kullanıldı. Gerçek OIDC callback origin'i ve TLS sertifikası doğrulandı. Mevcut kullanıcı veritabanı ve oturumları değiştirilmedi.

Kaynak ve paketlenmiş uygulamada sipariş, planlama, depo, üretim, kalite, fason, sevkiyat, iade ve rework yolculuğu, kayıtlı lot ilişkileri ve kayıt sonrası lojistik kuyruk yenilemesi senaryosu sırasıyla 1/1 geçti: `/tmp/ritim-factory-isolated-source-queue.tap`, `/tmp/ritim-factory-isolated-packaged-queue.tap`. Gerçek Keycloak ile arama, lot izi ve lojistik panellerine erişim kaynak ve pakette 1/1 geçti: `/tmp/ritim-trace-isolated-source.tap`, `/tmp/ritim-trace-isolated-packaged.tap`. Bu sonuçlar tüm rollerin veya tüm mimari kabul maddelerinin geçtiği anlamına gelmez.

Önceki yanlış test origin'i 403 ile reddedildi (`/tmp/ritim-architecture-factory-source.tap`); gerçek origin ile ayrı test kurulumu oluşturuldu. İlk doğru-origin kaynak koşusundaki test gezinme hatası ayrıca korundu (`/tmp/ritim-factory-isolated-source.tap`) ve test seçicisi düzeltilerek yeniden çalıştırıldı. 320–1440 px görüntüler masaüstü tarayıcı emülasyonudur; gerçek cihaz kabulü değildir.

Kalanlar: kayıt düzeyinde bağımsız lojistik detayları ve derin bağlantılar, durum/filtre/sonraki eylem, tüm rol yetkileri, otomatik çok adımlı soyağacı ve kapsamlı taslak/yenileme davranışı henüz kabul edilmedi. Genel mimari kararı NO-GO.

## Mimari kabul matrisi

| Alan | Mevcut gerçek yolculuk kanıtı | Açık kabul | Karar |
|---|---|---|---|
| Genel Bakış | Kabuk ve giriş bağlantısı odaklı test | Tüm rollere özel iş kuyruğu | NO-GO |
| Siparişler | Kaynak ve paket yolculuk | Tüm rol/derin bağlantı kabulü | NO-GO |
| Planlama | Kaynak ve paket yolculuk | Tüm rol ve bağlamlar | NO-GO |
| Üretim | Kaynak ve paket yolculuk | Rol ve çizimle birlikte tüm kapsam | NO-GO |
| Kalite | Kaynak ve paket yolculuk | Gerçek bekleyen kontrol kuyruğu ve tüm roller | NO-GO |
| Depo | Kaynak ve paket yolculuk | Tüm görev ve rol varyantları | NO-GO |
| Lojistik | Kaynak ve paket yolculuk ve üç kayıt paneli | Kayıt düzeyi ayrıntı, durum, filtre ve derin bağlantı | NO-GO |
| Arama ve iz | Kaynak ve paket gerçek Keycloak okuma | Çok adımlı soyağacı ve tüm kayıt türleri | NO-GO |
| Yönetim | Mevcut yetki kontrolleri korunur | Fonksiyon envanteri ve rollerin tümü | NO-GO |

Sipariş bağlamına bağlantı, sevkiyat/fason/iade kaydının kendisine bağımsız detay bağlantısı değildir. Gerçek telefon kabulü ayrıca açık kalır.

Son kod için gerçek doğru-origin BFF, son Fastify kodu ve ayrı kurgusal PostgreSQL/Keycloak ortamında fabrika yolculuğu kaynak ve paket **1/1 + 1/1** geçti (`/tmp/ritim-factory-true-final-source-20261102.tap`, `/tmp/ritim-factory-true-final-package-20261102.tap`). Kapsam tüm rol kombinasyonları veya gerçek telefon kabulü değildir. Önceki yanlış-origin ve PDF denemeleri korunmuştur.
