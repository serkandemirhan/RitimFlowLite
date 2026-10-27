# P0-07 — Persistent Data Safety

Çalışma tarihi: 27 Ekim 2026. Kapsam yalnız P0-07'dir. P0-06 bütün domain invariant'ları, P0-08 atomik çoklu sekme/çok cihaz işlemleri ve gerçek kimlik doğrulama bu çalışmada tamamlanmış sayılmaz. Push, commit, staging veya gerçek kullanıcı verisini sıfırlama yapılmadı.

## Saklama sözleşmesi

Yeni şema, mevcut state alanlarını koruyan düz JSON nesnesidir:

```json
{"schema":"ritim-flow-lite","schemaVersion":1,"user":"Yönetici","orders":[],"jobs":[],"events":[],"shipments":[]}
```

Şema doğrulaması; kök format/sürüm, tanınan koleksiyonlar, zorunlu alanlar, nesne/dizi/null ayrımı, miktar ve metin tipleri, rota yapısı, iş-sipariş bağlantısı, yeni modüllerin kullandığı iç içe alanlar ve JSON'a kayıpsız yazılabilir değerleri kontrol eder. Geçersiz değerleri sıfırlamaz, alan silmez, sayısal metni sayıya çevirmeye çalışmaz. Domain komutları kendi miktar/kalite/operasyon kurallarını ayrıca doğrular. Bu şema kontrolü P0-06'daki eksiksiz stok/plan/referans mutabakatının yerine geçmez.

| Depodaki durum | Açılış ve yazma davranışı |
|---|---|
| Anahtar yok (`getItem === null`) | Sürüm 1 yeni demo bellekte açılır; kullanıcı işlemi olmadan depoya yazılmaz. |
| Geçerli sürüm 1 | Okunur; yalnız başarılı ortak commit sonrasında güncellenir. |
| Tanınan sürümsüz eski state | Kurtarma/sürüm onayı ekranı; özgün anahtarda yazma kapalı. |
| Bozuk JSON, `null`, hatalı alanlar veya tanınmayan kök | Kurtarma ekranı; hiçbir demo fallback kaydı veya otomatik onarım yok. |
| Desteklenmeyen sürüm/format | Kurtarma ekranı; gelecekteki sürümün verisi üzerine yazılmaz. |
| localStorage getter/getItem erişim hatası | Kurtarma ekranı; yazılabilir boş demo gibi davranılmaz. |
| İşlem sırasında depodaki değer değişmiş | Yeni yazma engellenir; kayıt yeniden açılıp incelenir. Bu kontrol atomik sekme kilidi değildir. |
| Yazma sonucu doğrulanamıyor | `uncertain`; otomatik tekrar kapalı, depodaki kaydı yeniden açma gerekli. |

Bozuk veya erişilemeyen veri için uygulama belleğinde kullanılan boş görünüm nesnesi yalnız kurtarma arayüzünün yüklenmesine yarar; işlem/commit yetkisi vermez ve depoya yazılmaz.

## Kurtarma, dışa aktarma ve geri dönüş

- Ana uygulamanın `ritimLiteAnonymousDemoV1` anahtarı korunur. Geçerli sürümsüz kayıt kendiliğinden değiştirilmez.
- **Özgün Ham Veriyi İndir**: parse etmeksizin açılışta okunan ham değeri dışa aktarır; bozuk JSON da indirilebilir. Depo hiç okunamamışsa var olmayan bir yedek sunmaz, yeniden okuma gerekir.
- **Sürüm 1 Kopyasını Oluşturmayı Onayla**: yalnız tanınmış eski state için açık kullanıcı onayıdır. Sadece şema alanları eklenir; eski kayıtlar ve alanları korunur.
- **Doğrulanan Yedeği Ayrı Kopya Olarak Aç**: dosya önce doğrulanır. Geçersiz/future formatlarda onay düğmesi açılmaz. Sürümsüz yedek için onay metni dönüşümü açıkça bildirir.
- **Mevcut Veriyi Koruyarak Ayrı Yeni Demo Başlat**: eski veriyi resetlemez; bağımsız yeni demo oluşturur.
- Her yeni kopya `ritimLiteAnonymousDemoV1:copy:<UUID>` anahtarına yazılır. Hedef anahtar varsa işlem reddedilir. Yazma ve geri okuma doğrulanmadan yeni sayfaya geçilmez.
- Etkin kopya URL'deki `dataKey` ile seçilir; global bir etkin-anahtar pointer'ı veya eski anahtar üzerinde değişiklik yapılmaz. Kopyanın adresi yer imlerine eklenebilir.
- Geri dönüş: önceki adrese/özgün anahtar adresine dönmek, hiç değiştirilmemiş eski kaydı yeniden açar. Kopyadaki yeni işlemler özgün kayda otomatik birleştirilmez.
- Yeni kopya yazımı belirsiz sonuçlanırsa kalıcı açıklama ve o anahtarı tekrar yazmadan inceleme bağlantısı gösterilir.
- Normal uygulamada Veri Güvenliği düğmesi masaüstü menüsünde ve mobil **Diğer** menüsündedir.

