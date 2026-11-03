# Mevcut işlev envanteri — yeniden düzenleme öncesi

Tarih: 2026-11-02. Kaynak: frontend `bbb5657`, backend `2980d8d`; doğrulama kaynak kodu (`integration/premium-api.js`, `integration/api-adapter.js`, `assets/js/`) ve `backend/docs/API_CONTRACT.md`. Bu bir mevcut-durum envanteridir; hedef konumların uygulandığı anlamına gelmez. API tüm yolları `/api/v1/sites/{tenant}/{site}` altında ve yalnız izole geliştirme kipindedir. Rol yetkileri sunucu tarafından tekrar denetlenir. Aşağıdaki test adları mevcut kapsamı gösterir; yeni koşu sonucu değildir. Demo işlevleri API eşdeğeri değildir. Bazı eski API sözleşmesi metinleri sonraki uygulama ile çeliştiğinden adapter ve gerçek endpointler esas alınmalıdır.

Kısaltmalar: P=`integration/premium-api.js`, A=`integration/api-adapter.js`, D=`assets/js/` altındaki demo modülü. Kapsam okuması için `orders.read` ve etkin site üyeliği gerekir; işlem yetkileri ayrıca belirtilir. Kanıt ailesi: **F**=`factory-journey`/`factory-refinement`, **I**=`inventory-oidc-browser`, **O**=`operator-quality`/`factory-roles-drawing`, **Q**=`rework-oidc-browser`, **X**=`fason-flow-oidc-browser`, **S**=`shipping-oidc-browser`, **R**=`rma-oidc-browser`, **C**=CI domain/browser/isolation, **D**=drawing tests. Bunlar işlev başına tüm uç durumların test edildiği iddiası değildir.

