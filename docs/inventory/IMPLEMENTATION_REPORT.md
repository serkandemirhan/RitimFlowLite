# Malzeme ve depo entegrasyonu

Durum: **Geliştirme GO — yalnızca kurgusal, adet bazlı izole geliştirme kapsamı. Gerçek üretim ve dağıtım NO-GO.**

## Kapsam

API geliştirme modundaki Malzeme ve Depo ekranı malzeme arama/oluşturma, tesis → depo → bölge → konteyner oluşturma, mal kabul, lot/konum bakiyesi, hareket, iş emrine fiziksel teslim ve hurda komutlarını sunucuya bağlar. Yerel kurgusal demo ayrı çalışır. API hatasında geçmiş envanter görünümü geçerli veri gibi sunulmaz. Yazmalar aktör/tenant/site yetkisine bağlı şifreli sunucu kurtarma günlüğünden ve kalıcı idempotency anahtarından geçer; browser depolamasına komut gövdeleri yazılmaz.

Backend `019_inventory_foundation.sql` hareket defterini ve `inventory_picks` kaynak izini ekler. Bir iş emrine teslim depo konumunu düşürür, siparişe özgü üretim lotunu, mevcut B03C tahsisini ve fiziksel kabulü tek transaction içinde oluşturur; denetim kaydı veya başka bir adım başarısızsa tamamı geri alınır. `WH-PICK-…` referanslı sipariş lotu kaydı yeni tedarikçi teslimi değildir; kaynak depo lotu ve özgün belge ayrı korunur.

Kurgusal kabul örneği: A'ya 100 adet giriş, A'dan B'ye 30 adet hareket, A'dan iş emrine 20 adet teslim → A 50, B 30, fiziksel kabul 20. Üretim bu 20'yi bir kez tüketir; geçmiş üretim depo bakiyesi sayılmaz.

## Bilinen sınırlar

Yalnızca adet baz birimi ve ilk iç operasyonun mevcut kabul sınırı desteklenir; ağırlık/uzunluk dönüşümleri, satın alma ve gerçek tedarikçi doğrulaması burada yoktur. İş emrinde üretim olayı başladıktan sonra mevcut B03C kuralı yeni ilk malzeme kabulünü reddeder. Mevcut tarihsel üretim lotları için bilinmeyen depo geçmişi uydurulmaz. Malzeme listesi ve hareket sorgusu ilk 500 kayıtla sınırlıdır ve kesin commit sırası garantili sayfalama sağlamaz. İş emri seçimi mevcut siparişler için ayrı sorgular yaptığı için büyük veri hacminde sunucu tarafı sayfalı bir seçim modeli gerekir. Gerçek mobil cihaz kabulü, üretim sırları ve doküman depolama, çok cihazlı üretim işletimi ve güvenlik değerlendirmesi ayrıca gereklidir.

Başarısız ilk denemeler, zaman aşımı ve sonraki test kanıtları `evidence/` altında saklanır. Gerçek müşteri verisi kullanılmadı; testler ayrı kurgusal PostgreSQL şemasına ve özel Docker API container'ına yöneltildi.

## Değişiklik envanteri

Backend: `backend/migrations/019_inventory_foundation.sql`, `backend/src/inventory-service.js`, `backend/src/inventory-balance.js`, `backend/src/physical-flow.js`, `backend/src/app.js`, `backend/src/readiness.js`, `backend/src/recovery-catalog.js`, `backend/src/recovery-resource.js`, `backend/security/provision-runtime.js`, `backend/docs/API_CONTRACT.md`, `backend/docs/INVENTORY_INTEGRATION_ANALYSIS.md`, `backend/docs/INVENTORY_IMPLEMENTATION_STATUS.md`; `backend/test/inventory-balance.test.js`, `inventory-upgrade.test.js`, `b03a-rls.test.js`, `b03c-flow.test.js`, `b04b1a-quality.test.js`, `integration.test.js`.

Frontend: `integration/api-adapter.js`, `integration/premium-api.js`, `tests/inventory-oidc-browser.cjs`, `tests/oidc-compose-two-operation.cjs`, `tests/second-vertical-browser.cjs`, `tests/p0-browser.cjs`, bu rapor ve `docs/inventory/evidence/` altındaki kanıtlar. İki mevcut entegrasyon testinde süreye bağlı beklemeler panelin gerçekten yenilenmesini bekler; gerçek ağ veya uygulama hataları genel olarak bastırılmamıştır.

Paketli P0 regresyonunun ilk koşusunda `B01-1440` sayfa yükleme zaman aşımı (7 saniye) görüldü; hata kanıtı korunarak test zaman aşımı 15 saniyeye yükseltildi. Tam CI son sürümde tek başına tekrar çalıştırıldı ve başarıyla tamamlandı.

