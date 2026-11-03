# P0-08 — Aynı origin içinde çoklu sekme işlemleri

Tarih: 27 Ekim 2026. Kapsam: mevcut yerel demo için P0-08. P0-06 ve P0-07 sözleşmeleri korunur. Gerçek demo verisine erişilmedi; reset, checkout, clean, staging, commit, push veya deploy yapılmadı.

## Tasarım ve veri bağımlılıkları

`assets/js/transactions.js`, DOM'dan bağımsız ortak işlem katmanıdır. `RitimTransactions.open` dışarıya yalnız korumalı asenkron `commit` sunar. Mevcut `persistence.js` tek anahtara doğrulanmış yazma primitifi olarak içeride kullanılır; aktif uygulamanın `dataSession` nesnesi yeni katmandır. Domain servisleri taslak üzerinde çalışan mevcut komutlardır; işlevleri yeniden yazılmadı. Değişen bootstrap/UI/saklama asset URL sürümleri güncellendi; yeni index ile eski önbellek modüllerinin karışması önlenir.

Her etkin veri anahtarı için `ritim-flow-lite:writer:<key>` adlı gerçek Web Lock istenir: `mode: 'exclusive', ifAvailable: true`. Kilit yok, desteklenmiyor, reddediliyor veya başka sekmede tutuluyorsa komut yazmadan reddedilir. Kuyrukta gizlice bekleyip kullanıcının sonradan değiştirdiği alanları okuyan bir iş yoktur. Kullanıcı aynı komut kimliğiyle tekrar deneyebilir. localStorage kilit bayrağı, storage-event kilidi veya güvenli olmayan alternatif depo yazıcısı kullanılmaz.