Gerçek kullanıcı verisinde bir dönüşüm/import çalıştırılmadı. İçe aktarma ve migration deneyleri yalnız izole test profillerinde yapıldı.

## Ortak işlem sınırı

`assets/js/persistence.js` DOM'dan bağımsız şema ve saklama katmanıdır. `persistence-ui.js` içindeki `commitState` UI ile tek bağlantıdır:

1. Etkin kayıt yazılabilir olmalı; depodaki ham değer açılan sürümle aynı olmalı.
2. Mevcut state doğrulanır ve klonlanır.
3. Domain komutu yalnız taslağı değiştirir; olay/lot/kalite geçmişi de aynı taslaktadır.
4. Reddedilen/istisna atan veya şemadan geçmeyen taslak atılır.
5. Tek `setItem` ile tam snapshot yazılır; `getItem` ile aynı değer doğrulanır.
6. Ancak bundan sonra uygulamanın `state` değişkeni, render, modal kapanışı, gezinme ve başarı bildirimi güncellenir.

Kota/erişim hatasında canlı state, geçmiş ve eski depodaki kayıt değişmez. Başarısız rol seçiminde görünen dropdown da eski role döner. İşlem formu başarısız yazmadan dolayı kapatılmaz.

Yazma başarılı olmuş fakat yanıt/geri okuma kesilmişse diske körlemesine rollback yazılmaz: bu ikinci yazma da başarısız olabilir veya başka kaydı ezebilir. Canlı state eski kalır, başarı bildirilmez, tekrar işlem engellenir. Kullanıcı **Depodaki Kaydı Yeniden Aç** ile doğrulanmış tam snapshot'ı yükler; kayıt yeniden oynatılmaz. Testte tek sevkiyat geçmişi bir kez görünür.

Sınır: localStorage'ın atomik tek-anahtar API davranışına dayanılır. Fiziksel cihaz/disk dayanıklılığı ve dağıtık transaction garantisi değildir. Ön-okuma karşılaştırması P0-08'i kapatmaz; iki yazarın kontrol ile yazma arasındaki yarışı hâlâ ayrı iştir.

## Kapsanan yazma yolları

| Yol | Uygulama |
|---|---|
| Fiziksel teslim, üretim, hurda/ayar, kontrol, rework, başlat/duraklat/devam, vardiya devri/devralma, kapatma | UX-05 komutları taslağı parametre alır; olaylar taslağa eklenir. Render sırasında boş ux05 defteri üretme kaldırıldı. |
| Tahsis, fason gönderim, final onay, müşteri sevkiyatı | Lojistik komutu ve hareket geçmişi aynı `commitState` işlemi içindedir. |
| Eski `saveShipment`, `setStatus`, `finishJob` | Ortak kontrollü UI komutlarına gider; eski doğrudan state/save mutasyonları kaldırıldı. |
| İlk sipariş/iş emri, ek plan, azaltma, girdi gönderim/kabul | Planlama ortak commit kullanır; sipariş ve ilk iş emri tek işlemde saklanır. |
| Transfer gönderim/kabul/geri alma | Aynı commit katmanı; bağımsız localStorage yazıcısı kaldırıldı. |
| Malzeme, ek kabul izni, fason dönüş/rework, müşteri iadesi/karar/rework/ters kayıt, telafi | Stock servisleri taslakta çalışır; geçmiş kayıtları ile atomik commit. |
| Kalite politikası, rework atama/işleme ve eski rework bağlama | Quality servisleri aynı commit üzerinden çalışır. |
| Çizim revizyonu ve onayı | FileReader sonucu ilgili komuta verilerek commit edilir; başarısız yazmada önceki dosya/revizyon korunur. |
| Operatör atama/devralma, makine bırakma/atama, kullanıcı seçimi | Ortak commit; başarısız durumda eski state ve UI rolü korunur. |
| Eski bağımsız satış HTML'si | Yazma yolları tamamen emekliye ayrıldı; eski kaynak template içinde inert tutulur. Arşiv sayfası `ritimFlowLiteDemo` ham verisini dışa aktarır ve ana uygulamaya bağlanır. Eski format otomatik dönüştürülmez. |

Eski satış sayfasında önceki düzenleme/üretim/çizim kayıtları artık çalışmaz. Bu bilinçli bir veri güvenliği sınırıdır; eski veri silinmez. Farklı eski satış formatı, ana uygulamanın sürümsüz şeması gibi kabul edilmez.