## Son doğrulama

- PostgreSQL 16.10 ve kısıtlı runtime: **130/130**, başarısız/atlanmış yok. 018→019 kurgusal veri yükseltmesi, eşzamanlı tahsis, idempotency ve audit hatasında tüm kayıtların geri alınması dahil.
- Node 22 ile `npm run test:ci`: alan **292/292**, sunucu kurtarma **12/12**, paketleme **12/12**, smoke **1/1**, kaynak browser **110/110** ve paket browser **110/110**. İki izolasyon koşusunda ayrı ayrı açılış 5/5, birlikte çalışma 2/2, sihirbaz 10/10, Sprint 0 6/6 ve Sprint 1 9/9. Beklenmeyen uygulama hatası bildirilmedi.
- Kaynak ve paket için ayrı Sprint 0/1/2 ve durum kontrolleri **26/26 + 26/26**. I02 gerçek PostgreSQL/Fastify browser **1/1 + 1/1**.
- Gerçek Keycloak, container Fastify ve PostgreSQL ile malzeme arama, iki kullanıcı, 100→70/30→50/30, 20 fiziksel teslim/tüketim, kayıp yanıt sonrası aynı komutla tekrar, fazla hurda reddi, 503 sırasında eski stokların gizlenmesi ve 320–1440 px kontrolleri: kaynak **1/1**, paket **1/1**.
- İki operasyonlu gerçek Keycloak paket testi **1/1**; Fastify/PostgreSQL ikinci dikey testleri kaynak ve pakette **1/1 + 1/1**; operatör/kalite/çizim testleri kaynak ve pakette **1/1 + 1/1**. Önceki iki zaman aşımı ve başarılı tekrarları kanıt klasöründe korunur.
- Docker API: readiness 200; kimliksiz stok isteği 401; movement INSERT izni geri çekilince readiness 503; container içinden TLS doğrulamalı Keycloak discovery/JWKS 200/200. Test sertifikası kontrolü kapatılmadı.
- Paket kaynak özeti `6ac3087367a7abbfcaebc231f2a27de363b215116328e1107bbbdde1a70c88be`; migration 019 SHA-256 `a4c2489d353a83bb434e41f0979d4124c7c3486cec882e3b09253bf498c38757`.

## Kanıt dosyaları

- `evidence/backend-consumption-test-first-failure.tap`
- `evidence/backend-first-pick-failure.tap`
- `evidence/backend-postgresql16-final.tap`
- `evidence/backend-postgresql16.tap`
- `evidence/ci-first-missing-browser.log`
- `evidence/ci-packaged-b01-timeout.json`
- `evidence/ci-packaged-timeout.log`
- `evidence/compose-build.log`
- `evidence/compose-readiness-negative.log`
- `evidence/frontend-ci-final.log`
- `evidence/i02-package-locked.tap`
- `evidence/i02-source-locked.tap`
- `evidence/integration-source-first-failure.tap`
- `evidence/integration-source-retry.tap`
- `evidence/integration-unit.tap`
- `evidence/operator-quality-package-locked.tap`
- `evidence/operator-quality-source-locked.tap`
- `evidence/packaged-keycloak-warehouse-accepted.tap`
- `evidence/packaged-keycloak-warehouse-final.tap`
- `evidence/packaged-keycloak-warehouse-locked.tap`
- `evidence/packaged-keycloak-warehouse.tap`
- `evidence/packaged-sprint-regressions.log`
- `evidence/packaged-warehouse-accepted.png`
- `evidence/packaged-warehouse-final.png`
- `evidence/packaged-warehouse-locked.png`
- `evidence/packaged-warehouse.png`
- `evidence/second-vertical-package-locked.tap`
- `evidence/second-vertical-source-locked.tap`
- `evidence/source-keycloak-warehouse-accepted.tap`
- `evidence/source-keycloak-warehouse-final.tap`
- `evidence/source-keycloak-warehouse-locked.tap`
- `evidence/source-keycloak-warehouse.tap`
- `evidence/source-operator.png`
- `evidence/source-sprint-regressions-current.log`
- `evidence/source-sprint-regressions.log`
- `evidence/source-warehouse-accepted.png`
- `evidence/source-warehouse-final.png`
- `evidence/source-warehouse-locked.png`
- `evidence/source-warehouse.png`
- `evidence/two-operation-packaged-first-failure.tap`
- `evidence/two-operation-packaged-locked.tap`
- `evidence/two-operation-packaged-retry.tap`
- `evidence/two-operation-source.tap`
- `evidence/upgrade-018-019.tap`
