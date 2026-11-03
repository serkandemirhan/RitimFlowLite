# P1 yerel demo uygulama raporu

Tarih: 2026-10-26. Kapsam: UX audit backlog P1-01…P1-16, P1-14 gerçek yetkilendirme hariç. Kullanıcı gerçek kimlik doğrulama ve sunucu yetkilendirmesini ayrı iş olarak bıraktı. GitHub push, commit veya staging yapılmadı.

## Veri bağımlılıkları ve uygulama

Miktarlar hâlâ quantity-model → transfer-ledger / operation-ledger üzerinden hesaplanır. Yeni stock-ledger yalnızca ek stok hareketlerini okur; servisler kayıt üretir. Sipariş tamamlanması net müşteri sevkiyatına bağlıdır. Plan telafisi sipariş talebini büyütmez; belgelenmiş kayıp kadar ilk operasyon planı ve malzeme kabul limiti açar. İade stoğu ancak yönetici kalite kararıyla, kaynak iade dosyasına bağlı final onay kaydı üzerinden yeniden sevke girer.

Yeni workforce, quality, drawing ve stock servisleri ayrı modüllerdir. Yeni UI komutları taslak kopyayı localStorage'a yazdıktan sonra belleğe uygular. Eski localStorage kayıtları okunurken dönüştürülmez veya silinmez. Eski toplu rework bakiyesini yeni işe bağlamak yönetici gerekçesi gerektirir; bilinmeyen eski lot/kontrol bilgisi uydurulmaz.

## İşlevler

| Backlog | Yerel demo sonucu |
|---|---|
| P1-01 | İş emri kimliğiyle üretim açılır; atanmamış iş başka makine işine düşmez. Çizim bağlamı ayrı tutulur. |
| P1-02 | Yönetici operatör atar; operatör açık işi açıkça devralır. İşlerim ve sahiplik kontrolleri eklendi. |
| P1-03 | Gerekçeli makine bırakma/atama; fiziksel miktar ve plan değişmeden acil iş makineyi kullanabilir. |
| P1-04 | Tedarikçi, stok kodu, belge, adet/kg/m/çubuk dönüşümü; gerekçeli ek malzeme kabul izni. |
| P1-05 | Fason gönderiminde tedarikçi/termin; sağlam, hurda, rework, kayıp mutabakatı ve rework sonucu. |
| P1-06 | Kalite kuyruğu, kullanıcı/operasyon öz kontrol politikası ve izin iptali. Koşullu sevk kapalı. |
| P1-07 | Kontrol → rework işi → işlem kaydı → tekrar kontrol zinciri; operatör atama ve kaynak iş seçimi. |
| P1-08 | Sevkiyata bağlı iade dosyası; karantina, hurda, rework, yeniden stok ve gerekçeli ters kayıt. |
| P1-09 | Malzeme, kalite, fason açık/gecikmiş, telafi ve sevke hazır listeleri; sayıyla eşleşen kapsamlı bağlantılar. |
| P1-10 | Dashboard bileşen stilleri, tablo içi kaydırma, dar ekran grid düzeltmeleri. |
| P1-11 | Siparişten lojistik/planlama bağlantıları, hareket geçmişi; liste arama/filtresi geri dönüşte korunur. |
| P1-12 | İlk açılıştan itibaren birleşik mobil menü; Diğer üzerinden audit, hareketler, planlama ve stok erişimi. |
| P1-13 | Gerekçeli, geçmiş dosyayı koruyan revizyon; kullanıcı/iş/revizyon onayı ve çizim yakınlaştırma. |
| P1-14 | **Ertelendi:** gerçek kimlik doğrulama ve backend yetkilendirme. Demo sınırlaması görünür. |
| P1-15 | Kayba bağlı telafi izni, ek ilk operasyon planı ve malzeme; 10 sipariş/2 hurda/2 telafi senaryosu. |
| P1-16 | HTML ve inline JavaScript argümanları ayrı kodlanır; apostrof, çift tırnak ve markup içeren iş kimliği testi. |

## Değişen dosyalar (bu P1 çalışması)

