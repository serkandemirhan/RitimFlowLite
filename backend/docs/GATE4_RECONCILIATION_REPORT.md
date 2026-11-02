# Gate 4 — modüller arası mutabakat

Karar: **Geliştirme GO; üretim NO-GO.** Testler kurgusal veriler, izole PostgreSQL 16.10 şeması, gerçek Keycloak ve Docker Compose API üzerinde çalıştırıldı. Kullanıcı verileri, mevcut volume'lar ve eski kanıtlar korunmuştur.

| Kapsam | PostgreSQL | API | Premium UI | Gerçek tarayıcı E2E | Karar |
|---|---|---|---|---|---|
| Rework | PASS | PASS | PASS | PASS, kaynak ve paket | GO |
| Fason | PASS | PASS | PASS | PASS, kaynak ve paket | GO |
| Müşteri iadesi | PASS | PASS | PASS | PASS, kaynak ve paket | GO |
| Modüller arası mutabakat | PASS | PASS | PASS | PASS, aynı siparişle kaynak ve paket | GO |

GO yalnız doğrulanan geliştirme kapsamına aittir. Linux CI, gerçek mobil kabul, güvenli üretim konfigürasyonu ve işletimsel kabul doğrulanmamıştır.

## Gerçek zincir ve miktarlar

Aynı siparişte depo kabulü → üretim → kalite → fason sevk ve kısmi dönüş → son üretim → sevkiyat/teslim → iade → karantina/karar → rework girdisi/çıktısı → yeniden kalite kontrol, gerçek oturumla premium ekranlardan yürütüldü. Güncel test kaynakta ve pakette çalıştı: [kaynak](evidence/gate4-20261102/combined-source-final.tap), [paket](evidence/gate4-20261102/combined-package.tap). Lot ilişkilerini kanıtlayan [SQL](evidence/gate4-20261102/genealogy.sql) ve [gerçek sonucu](evidence/gate4-20261102/genealogy.txt) ayrıca korunmuştur.

- Depo: 100 = A konumunda 50 + B konumunda 30 + üretime fiziksel aktarılan 20.
- Fason: 20 sevk = tedarikçide 8 + dönen 12; dönen 12 = onaylı 10 + red 2. Onaylı 10 ikinci üretime fiziksel girdi olur.
- Son üretim: 10 = teslim 8 + ilk son çıktı lotunda 2; teslim 8 = müşteride kalan 3 + fiziken iade 5.
- İade 5 = karantinada onaylı fakat serbest bırakılmamış 1 + hurda 2 + rework girdisi 2. Rework girdisi 2 tüketilir; yeni çıktı yeniden kontrolle 2 onay alır.
- Son görünüm: kaynak son çıktı 2 + yeniden kontrol edilmiş rework 2 = sevke uygun 4; net müşteri sevkiyatı 8 − 5 = 3. İade kaynaklı 1 adet açık serbest bırakma yapılmadığı için sevkiyat seçiminde görünmez.

Bunlar ardışık fiziksel durum denklemleridir; tarihi üretim, sevk ve kalite sınıfları fiziksel bakiyelerle toplanmaz. İade geçmiş teslim kaydını silmez. Kalite kararı öncesi rework için sunucu onaylı kullanılabilirliği sıfırdır; gerçek API sevk tahsisini reddeder.

## Güvenlik, eşzamanlılık ve test sonuçları

- PostgreSQL 16.10 tam backend: **136/136**, 0 fail/skip; son testte iade hurda kararının serbest bırakılması ve rework'e bağlanması reddedildi, reinspection öncesi sevkiyat reddedildi ve normal kaynak bakiye ile iade serbest stokunun eşzamanlı tahsisi sınandı. [Son koşu](evidence/gate4-20261102/backend-final.tap).
- İncelenen sekiz kritik tablo için FORCE RLS etkin; runtime rolü superuser, rol/DB oluşturma ve BYPASSRLS yetkisine sahip değil. [RLS](evidence/gate4-20261102/forced-rls.txt), [rol](evidence/gate4-20261102/runtime-role.txt). B01–B04 regresyonları tenant/site, üyelik iptali, idempotency, denetim rollback ve işlem sınırlarını içerir. Bu sınır, ele geçirilmiş uygulama sürecinden gelen keyfi SQL'e karşı tam güvenlik iddiası değildir.
- Tekrarlanan `npm run test:ci`: **292/292 alan**, **12/12 kurtarma**, **12/12 paketleme**, **110/110 kaynak + 110/110 paket tarayıcı** ve her iki modda **32/32 izolasyon/Sprint 0/1** kontrolü; uygulama hatası sıfır. [Log](evidence/gate4-20261102/frontend-ci-retry.log).
- Sprint 2: kaynak ve pakette ayrı ayrı **7/7 genişlik (320–1440 px) + 4/4 durum** kontrolü. Kanıtlar `evidence/gate4-20261102/` altındadır. Bunlar gerçek telefon testi değildir.
- Gerçek Keycloak/Fastify/PostgreSQL ile kaynak ve pakette birleşik senaryo, Rework, Fason, RMA, sevkiyat ve iki operasyon: **12/12**; son ekran-bakiye kontrolleriyle birleşik kaynak/paket ayrıca **2/2** tekrarlandı. İstemci hata kontrolleri ve kasıtlı kayıp-yanıt/idempotency tekrarları ilgili testlerde korunmuştur.
- API container readiness **200**, kimliksiz session **401**. Backend tam koşusunda çizim revizyonu/onay kapısı ve iki operasyon kapsamı geçti.
- İlk tam frontend CI koşusu transfer T01-1440 sayfasında 7 saniyelik `page.goto` zaman aşımıyla durdu (24 başarılı, 1 başarısız, 0 uygulama hatası); [log](evidence/gate4-20261102/frontend-ci-initial.log), [ayrıntı](evidence/gate4-20261102/frontend-transfer-initial.json). Diğer tarayıcı yükü kaldırılarak tüm CI yeniden çalıştırıldı ve geçti. Başarısız deneme saklandı; zaman aşımı performans/kararlılık riski olmaya devam eder.

## Sınırlar

Fason rota şekilleri ve rework çevrimi yalnız mevcut desteklenen kapsamda test edilmiştir; desteklenmeyen akışlar açılmadı. Geçmiş veride eksik soy bilgisi uydurulmaz. Test tarayıcı profilleri ve veriler kurgusaldır; gerçek mobil cihazlarda kabul testi yapılmadı. Üretim için Linux GitHub Actions doğrulaması, gerçek mobil kabul, gerçek kimlik sağlayıcı ve tenant işletimi, üretim gizli anahtar/yedek/rotasyon operasyonları, harici belge deposu ve tarama, PDF önizleme güvenilirliği, yedek/geri dönüş ve tehdit modeli gözden geçirmesi gereklidir.

Yeni testler `test/b04b1a-quality.test.js` ve frontend `tests/gate4-cross-module-oidc-browser.cjs` içindedir. Tekrar için backend'de izole PostgreSQL bağlantısıyla `npm test`; frontend'de `npm run test:ci`; birleşik test için kurgusal Keycloak/Compose ortamında `OIDC_FIXTURE_DIR`, `OIDC_TEST_PASSWORD`, `RITIM_BACKEND_DIR`, `TEST_DATABASE_URL`, `I01_API_PORT` ve `AUDIT_CHROME` ayarlanıp `node --test tests/gate4-cross-module-oidc-browser.cjs` çalıştırılır. Paket koşusunda `RITIM_APP_ROOT` üretilmiş `public` dizinine ayarlanmalıdır. Üretim sırları repoya girmez.