| İşlev | Mevcut ekran / modül | API / servis | Yetki; nesne | Hedef / giriş | Durum; test; geçiş kararı |
|---|---|---|---|---|---|
| Sipariş listesi, arama | Siparişler; P | A `orders` | orders.read; sipariş | Siparişler / liste | destekli; F,C; koru |
| Sipariş oluşturma, rota, isteğe bağlı ilk plan | Sipariş sihirbazı; P, `server-wizard-workflow.js` | A `createOrder`, `defineRoute`, `plan` | orders.write, plan için planning.write; sipariş/operasyon | Siparişler / yeni | destekli, üç ayrı komut ve kurtarma; F,C; koru |
| Sipariş ayrıntısı, rota ve net sevk | Sipariş detayı; P | A `order`, `workOrders` | orders.read; sipariş | Siparişler / kayıt | kısmi: çapraz özetler sınırlı; F,C; taşıma sırasında koru |
| İş emri listesi, detay ve kullanılabilir plan | İş Emirleri / Planlama; P | A `workOrders`, `availability` | orders.read; iş emri | Planlama / işler ve detay | destekli; F,C; koru |
| İlk operasyon planlama | Planlama; P | A `plan` | planning.write; iş emri | Planlama / plan ekle | destekli; F,C; koru |
| Sonraki iç operasyon ve rezervasyon | İş emri detay; P | A `downstreamPlan`, `reserve`, `release`, `downstream` | planning.write; operasyon/lot | Planlama; üretime bağlantı | desteklenen rota sınırlı; F,C; koru |
| Operatör ataması, makine ve devir | İş emri detay; P | A `assignment`, `operator`, `machine`, `handover` | orders.write; atama | Planlama / iş emri | destekli; O,F; koru |
| Bana atanan işler | Operatör; P | A `assignedWorkOrders` | aktif operator rolü, production.write; iş emri | Üretim / işlerim | destekli; O,F; koru |
| Başlat, duraklat, sürdür, tamamla | Operatör ve iş emri; P | A `productionCommand` | production.write ve güncel atama; iş emri | Üretim / aktif iş | destekli; O,F; koru |
| Fiziksel lot seçimi ve üretim kaydı | Operatör; P | A `production`, `productionCommand`, `operationInputs` | production.write; girdi/çıktı lotu | Üretim / üretim kaydet | destekli; O,F; koru |
| Üretim ve tüketim geçmişi | İş emri / Operatör; P | A `productionHistory` | orders.read; üretim olayı | Üretim / geçmiş | destekli; O,F; koru |
| Operasyonlar arası sevk ve fiziksel kabul | İş emri detay; P | A `dispatch`, `receive`, `downstream` | stock.write; rezervasyon/hareket | Üretim / transfer | destekli rota sınırlı; F; koru |
| Çizim revizyonu, PDF, açık onay | Operatör; P | A `drawing`, `drawingDocument`, `drawingAck` | production.write ve atama; çizim | Üretim / iş bağlamı | destekli; PDF açılmadan UI onayı kapalı; D,O; koru |
| Çizim yayımlama ve geçmiş | İş emri/çizim; P, D `drawing-service.js` | sunucu drawings/publish; demo drawing service | orders.write; çizim | Yönetim / iş emri bağlamı | kısmi: sunucu belge deposu geliştirme amaçlı; D,F; mevcut erişimi koru |
| Kalite kuyruğu ve kararlar | Kalite; P | A `quality`, `qualityDecision` | quality.write; üretim olayı | Kalite / kontroller | destekli; F,Q; koru |
| Kısmi onay, ret ve rework | Kalite; P | `quality/decisions` | quality.write; çıktı lotu | Kalite / kontrol detayı | destekli; F,Q; koru |
| Kalite geçmişi | İş emri / Kalite; P | A `qualityHistory` | orders.read; karar | Kalite / geçmiş | kısmi bağımsız kuyruk yok; Q,F; koru |
| Rework keşif ve tahsis | Kalite; P | A `reworkDecisions`, `reworkAllocate`, `reworkRelease` | quality.write; karar/tahsis | Kalite / rework kuyruğu | destekli; Q,F; ayrı girişe taşı |
| Rework iş emri, işleme ve tekrar kontrol | Kalite ve Operatör; P | A `reworkWorkOrder`, production, quality | quality.write / production.write; rework işi | Kalite / rework; Üretim / yürütme | destekli, tek çevrim sınırı; Q,F; koru |
| Malzeme tanımı ve arama | Malzeme ve Depo; P | A `inventoryRead(materials)`, inventory mutations | stock.write yazma; malzeme | Depo / malzemeler | destekli; I,F; koru |
| Yer hiyerarşisi | Malzeme ve Depo; P | inventory `locations` | stock.write yazma; tesis/depo/bölge/konteyner | Depo / konumlar | destekli; I,F; koru |
| Mal kabul ve lot | Depo; P | inventory `receipts` | stock.write; lot | Depo / mal kabul | destekli; I,F; koru |
| Bakiye, hareket, yerler arası transfer | Depo; P | inventory `balances`, `movements`, `move` | stock.write yazma; lot/hareket | Depo / stok ve taşıma | destekli; I,F; koru |
| İş emrine malzeme teslimi | Depo; P | inventory `pick` | stock.write; lot/iş emri | Depo / iş emrine teslim | atomik destekli; I,F; koru |
| Depo hurda | Depo; P | inventory `scrap` | stock.write; lot | Depo / hurda | destekli; I; koru |
| Eski kurgusal mal kabul/tahsis/kabul | İş emri; P | `fictional-material-receipts`, `fictional-material-allocations`, `physical-receipts` | stock.write; sipariş lotu | Depo / gelişmiş geliştirme | geliştirme kipi; C,O; erişimi koru |
| Fason tedarikçi, iş, sevk | Fason; P | A `outsourcingSuppliers`, `outsourcingRead`, `outsourcingJob`, `outsourcingDispatch` | planning.write / stock.write; tedarikçi/fason | Lojistik / fason | destekli; X,F; bağımsız kuyruk gerekli |
| Fason kısmi dönüş, kontrol, sonraki iş | Fason; P | A `outsourcingReturn`, `outsourcingInspect`, `outsourcingPlan` | stock.write / quality.write / planning.write; dönüş | Lojistik / fason | destekli; X,F; koru |
| Sevke hazır çıktı, sipariş ve tahsis | Sevkiyat; P | A `shippingRead`, shipping order/allocate | shipment.write yazma; sevk/lot | Lojistik / sevkiyat | destekli; S,F; bağımsız kuyruk gerekli |
| Sevk, teslim ve geçmiş | Sevkiyat; P | shipping dispatch/deliver | shipment.write; sevk | Lojistik / sevkiyat | destekli; S,F; koru |
| RMA yetkisi ve fiziksel kabul | İadeler; P | A `rmaRead`, `rmaAuthorize`, `rmaReceipt` | shipment.write / stock.write; iade | Lojistik / iadeler | destekli ama mevcut giriş sipariş seçimine bağlı; R,F; bağımsız kuyruk gerekli |
| RMA karantina, kontrol ve karar | İadeler; P | A `rmaInspect`, `rmaDisposition` | quality.write; iade | Lojistik / iade detayı | destekli; R,F; koru |
| RMA kontrollü serbest bırakma / rework | İadeler; P | A `rmaRelease`, `rmaRework` | ilgili stock/quality yetkileri; iade lotu | Lojistik / iade detayı | destekli sınırlar içinde; R,F; koru |
| Oturum, tenant ve site | API shell; P, `auth-provider.js` | session, capabilities, OIDC BFF | doğrulanmış kimlik/site; oturum | profil / site | destekli; OIDC,C; koru |
| Belirsiz komut kurtarma | API shell; P, `server-pending-commands.js` | `/recovery`, retry, workflow | aktör/tenant/site; komut | ortak kurtarma | şifreli sunucu kurtarma; C/OIDC; koru |
| Lot soyağacı | iş, kalite, sevk ve iade detayları; P | ilgili downstream/history/returns reads | scoped orders.read ve endpoint yetkisi; lot | her kayıttan izlenebilirlik | kısmi: tek küresel görünüm yok; F; eksik geçmişi uydurma |
| Genel arama | sipariş/depo yerel filtre; P | orders, inventory reads | scoped read; çoklu nesne | genel arama | kısmi: küresel API/yetkili arama yok; C; güvenli sözleşme gerekli |
| Kullanıcı/rol/site yönetimi | sunucu yetenek matrisi | `permissions.js`; mevcut UI yönetimi doğrulanmadı | members.manage; üyelik | Yönetim | API UI desteği doğrulanmadı; yetkisiz yönetim uydurma |
| Kalite politikası / UX-07 / ayarlar | yerel demo; D `ux-audit.js`, `ux-quality-drawings.js`, `ux-p1.js` | demo servisleri | demo aktör kuralları; ayar/denetim | Yönetim | yalnız demo; C; API'ye yanlış eşleme yapma |
| Dashboard ve demo gezinme | yerel demo; D `ux-shell.js`, `ux-p1.js` | demo localStorage servisleri | demo aktör; görev | Genel Bakış | API'de gerçek görev özeti yok; C; demo korunmalı |
| Yerel demo kurtarma / çoklu sekme | D `persistence*.js`, `transactions.js`, `integrity.js` | sürümlü demo deposu ve Web Locks | demo; snapshot | ortak kurtarma / UX-07 | destekli; C; API deposundan ayrı tut |

## Eksiklikler ve güvenli geçiş kapıları

- API iade, fason ve sevkiyat okumaları sipariş kapsamlıdır; gerçek bağımsız kuyruk ve küresel arama için sunucu tarafında yetkili, sayfalanmış okuma sözleşmesi gerekip gerekmediği doğrulanmalıdır. Tüm siparişleri istemcide toplayarak eksik erişim ve büyük veri sorunları gizlenmemelidir.
- Yetki matrisi ayrı `quality.read` veya `warehouse.read` tanımlamaz. Menü gösterimi sunucu yetkilerinin yerine geçemez; gerçek endpoint kontrolü korunmalıdır.
- Çizim onayı PDF açılmadan etkinleşmemeli; yükleme insanın içeriği okuduğunu kanıtlamaz.
- Sipariş sihirbazı atomik tek işlem değildir; üç komutun kayıtlı ve belirsiz durumları mevcut şifreli kurtarma akışıyla korunur.
- Eski demo yönetimi/UX-07 API yönetimi olarak sunulmamalı; demo modunun erişimi korunmalıdır.