- Yeni servisler: assets/js/workforce-service.js, quality-service.js, drawing-service.js, stock-ledger.js, stock-service.js.
- Yeni arayüz modülleri: assets/js/ux-p1.js, ux-quality-drawings.js, ux-stock.js; assets/css/ux-p1.css.
- Entegrasyon: index.html; assets/js/quantity-model.js, shipment-service.js, planning-service.js, ux-operator.js, ux-logistics.js, ux-audit.js, ux-orders-workorders.js.
- Testler: tests/p1-domain.test.cjs, tests/p1-browser.cjs; tests/p0-browser.cjs rework işlem adımı ve ekran görüntüsü zaman aşımı güncellemesi.
- Kanıtlar: docs/p1/domain-tests.tap ve docs/p1/evidence altı.
- Önceden var olan P0 değişiklikleri ve staged dosyalar korunmuştur; git diff toplamı yalnızca P1 kapsamını temsil etmez.

## Doğrulama

- Node alan regresyonları: 94/94 (79 önceki, 15 yeni P1).
- Önceki tarayıcı regresyonları: P0 16/16; transfer 9/9; planlama 9/9. Son raporlarda uygulama hatası yok.
- P1 tarayıcı: 11/11, sıfır uygulama hatası; docs/p1/evidence/new/browser-results.json. Toplam tarayıcı regresyonu 45/45.
- 1440/390/360 genişlikte ana ekran ve menü ekran görüntüleri; 11 ana rotada belge taşması kontrolü.
- İzole Chrome profilleri ve geçici loopback sunucusu kullanıldı; gerçek kullanıcının localStorage verilerine dokunulmadı.
- In-app browser bağlantısı kullanılamadığından bağımsız Playwright/Chrome ile doğrulandı.
- PDF penceresi kapanınca Chrome PDF eklentisinin ERR_ABORTED isteği telemetride tutulur, uygulama hatası sayılmaz.
- İlk paralel planlama koşusunda animasyon kararlılığı zaman aşımı görüldü; tekrar koşuda 9/9 geçti.

Çalıştırma:
```sh
node --test tests/p0-domain.test.cjs tests/p0-transfer.test.cjs tests/p0-planning.test.cjs tests/p1-domain.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p1-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p1/evidence/prior-p0 node tests/p0-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p1/evidence/prior-transfer node tests/p0-transfer-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p1/evidence/prior-planning node tests/p0-planning-browser.cjs
```

## Açık riskler ve sınırlar

- Bu bir yerel demodur: kullanıcı seçimi güvenlik sınırı değildir. P1-14 için backend gerekir.
- P0-06/07/08 kapsamındaki tüm veri bütünlüğü, bozuk snapshot kurtarma ve çoklu sekme atomikliği burada tamamlanmadı. Eski üretim kayıt yollarının kayıt başarısızlığı davranışı genel persistence işi gerektirir.
- Eski kimliksiz müşteri iadeleri otomatik yeni iade dosyasına çevrilmez; tarihsel olarak kalır. Eski rework için kaynak lot/kontrol bilgisi geri kazanılamaz.
- Fason destek, mevcut modelde iç operasyonlar + tek terminal dış operasyon ile sınırlıdır. Ortada dış operasyon bulunan rota desteği ek domain işi gerektirir. Tedarikçi bilgisi belge üzerindeki tanımlayıcıdır; merkezi tedarikçi sicili değildir.
- Yeni rework kontrolü kaynak iş ve kullanılan girdi lotlarını saklar; eski kayıtlardan parça bazlı lot izi üretilemez.
- PDF zoom, masaüstü Chrome'un mobil boyutlarında iframe ölçeklemesiyle doğrulandı. Gerçek iOS/Android PDF görüntüleyici testi yapılmadı.
- Görseller localStorage kotasını tüketir. Yeni revizyon kayıt hatasında taslak uygulanmaz; kapsamlı dosya deposu/yedekleme ayrı iştir.
- Inline handler argümanları güvenli kodlandı; tüm uygulamanın event listener mimarisine dönüşümü yapılmadı.