Web Locks koordinasyonu aynı origin/depolama bölmesindeki katılan istemciler içindir; kilit zorlayıcı bir sunucu yetkisi değildir. Teknik sözleşme: [Web Locks API standardı](https://www.w3.org/TR/web-locks/).

İşlem sırası:

1. UI, komutun hedefi, miktarı, belgeleri ve aktörünü tıklama anında sabitler. Dosya içeriği okunurken bağlam korunur; okuma bitmeden yeni mutasyon veya uygulama içi veri yenilemesi açılmaz.
2. Komut kimliği sekmeye ait sessionStorage taslak önbelleğine yazılır. Bu yazım başarısızsa iş verisi yazılmaz.
3. Gerçek exclusive kilit alınır. Kilit alınamıyorsa komut çalıştırılmaz.
4. Kilit altında localStorage'ın **en güncel** snapshot'ı yeniden okunur. Şema, protokol ve P0-06 bütünlüğü denetlenir. Eski ekran belleği stok kaynağı olarak kullanılmaz.
5. Kalıcı komut günlüğünde aynı kimlik aranır. Aynı içerik/aktör daha önce yazılmışsa tekrar uygulanmadan önceki commit teyit edilir; farklı içerikte aynı kimlik reddedilir.
6. Servis komutu güncel snapshot'ın taslağında yeniden çalışır. Stok, rezervasyon, plan, sahiplik ve kalite kapıları yeniden hesaplanır. P0-06 guard, etkilenen hatalı kayıtları ve yeni kritik ihlalleri engeller; bağımsız sağlam kayıtların mevcut davranışı korunur.
7. Revizyon artırılır; komut makbuzu taslağa eklenir. İş değişikliği ve makbuz **aynı JSON / aynı setItem** içindedir. Şema ve bütünlük tekrar doğrulanır; yazma ve geri okuma doğrulanır.
8. Ancak bundan sonra bellek, render, modal kapanışı ve başarı bildirimi güncellenir. Kilit serbest bırakılır.

Komutlar kilit içinde senkrondur; ağ veya FileReader beklemezler. Asenkron taslak mutator'ı reddedilir. Kilit tutulurken çalışan servisler güncel state parametresini kullanır.

## Kalıcı revizyon ve idempotency

Snapshot şeması 1 korunur; tanınan isteğe bağlı bir protokol alanı eklenmiştir:

```js
transactionState: {
  version: 1,
  revision: 1,
  commands: [{
    id, fingerprint, actor, kind, revision: 1, time
  }]
}
```

- Protokol alanı olmayan geçerli kayıt **revizyon 0** olarak okunur; açılış/audit/gezinti hiçbir şey yazmaz. İlk açık kullanıcı komutuyla sadece yeni protokol bilgisi eklenir; mevcut domain kayıtları dönüştürülmez. Bu davranış arayüzde ilk kayıt öncesinde açıklanır.
- Tanınmayan protokol sürümü, eksik/bozuk makbuz, yinelenen kimlik, sırasız revizyon veya revizyon/günlük uzunluğu farkı şema hatasıdır. P0-07 ham veri kurtarma ekranı korunur.
- `revision` ve günlük revizyonları güvenli tam sayıdır; günlük 1…N sırasındadır. Eski bir snapshot'ın silindiği veya açılmış sürümün altına gerilediği tespit edilirse yazma durur.
- SHA-256 fingerprint, sıralaması sabitlenmiş komut içeriği ve aktörü kapsar. UI'da işlem kimlikleri UUID ile üretilir. Aynı kimlik farklı miktar/belge/aktör için kullanılamaz.
- Makbuzlar süre aşımıyla veya kota açmak amacıyla budanmaz. Aynı kimlik, sekme kapanıp yeniden açılsa da snapshot'ta bulunur. Entegrasyon çağrısı `RitimCommands.submit(kind, args, {id})` ile aynı kimliği tekrar sunar.
- UI aynı anda gönderilen aynı niyeti tek uçuşta birleştirir; aynı sekmedeki farklı komutu mevcut işlem bitene kadar reddeder. Çift tıklama aynı niyete gider. Bilinen başarıdan sonraki ayrı kullanıcı etkileşimi yeni niyettir; aynı alanlarla kasıtlı yeni üretim mümkündür.
- Başarısız/belirsiz UI isteğinin kimliği sekme oturumu boyunca korunur. Aynı sayfada reload/yeniden denemede esas komut alanları aynıysa kimlik yeniden kullanılır. Başka sekmede/dış entegrasyonda retry yapan çağırıcı aynı `id` değerini korumalıdır; yeni kimlik yeni istek anlamına gelir.

Domain kayıtları ile makbuz birbirinden ayrı anahtarlarda yazılmaz. sessionStorage yalnız istemcinin niyet kimliğini taşır; stok doğruluğunun kaynağı değildir. Sekme oturumu tamamen silinirse bekleyen istemci niyeti kaybolabilir; kalıcı iş makbuzu kalır. Yeni bir kimlikle yapılan işlemin eski isteğin insan tarafından tekrarı mı yoksa yeni fiziksel işlem mi olduğunu sistem kendiliğinden çıkarmaz. Belirsiz sonuçta körlemesine yeni kimlik üretip yeniden oynatma yoktur; önce mevcut kayıt incelenir.

## Eski görünüm ve form koruması

Storage event, focus ve pageshow yalnız güncel kayıtla farkı kontrol eder. Açık form veya bellek sessizce yenilenmez. Eski görünümde uyarı ve **Güncel Kaydı Yükle (Alanları Koru)** düğmesi gösterilir. Açık mutasyon, güncel veri altında yeniden doğrulanabilir; başarısız işlem eski belleği kısmen değiştirmez.

Elle uygulama içi yenileme; kimlikli alanları, sipariş sihirbazının `data-wiz` alanlarını ve transfer dönüş onay kutularını korur. İşlem sürerken yapılan yeni metin değişiklikleri başarı render'ından sonra geri konur. Gönderilen miktar, sonraki düzenlenen değerle yer değiştirmez. Kurtarma ekranına zorunlu geçişte kaydedilmemiş alanlar/komut sekmede tutulur ve ayrı taslak olarak indirilebilir. Taslak komut kimliği ve aktörü de içerir; sekme kapandıktan sonraki kontrollü retry için kimlik korunabilir. Bu taslak tam uygulama yedeği diye içe aktarılmaz.

Dosya seçimi tarayıcı güvenliği nedeniyle programatik yeniden atanmaz. Dosya okuma devam ederken uygulama içi refresh engellenir; okunmuş komutun kurtarma taslağı dosya içeriğini taşıyabilir. Native tarayıcı reload'u, cihazın oturumu yok etmesi veya yeni bir sekme tüm kaydedilmemiş form alanlarını geri getirme garantisi değildir.

Yerel demo aktörü komutla sabitlenir; diğer sekmenin son seçtiği rol komuta yetki kazandırmaz. Kullanıcı seçimi gerçek kimlik doğrulama değildir.

## Entegrasyon ve yazma envanteri

| Yol | Koruma |
|---|---|
| Üretim, fiziksel teslim, kontrol, rework, duraklat/başlat/devret/devral/kapat | UX-05 argümanları tıklamada alınır; komut güncel taslağa uygulanır. |
| Tahsis, fason gönderim, final onay, müşteri sevkiyatı | Komut ve UX-06 hareket kaydı aynı kilitli commit içinde. Tedarikçi ve termin niyet içeriğine dahildir. |
| Eski saveShipment/setStatus/finishJob | Güncel korumalı UI komutuna gider; eski bellek stok hesaplaması kullanılmaz. |
| Planlama, rezervasyon, gönderim/kabul, azaltma | Aynı komut sınırı. Yeni sipariş kimliği kilit altında tekrar denetlenir; sipariş ve ilk iş emri birlikte yazılır. |
| Fiziksel transfer, kabul, geri alma | Aynı sınır; kabul durumu ve lot yeniden doğrulanır. |
| Malzeme, fason dönüş/rework, iade/karar/rework/ters kayıt, telafi, ek izin | Stock servisleri güncel taslakta çalışır. |
| Kalite politikası, rework atama/işleme, eski rework bağlama | Quality servisleri güncel taslakta çalışır. |
| Operatör/makine atama ve rol seçimi | Workforce ve kullanıcı komutu ortak sınırdadır. |
| Çizim revizyonu ve onayı | Dosya/bağlam yakalanır; son sürüm ve isim tekilliği güncel taslakta denetlenir. |
| Recovery import / açık eski sürüm kopyası / ayrı yeni demo | Yeni hedef anahtar aynı gerçek kilitle korunur; hedef varsa üzerine yazılmaz. Özgün kaynak anahtar değiştirilmez. |
| Bağımsız eski satış sayfası | P0-07 salt okunur arşiv olarak kalır. Template içindeki eski save kodu etkin değildir. |

Aktif modüllerde snapshot için bağımsız setItem kalmadı. P0-07'nin düşük seviye primitifi yalnız ortak transaction katmanından çağrılır. Domain servislerinin public JS fonksiyonları taslak API'leridir; geliştirici konsolu/same-origin kötü niyetli kod için bir güvenlik sınırı iddiası yoktur.

## Hata ve kurtarma

Kota/erişim hatasında komut ve makbuz birlikte yazılamaz; eski canlı bellek ve işlem geçmişi korunur. Yanıt veya geri okuma, başarılı yazmadan sonra kesilmişse P0-07 `uncertain` davranışı sürer: başarı bildirimi yoktur, tekrar işlem kapalıdır, kör rollback yapılmaz. Depodaki tam snapshot yeniden açılır; aynı komut kimliği tekrar sunulduğunda makbuz bulunur ve hareket yeniden üretilmez.

Bozuk JSON, desteklenmeyen şema/protokol ve storage erişim hatası eski verinin üzerine demo yazılmasına dönüşmez. Genel reset/otomatik onarım eklenmedi. Aynı origin kotası paylaşıldığı için kota doluyken yeni kopya da başarısız olabilir; sistem yer açmak için anahtar silmez.

## Testler ve kanıt

**P0-08 aynı profil/origin/veri anahtarını paylaşan güncel yerel demo istemcileri için tamamlandı.** Son kodla tüm regresyonlar çalıştırıldı: **292/292 alan + 110/110 tarayıcı**, sıfır fail/skip ve sıfır beklenmeyen uygulama hatası.

- Alan: önceki 264 + 28 yeni P0-08 = **292/292**; [domain-tests.tap](p0-08/evidence/final/domain-tests.tap).
- Tarayıcı: önceki altı paket **90/90**, yeni native Web Locks paketi **20/20**; toplam **110/110**. Nihai çıkış kodları: [exits.json](p0-08/evidence/final/exits.json).
- Yeni yarış paketi: [browser-results.json](p0-08/evidence/final/concurrency-browser/browser-results.json).
- Kaynak/index koruma: [verification.json](p0-08/evidence/verification.json).

| Paket | Sonuç | Son kanıt |
|---|---:|---|
| P0 temel | 16/16 | [JSON](p0-08/evidence/final/prior-p0/browser-results.json) |
| Transfer | 9/9 | [JSON](p0-08/evidence/final/prior-transfer/browser-results.json) |
| Planlama | 9/9 | [JSON](p0-08/evidence/final/prior-planning/browser-results.json) |
| P1 | 11/11 | [JSON](p0-08/evidence/final/prior-p1/browser-results.json) |
| P0-07 persistence | 34/34 | [JSON](p0-08/evidence/final/prior-persistence/browser-results.json) |
| P0-06 integrity | 11/11 | [JSON](p0-08/evidence/final/prior-integrity/browser-results.json) |
| P0-08 native concurrency | 20/20 | [JSON](p0-08/evidence/final/concurrency-browser/browser-results.json) |

Yeni Playwright paketi iki bağımsız sayfayı aynı browser context ve localStorage içinde kullanır. Sahte kilit kullanılmaz. 20 senaryo:

1. 20 final onaylıdan eski Tab A 15 sevk eder; Tab B'nin 15'i reddedilir.
2. Aynı 20 için eşzamanlı iki müşteri sevkiyatı.
3. Önceki operasyonun aynı 20 sağlam çıktısına eşzamanlı iki rezervasyon.
4. Aynı kalıcı komut kimliğinin eşzamanlı/tekrarlı gönderimi ve farklı içerik reddi.
5. Aynı fiziksel transferin iki sekmede kabulü; tek lot ve tek accept olayı.
6. Aynı uygun çıktıdan iki final kalite onayı.
7. Aynı müşteri sevkiyatına iki iade ve aynı iade dosyasına iki restock kararı.
8. Yazma sonrası yanıt kesilmesi, sekme kapanması ve aynı kimlikle yeni sekmede retry.
9. Gerçek kilit çekişmesi ve kilit sahibinin kapanması sonrası retry.
10. Web Locks desteklenmeyen ortamda yazma reddi; audit ve ham export erişimi.
11. Kilitli işlemde kota hatası; değişmeyen bellek/ham geçmiş ve tek retry makbuzu.
12. Eski revizyon uyarısı; açık form korunarak güncelleme ve yeni kayıt.
13. Üretim miktarının tıklamada sabitlenmesi; kilit öncesi/sonrası yeni alan düzenlemesinin korunması.
14. Çift UI üretim gönderiminde tek fiziksel sonuç.
15. Eski saveShipment girişinin güncel kaydı yeniden doğrulaması.
16. Eşzamanlı kısmi fason dönüşü ve mutabakat.
17. Eski plan azaltma isteğinin güncel planla yeniden sınanması.
18. Sihirbaz taslağı ve fiziksel dönüş onay kutusunun stale refresh'te korunması.
19. Dışarıdan bozulmuş snapshot'ta ham verinin ve kaydedilmemiş taslak export'un korunması.
20. Web Locks getter erişiminin reddinde uygulama hatası olmadan salt okunur kurtarma.

Başarılı senaryolarda reload sonrası bellek/persisted snapshot eşitliği, P0-06 kritik bulgu yokluğu ve komut revizyon sırası denetlenir. Hata senaryolarında sıfır/kontrollü yazma, değişmeyen bellek, yanlış başarı bildirimlerinin yokluğu ve geçmişin kaybolmaması sınanır. Alan testleri ayrıca şema/protokol bozukluğu, idempotency içerik çatışması, kopya hedef çakışması, revizyon gerilemesi ve lock API hatalarını kapsar. Aktarılamayan komut sonucu yazmadan önce reddedilir; commit sonrası sonuç kopyalama hatasının yanlış kayıt başarısızlığına dönüşmesi önlenir.

Mevcut browser harness `browser-transactions.cjs` ile uygulamanın public Promise sınırını bekler. P0-07 kota/erişim enjeksiyonları sessionStorage kimlik önbelleğini geçip **iş snapshot'ının** yazmasını/okumasını başarısız kılar; tek iş snapshot yazımı ve eski bellek koruması beklentileri korunur. Eski B12 fixture'ı yalnız RAM'i değiştiriyordu; P0-08 güncel diski esas aldığından test artık persisted fixture'a bozuk final durumunu enjekte eder. QA kontrolü zayıflatılmadı; güncel kayıt denetimi test edilir.

İzole profiller, geçici loopback sunucuları ve mevcut Chrome/Playwright harness kullanıldı. Gerçek kullanıcı origin'i açılmadı. Uygulama içi browser bağlantısı kullanılamadığı için bu fallback uygulandı. Ara koşuda recovery kopyasının beklenen sayfa yönlenmesi testin bekleme katmanını kesmişti; yalnız context-destroyed yönlenme hatası için yeni doküman beklenerek düzeltildi. Nihai koşuda tekrar üretilemedi; uygulama hataları bastırılmadı. Gerçek iOS/Android cihaz kullanılmadı.

```sh
node --test tests/p0-domain.test.cjs tests/p0-transfer.test.cjs tests/p0-planning.test.cjs tests/p1-domain.test.cjs tests/p0-persistence.test.cjs tests/p0-integrity.test.cjs tests/p0-concurrency.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p0-08/evidence/final/concurrency-browser node tests/p0-concurrency-browser.cjs
```

Önceki altı browser script'i `P0_EVIDENCE_DIR=docs/p0-08/evidence/final/<suite>` ile çalıştırılır; önceki P0-06/P0-07 kanıtları korunur.

## Değişen dosyalar

- Yeni: `assets/js/transactions.js`, `assets/js/concurrency-ui.js`.
- Saklama/bootstrap: `assets/js/persistence.js`, `persistence-ui.js`, `index.html`, `assets/css/persistence.css`.
- Komut entegrasyonları: `assets/js/ux-operator.js`, `ux-logistics.js`, `ux-transfers.js`, `ux-planning.js`, `ux-stock.js`, `ux-quality-drawings.js`, `ux-p1.js`.
- Yeni testler: `tests/p0-concurrency.test.cjs`, `tests/p0-concurrency-browser.cjs`, `tests/browser-transactions.cjs`.
- Promise/hata enjeksiyonu uyarlamaları: `tests/p0-browser.cjs`, `p0-transfer-browser.cjs`, `p0-planning-browser.cjs`, `p1-browser.cjs`, `p0-persistence-browser.cjs`, `p0-integrity-browser.cjs`.
- Belgeler: bu rapor, `docs/RELEASE_CHECKLIST.md`, `docs/RELEASE_RISK_REPORT.md`, `docs/p0-08/evidence/`.

P0-06 saf integrity motoru ve domain servisleri değiştirilmedi. Önceden var olan staged/unstaged/untracked dosyalar başlangıç hash envanteriyle karşılaştırılır; toplam git diff bu P0-08 çalışmasının kapsamı değildir.

## Release ve sunucu sınırları

- Bu koruma **aynı tarayıcı profili/origin/depolama bölmesi ve kilit protokolüne katılan güncel uygulama sürümleri** içindir. Başka cihaz, tarayıcı profili veya sunucu verisi için kilit/transaction garantisi yoktur.
- HTTPS/uygun güvenli bağlamda Web Locks gerekir. Desteklenmeyen ortam okuma/kurtarma modundadır. Gerçek hedef mobil tarayıcı, yaşam döngüsü ve depolama davranışı henüz kabul edilmedi.
- Eski, kilitsiz kod veya same-origin harici script Web Lock'a uymadan localStorage yazabilir. Yayın geçişinde eski yazıcı sekmeler kapatılıp güncel candidate ile açılmalı; karma sürümlü istemcilere karşı sunucu güvenliği iddiası yoktur.
- localStorage'ın atomik tek anahtar yazımına dayanılır. Fiziksel cihaz/disk arızasına dayanıklı dağıtık log veya merkezi yedek değildir. Komut günlüğü büyüdüğünde kota güvenli ret üretir; otomatik budama/reset yapılmaz.
- Supabase aşamasında tüm stok/plan/onay/iade komutları sunucuda transaction içinde yeniden doğrulanmalı; benzersiz komut anahtarı, stok/lot kilidi veya sürüm kontrolü, yetki doğrulaması ve hareket geçmişi birlikte yazılmalıdır. Client rolü ve hesaplanan bakiye sunucuda güvenilir kabul edilmemelidir. Bir snapshot'ı tabloya yüklemek yeterli değildir.
- P1-14 kimlik/sunucu yetkisi gerçek kullanım öncesi zorunlu kalır. Gerçek mobil kabul, tekrarlanabilir test bağımlılığı/CI ve sabit candidate paket incelemesi açık. Ara fason rotası mevcut domain sınırıdır.

**Genel yayın önerisi: NO-GO.** P0-08 yerel kabulü tamamlandı; gerçek mobil cihaz kabulü, tekrarlanabilir test/CI ve sabit candidate paket/test/review açık. Gerçek veriyle çok cihazlı kullanım için sunucu transaction/idempotency ve gerçek kimlik/yetki zorunludur. P0-08'in tamamlanması çok cihazlı gerçek üretim yayını onayı değildir.
