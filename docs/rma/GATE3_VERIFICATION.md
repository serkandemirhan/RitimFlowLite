# Gate 3 — Müşteri iadesi doğrulaması

Yalnız izole geliştirme modu ve kurgusal veriler kullanıldı. Gerçek Keycloak, Fastify ve PostgreSQL 16 ile kaynak ve paketli premium arayüzde 30 teslim → 8 iade yetkisi → 6 fiziksel kabul → 3 rework / 2 hurda / 1 onay senaryosu çalıştı; 2 adet yetki bakiyesi kaldı. Kontrol edilmemiş ve onaylı fakat serbest bırakılmamış miktar normal stok/seykiyat değildir. Rework girdisi mevcut üretim motorunda tüketildi ve yeni çıktı tekrar kalite kontrolü öncesinde uygun değildi. Yetkili yönetici gerekçesiyle ayrı serbest bırakılan onaylı miktarın tekrar sevki PostgreSQL testinde izlendi.

PostgreSQL 16 restricted-runtime tam regresyonu 136/136 geçti. Eşzamanlı RMA yetkisi ve kabul, idempotent tekrar, yetkisiz/iptal edilmiş üyelik, tenant/site sınırı ve audit hatasında geri alma denendi. Tarayıcıda RMA isteğinin yanıtı kasıtlı kesilerek aynı kimlikle şifreli sunucu kurtarması, API hatasında eski verinin gizlenmesi ve 320–1440 CSS piksel taşma kontrolleri doğrulandı. Gerçek Keycloak ortamında rework, fason ve iki operasyonlu sevkiyat regresyonları; ikincisi kaynak ve pakette olmak üzere geçti. Sprint 2 responsive ve iş durumları kaynak ve pakette ayrı ayrı 7/7 ve 4/4 geçti.

İlk iki odak denemesinde sırasıyla tekrarlanan test idempotency anahtarı ve aynı transaction içinde kapsamın iki kere açılması hataları düzeltildi. Serbest bırakma genişletilirken eski net sevk beklentileri de yeni fiziksel iade miktarına göre düzeltildi. Başarısız denemelerin kanıtları saklandı. Compose readiness 200, oturumsuz API erişimi 401 döndü.

Gerçek üretimde etkin değildir. Geçmiş kimliksiz iadeler otomatik dönüştürülmez; iade yetkisi iptal/revizyonu, kredi/iade ödemesi ve muhasebe bu kapsamda yoktur. Desteklenen rework bir döngüyle sınırlıdır. Gerçek mobil cihaz kabulü ve üretim güvenliği ayrıca gereklidir.

Veri modeli ve API sözleşmesi: backend çalışma ağacındaki `backend/docs/GATE3_CUSTOMER_RETURNS.md`. Test kayıtları ve kurgusal ekran görüntüleri `evidence/` altındadır.

## Kaynak dosyaları

Backend: `backend/docs/API_CONTRACT.md`, `backend/docs/GATE3_CUSTOMER_RETURNS.md`, `backend/migrations/027_customer_rma.sql`, `backend/security/provision-runtime.js`, `backend/src/app.js`, `backend/src/orders-planning.js`, `backend/src/output-reservations.js`, `backend/src/production-execution.js`, `backend/src/quality-disposition.js`, `backend/src/readiness.js`, `backend/src/recovery-catalog.js`, `backend/src/recovery-resource.js`, `backend/src/rma-service.js`, `backend/src/shipping-service.js`, `backend/test/b03a-rls.test.js`, `backend/test/b04b1a-quality.test.js`, `backend/test/integration.test.js`, `backend/test/inventory-upgrade.test.js`.

Frontend: `integration/api-adapter.js`, `integration/premium-api.js`, `tests/rma-oidc-browser.cjs`, bu rapor ve `docs/rma/evidence/` altındaki test kanıtları ve ekran görüntüleri. Önceden mevcut backend `docs/evidence/` izlenmeyen dosyaları korunmuştur.

Son `npm run test:ci` çıkış kodu 0: 292/292 alan, 12/12 + 12/12 Node testleri, kaynak ve pakette ayrı ayrı 110/110 tarayıcı testi; kaynak ve paket izolasyon, sihirbaz ve Sprint 0/1 testleri başarılı, beklenmeyen uygulama hatası 0. Sprint 2 özel kontrolleri kaynak ve pakette ayrı ayrı 7/7 responsive ve 4/4 iş durumu geçti. Son kaynak ve paket gerçek Keycloak iade testleri ayrı ayrı 1/1 başarılıdır.