## Testler ve kanıt

Son tam koşu: **180/180 alan ve 79/79 tarayıcı testi başarılı; beş tarayıcı raporunda uygulama hatası yok.**

- Mevcut alan regresyonları: 94.
- Yeni P0-07 alan testleri: 86; toplam **180**.
- Önceki browser suite'leri: P0 16, transfer 9, planlama 9, P1 11; toplam 45.
- Yeni P0-07 browser senaryoları: **34**; toplam browser **79**.
- Son koşuların gerçek durumları: [exits.json](p0-07/evidence/exits.json), [domain-tests.tap](p0-07/evidence/domain-tests.tap), [persistence browser](p0-07/evidence/persistence-browser/browser-results.json).

Negatif testlerde önemli ek koşul: komutun doğrulama aşamasında tesadüfen reddedilmesi yeterli sayılmaz. Yazıcıya gerçekten ulaşması, hata anında canlı belleğin eski değerinde olması, ham depolama ve geçmişin değişmemesi, hata kaldırılınca aynı komutun başarıyla kaydedilip reload'da geri gelmesi doğrulanır.

Kapsam: bozuk JSON, null kök/alanlar, tanınmayan kök/future sürüm, eksik yeni modül alanları, reserved sözlük anahtarları, storage getter/getItem/setItem hataları, QuotaExceededError/SecurityError, sessiz yazmayan adapter, yazdıktan sonra exception, readback kesilmesi, migration/import, ayrı demo, geri dönüş adresi, her kritik modülün yazma hatası ve yeniden yükleme.

Eski fixture'lara sürüm 1 başlığı eklendi; sürümsüz verinin migration davranışı ayrı negatif/pozitif testlerde doğrulanır. Önceki salt okunur eski kayıt testleri hâlâ kayıt dizilerinin değişmediğini sınar. B07 vardiya testine devralma sonrası owner/handover kontrolleri eklendi. B08 artık emekliye ayrılmış satış sayfasında mutatorların bulunmadığını doğrular. Transfer kota mesajı yeni ortak hata mesajıyla güncellendi.

```sh
node --test tests/p0-domain.test.cjs tests/p0-transfer.test.cjs tests/p0-planning.test.cjs tests/p1-domain.test.cjs tests/p0-persistence.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p0-persistence-browser.cjs
```

Önceki dört browser script'i de `P0_EVIDENCE_DIR=docs/p0-07/evidence/<suite>` ile çalıştırılır. İzole browser profilleri kullanılır; gerçek origin verisi okunmaz/sıfırlanmaz. Tarihsel release risk script'i P0-07 bug'larını bekleyen eski karakterizasyon testidir; bu yeni güvenli davranış testlerinin yerine çalıştırılmaz.

## Değişen dosyalar

- Yeni: `assets/js/persistence.js`, `persistence-ui.js`, `legacy-archive.js`, `assets/css/persistence.css`.
- Entegrasyon: `index.html`, `ritim_flow_lite_sales_polished.html`, `assets/js/ux-operator.js`, `ux-logistics.js`, `ux-transfers.js`, `ux-planning.js`, `ux-p1.js`, `ux-stock.js`, `ux-quality-drawings.js`.
- Testler: `tests/p0-persistence.test.cjs`, `p0-persistence-browser.cjs`; `p0-fixtures.cjs`, `p0-browser.cjs`, `p0-transfer-browser.cjs` uyarlamaları.
- Belgeler: bu rapor, release checklist/risk raporu durum notları, `docs/p0-07/evidence/`.

## Açık kalan işler

- P0-06: tüm iş/plan/lot/depo geçmişini kapsayan invariant mutabakatı tamamlanmadı; schema valid, domain'in bütün tarihsel kayıtları doğru demek değildir.
- P0-08: atomik çoklu sekme kilidi, çok cihazlı transaction ve kalıcı idempotency tamamlanmadı. Sadece depoda değişiklik tespitinde güvenli ret eklendi.
- P1-14: gerçek kimlik doğrulama/sunucu yetkisi ayrı iş.
- Gerçek iOS/Android depolama, dosya indirme/içe aktarma ve yaşam döngüsü kabulü henüz yapılmadı; mevcut mobil kontroller masaüstü Chrome viewport'larıdır.
- Yeni kopyalar aynı origin'in kotasını paylaşır; kota doluyken migration/import/fresh copy de reddedilir. Sistem yer açmak için eski anahtarları silmez.
- Test harness hâlâ mevcut geçici Playwright kurulumunu kullanır; tekrarlanabilir dependency/CI paketleme release checklist'inde açıktır.

P0-07'nin tamamlanması tek başına genel release NO-GO kararını kaldırmaz. Diğer backlog maddelerine bu turda geçilmedi.
