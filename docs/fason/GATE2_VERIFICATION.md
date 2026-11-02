# Gate 2 — Fason doğrulaması

Backend ve frontend izole geliştirme çalışma ağaçlarında, kurgusal PostgreSQL ve gerçek Keycloak oturumlarıyla test edildi. Üretim etkinleştirilmedi.

- 20 onaylı parça fasona gönderildi; 12 fiziksel döndü, 8 tedarikçide kaldı. Dönen 12 için 10 onay ve 2 ret kaydedildi. Yalnız 10 parça sonraki iç işe teslim edilip üretimde tüketildi; lot zinciri veritabanında kontrol edildi.
- Gerçek tarayıcıda kaynak ve paketli uygulama akışı geçti; gönderim yanıtı kontrollü kesildiğinde şifreli sunucu kurtarması aynı işlem kimliğiyle tekrarlandı.
- PostgreSQL 16 kısıtlı runtime ile tam backend regresyonu 136/136 geçti; fazla dönüşe karşı eşzamanlılık, idempotency, yetkisiz rol/site ve denetim hatasında geri alma denendi.
- Keycloak üzerinden mevcut rework ile iki operasyonlu üretim ve sevkiyat regresyonları geçti; ikincisi kaynak ve paketli uygulamada çalıştırıldı.
- Yerel Compose readiness 200 ve oturumsuz API 401 döndü. 320, 360, 375, 390, 430, 768 ve 1440 CSS piksel taşma kontrol edildi.
- İlk tam backend denemesinde yeni migration sürümü test beklentisine henüz eklenmediği için 135/136; düzeltme sonrası 136/136 geçti. İlk yeni ön yüz CI denemesinde Playwright tarayıcısı bulunamadı; sonraki koşuda yerel Chrome açıkça seçildi. İlk denemelerin kanıtları korunmuştur.

Fason rotası tam olarak iç → fason → iç sırasıyla sınırlıdır. Geliştirme API'leri yalnız izole modda açıktır. Tedarikçinin sevki ayrıca teyit ettiği veya yeni bir fiziksel olayın otomatik oluştuğu iddia edilmez. Gerçek üretim yayını, canlı çok kullanıcı güvenlik incelemesi ve gerçek mobil cihaz kabulü bu doğrulamanın dışındadır.

Teknik sözleşme: `backend/docs/GATE2_OUTSOURCING_IMPLEMENTATION.md`. Test kayıtları ve ekran görüntüleri `evidence/` altındadır.

## Değişen kaynak dosyaları

Backend: `backend/docs/API_CONTRACT.md`, `backend/docs/GATE2_OUTSOURCING_IMPLEMENTATION.md`, `backend/migrations/024_outsourcing_suppliers.sql`, `backend/migrations/025_outsourcing_ledger.sql`, `backend/migrations/026_outsourcing_release.sql`, `backend/security/provision-runtime.js`, `backend/src/app.js`, `backend/src/integration-contracts.js`, `backend/src/orders-planning.js`, `backend/src/output-reservations.js`, `backend/src/outsourcing-service.js`, `backend/src/physical-flow.js`, `backend/src/production-execution.js`, `backend/src/quality-disposition.js`, `backend/src/readiness.js`, `backend/src/recovery-catalog.js`, `backend/src/recovery-resource.js`, `backend/src/route-support.js`, `backend/src/shipping-service.js`, `backend/test/b03a-rls.test.js`, `backend/test/b03c-flow.test.js`, `backend/test/b04b1a-quality.test.js`, `backend/test/integration.test.js`, `backend/test/inventory-upgrade.test.js`, `backend/test/recovery-catalog.test.js`.

Frontend: `integration/api-adapter.js`, `integration/premium-api.js`, `tests/fason-flow-oidc-browser.cjs`, `tests/fason-supplier-oidc-browser.cjs`, bu rapor ve `docs/fason/evidence/` altındaki test kayıtları ve kurgusal ekran görüntüleri. Önceden mevcut backend `docs/evidence/` izlenmeyen dosyaları bu çalışma tarafından değiştirilmedi.

Son ön yüz doğrulaması: `npm run test:ci` çıkış kodu 0; 292/292 alan, 12/12 + 12/12 Node testleri, kaynak ve paket için ayrı ayrı 110/110 tarayıcı testi, kaynak ve paket izolasyon/sprint kontrolleri; beklenmeyen uygulama hatası 0. Gerçek Keycloak testleri: fason kaynak 1/1, paket 1/1, tedarikçi 1/1, rework 1/1, iki operasyon kaynak 1/1 ve paket 1/1. Kaynak/paket fason testi, cevap kaybından sonra aynı kimlikle şifreli kurtarma senaryosunu içerir.

CI komutuna dahil olmayan Sprint 2 kontrolleri ayrıca çalıştırıldı: kaynak ve pakette ayrı ayrı responsive 7/7 ve iş emri durumları 4/4.
