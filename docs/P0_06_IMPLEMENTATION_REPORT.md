# P0-06 — Veri bütünlüğü ve salt okunur mutabakat

Tarih: 27 Ekim 2026. Kapsam P0-06'dır. P0/P1 iş akışları yeniden kurulmadı; P0-07 sürümlü kurtarma ve yazma sınırı korundu. P0-08 uygulanmadı. Gerçek demo verisi okunmadı, dönüştürülmedi veya sıfırlanmadı; staging, commit, push ve deploy yapılmadı.

## Veri bağımlılıkları ve sözleşme

Yeni `assets/js/integrity.js`, tarayıcıda `RitimIntegrity`, Node'da CommonJS modülüdür. `validate(snapshot)` yalnız girdiyi okur ve şu sonucu döndürür:

```js
{
  valid,                         // kritik bulgu yoksa true; uyarıları gizlemez
  findings: [{ code, severity, path, refs, explanation, remediation }],
  critical, warnings,
  balances: { jobs, orders }
}
```

Motor P0-07 şema doğrulamasını, quantity-model, transfer-ledger, operation-ledger ve stock-ledger okuma modellerini kullanır. Servis komutlarını çağırmaz. Ham değerleri ayrıca denetler; ekrandaki sıfıra kırpılmış bakiye tek başına doğruluk kanıtı sayılmaz. Şema veya zorunlu domain alanı bozuksa kritik bulguyla durur; okunamayan grafikten eksiksiz mutabakat sonucu üretmez. Kayıtlar, boş defterler veya eksik alanlar oluşturulmaz. Sistem saati okuması, rastgele kimlik üretimi veya localStorage erişimi yoktur.

Sipariş kapsamına ayrılmış kaynak projeksiyonları bağımsız bir siparişin bozuk defterinin diğer siparişin audit stok hesabını zehirlemesini önler. Kimlikler kendi domain kapsamlarında denetlenir: örneğin final kalite kimliği sipariş içinde, transfer kimliği transfer defterinde tektir. Aynı miktarlı birden çok tahsis otomatik tekilleştirilmez; tamamı toplama girer.

## Doğrulanan alanlar

| Alan | Kontroller |
|---|---|
| Sipariş / rota / iş emri | Kimlik tekilliği, sipariş bağlantısı, geçerli iç operasyon, kayıtlı plan rotası, pozitif sipariş adedi, operasyon kapasitesi ve telafi limiti |
| Plan / atama | İş başına teslim ve tahsis ≤ plan; teslim + yoldaki + ayrılmış girdi ≤ plan; net tahsis ≥ 0; operatör, yerel makine kimliği ve açık iş/makine çakışması |
| Malzeme | Kabul − net tahsis; ek kabul/telafi limiti; adet/kg/m/çubuk dönüşümünün tam üretim adedine eşitliği; belge tekrarı |
| Üretim / ayar | Sağlam + hurda + ayar + kontrol bekleyen + rework + fiziksel transfer çıkışı ≤ teslim; eski başlangıç ayrı; yeni teslim/tahsis ilişkisi |
| Teslim geçmişi | Kullanıcı/zaman bilgili yeni teslim toplamı fiziksel yeni teslimi aşamaz. Tam yeni geçmiş teslim sayacıyla eşleşir. Eski kimliksiz toplu geçmiş farkı ayrı uyarıdır. |
| Fiziksel transfer | Kaynak/hedef/sipariş/aynı operasyon, rota, giriş/çıkış lotu, tek kabul, hareket durum sırası, negatif lot ve fazla tüketim |
| Operasyon girdisi | Bitişik operasyon, önceki tamamlanmış sağlam kaynak, GOOD/OPINPUT bağlantıları, rezervasyon/gönderim/kabul, ilk miktar ve gerekçeli serbest bırakma mutabakatı |
| Kontrol / rework | İş/operasyon/lot kökeni, sonuç toplamı, kontrol miktarı ≤ üretim sonucu, kaynak kontrol ile rework toplamı, işlem ve tekrar kontrol ile kalan miktar mutabakatı |
| Fason | Gönderim üretim kaynakları, belge tekrarı, dönüş bağlantısı, sağlam + hurda + rework kalan + kayıp ≤ gönderim; rework sağlam/hurda sonuç kayıtları ve kaynak kanıtı |
| Final kalite | Yönetici, sürüm/rota/terminal operasyon, kaynak toplamı, tamamlanmış uygun kaynak kapasitesi; iade restock için aktif dosya/karar kanıtı |
| Müşteri sevkiyatı | Final onay referansı ve tüketim limiti, belge tekilliği, net sevk sınırı; kayıtlı zamanlar varsa kaynak-sonuç sırası |
| İade / karantina | Kaynak sevkiyat, sevkiyat başına aktif iade sınırı, karar toplamı, ters kayıt kullanımı, rework işi/sonucu ve yeniden stok bağlantıları |
| Telafi | İlk operasyon, yönetici/gerekçe, mevcut belgeli hurda/kayıp kaynağı, kaynağın önceki telafiler sonrası kalan limiti; sipariş talebi değişmez |
| Çizim | Revizyon kimliği/adı, sipariş bağlantısı, son sürüm ile aktif çizim eşitliği, korunmuş ilk tarihsel sürüm, yeni sürüm onayı/formatı, iş emri onay referansı |
| Diğer defterler | Olaylar, plan olayları, tahsis serbest bırakma, kalite politikası, ek malzeme izinleri ve eski sevkiyatların mevcut sipariş/iş bağlantıları |
| Sayılar | Adet alanlarında negatif olmayan güvenli tam sayı; pozitif hareket miktarı; ayrı birim/dönüşüm kontrolü; NaN, sonsuz, kesir ve toplam taşması görünür hata |

Örnek: 250 sipariş / 150 plan / 100 teslim; 60 sağlam + 3 hurda + 12 kontrol bekleyen + 25 işlenmemiş denklemi korunur. **25 fiziksel kalan** ile **50 başlamamış plan** farklı alanlardır. Transfer ve operasyon çıkışları tarihsel sağlam üretimi azaltmaz; mevcut konum bakiyesini azaltır. Final uygunluğu olmayan bir siparişte “kayıtlı onay − sevk” farkı sevk izni olarak sunulmaz.

## Desteklenen tarihsel istisnalar

| Kayıt | Davranış |
|---|---|
| `ux05` öncesi toplu üretim; kayıtlı legacyBaseline/legacyGood | Tarihsel üretim uyarısı; yeni fiziksel lot veya sevke hazır stok uydurulmaz. Yeni komut tarihsel başlangıcı değiştiremez. |
| Açık plannedQty/planningVersion olmayan eski iş planı | Eski örtük plan kapasite farkı uyarıdır; modern açık plan aşımı kritiktir. |
| Yalnız tarihsel başlangıcı olan eski sonraki operasyon | Eksik geçmiş aktarım kanıtı uyarısı; yeni kullanılabilir operasyon girdisi sayılmaz. |
| Eski birimsiz adet kabulü, kullanıcı/zaman bilgisi olmayan toplu teslim ayrıntıları | Eksik birim veya geçmiş mutabakatı uyarısı; yeni ayrıntılı satırların fiziksel teslimi aşması kritiktir. Karma geçmişe yeni satır eklemek eski eksikliği sessizce onarmaz. |
| Yönetici gerekçesiyle açıkça bağlanmış legacy rework | Mevcut servisin kesin eski-kontrol/lot işaretleri tanınır; bilinmeyen bilgi uyarı olarak kalır. Yalnız `legacy:true` eklemek bozuk referansı geçerli yapmaz. |
| Kimliksiz eski müşteri iadesi | Tarihsel karantina uyarısı; otomatik yeni iade dosyası oluşturulmaz. Kaynak sevkiyat gerçekten yoksa kritik hatadır. |
| Üst düzey eski `shipments` | Tarihsel sevkiyat ayrı gösterilir; net müşteri sevkiyatına eklenmez. Yeni commit bu arşivi değiştiremez. |

Hiçbir tarihsel istisna olmayan iş emrine tahsisi, gerçek eksik referansı, negatif miktarı veya yeni onaysız sevkiyatı geçerli kılmaz. Desteklenmeyen ara fason rotası okunabilir uyarıdır; o siparişte yeni iş hareketi engellenir.

## P0-07 kayıt sınırı

`persistence.open` isteğe bağlı saf `validateTransaction(before, draft)` kabul eder. Ana uygulama bunu `RitimIntegrity.guard` olarak bağlar. Mevcut sıra korunur:

1. Saklama durumu / eski snapshot ve giriş şeması kontrolü.
2. Komutun yalnız taslak üzerinde çalışması.
3. Taslak şeması, ardından P0-06 işlem bütünlüğü kontrolü.
4. Tek anahtara yazma ve geri okuyarak doğrulama.
5. Yalnız başarıda bellek/UI güncellemesi.

Guard, değişen siparişin tamamını ve ona bağlı iş/lot/hareketleri karşılaştırır. Önceden kritik hatası bulunan etkilenen siparişte yeni işlem kapalıdır; yeni kritik bulgu oluşturan taslak da reddedilir. Kimliksiz/orphan değişiklikler kapsam hesabından kaçamaz. Bağımsız sağlam sipariş ve yalnız rol seçimi kullanılabilir. Genel commit üzerinden hatalı sayacı “düzeltme” veya geçmişi silme yolu açılmadı.

Domain servisleri taslak üreten mevcut modüller olarak kaldı; kalıcı uygulama işlemleri ortak commit sınırından geçer. Bu bir kimlik doğrulama/güvenlik sınırı değildir.

Şeması bozuk veri P0-07 kurtarma ekranında kalır. Şeması geçerli ama domain ilişkileri bozuk veri UX-07'de okunabilir; ham dışa aktarma ve ayrı kopya kurtarma erişimi korunur. Yedek içe aktarmanın şema onayı domain'in kusursuz olduğu anlamına gelmez; açılan kopya da aynı audit ve commit kontrollerine tabidir. Özgün anahtar değiştirilmez.

## UX-07

Kritik ihlaller ve uyarılar ayrı sayılır. Her bulgu kod, kayıt yolu, ilgili sipariş/iş/lot/belge, açıklama ve konuya uygun öneri taşır. Mevcut kayda sipariş/iş emri, hedef iş veya sipariş hareketleri üzerinden gidilir; olmayan kimliğe sahte bağlantı üretilmez. Ayrı sipariş ve üretim/konum/plan tabloları yatay olarak kendi içinde kayar.

Eski testlerin tüm tablolardaki son hücreyi net sevk sayması yeni görünüm için geçersizdi; test belirli siparişin `net` hücresine bağlandı. Transfer/planlama testleri kritik bulgu olmadığını sınar; meşru tarihsel uyarıların yokluğunu artık şart koşmaz. Yeni testler bu uyarıları ayrıca doğrular.

## Kesinti sonrası son doğrulama

27 Ekim 2026'da güncel çalışma ağacı yeniden incelendi; önceki loglar başarı kanıtı olarak kullanılmadı. Alan ve altı tarayıcı paketi yeniden çalıştırıldı. **P0-06 mevcut yerel domain kapsamı için tamamlandı.** Sonuçlar: 264/264 alan, 90/90 tarayıcı; sıfır fail/skip ve sıfır beklenmeyen uygulama hatası.

Son makine kontrolü mevcut CNC-01/02/03 kataloğuyla karşılaştırıldı. Ek alan ve tarayıcı testleri geçerli/atanmamış makineyi, bilinmeyen makinenin commit öncesi reddini, sıfır yazıcı çağrısını, değişmeyen bellek/ham kaydı, reload sonucunu ve bozuk makine referanslı kayıtta audit/ham dışa aktarma erişimini doğrular. Bu devam turunda uygulama kodu değişmedi; iki test dosyasına birer senaryo eklendi.

| Tarayıcı paketi | Sonuç | Güncel kanıt |
|---|---:|---|
| P0 temel | 16/16 | [browser-results.json](p0-06/evidence/final-20261027T123459Z-fdf694/prior-p0/browser-results.json) |
| Transfer | 9/9 | [browser-results.json](p0-06/evidence/final-20261027T123459Z-fdf694/prior-transfer/browser-results.json) |
| Planlama | 9/9 | [browser-results.json](p0-06/evidence/final-20261027T123459Z-fdf694/prior-planning/browser-results.json) |
| P1 | 11/11 | [browser-results.json](p0-06/evidence/final-20261027T123459Z-fdf694/prior-p1/browser-results.json) |
| P0-07 persistence | 34/34 | [browser-results.json](p0-06/evidence/final-20261027T123459Z-fdf694/prior-persistence/browser-results.json) |
| P0-06 integrity | 11/11 | [browser-results.json](p0-06/evidence/final-20261027T123459Z-fdf694/integrity-browser/browser-results.json) |

Yeni koşu klasörü: `docs/p0-06/evidence/final-20261027T123459Z-fdf694`. Önceki kanıtlar korunmuştur. İzole profillerde veri koruma, başarısız yazma, belirsiz sonuç ve reload kontrolleri tekrar geçti; gerçek demo origin'i kullanılmadı. [Başlangıç hash envanteri](p0-06/evidence/final-20261027T123459Z-fdf694/before.json) ve [son doğrulama](p0-06/evidence/final-20261027T123459Z-fdf694/verification.json), ilk P0-06 staged özetiyle ve devam turu başlangıcıyla eşleşmeyi gösterir.

## Testler ve kanıt

- Alan: **264/264** (önceki 180 + yeni 84), sıfır fail/skip: [domain-tests.tap](p0-06/evidence/final-20261027T123459Z-fdf694/domain-tests.tap).
- Yeni audit tarayıcı senaryoları: **11/11**; 1440/390/360, tıklanabilir bağlam, belge taşması, salt okunur denetim, kritik kayıt engeli, bağımsız sipariş, recovery, legacy uyarıları ve bilinmeyen makinenin kalıcı kayıt öncesi engellenmesi.
- Önceki tarayıcı paketleri: P0 16, transfer 9, planlama 9, P1 11, persistence 34; toplam 79.
- Son tarayıcı durumları: [exits.json](p0-06/evidence/final-20261027T123459Z-fdf694/exits.json), [yeni audit sonucu](p0-06/evidence/final-20261027T123459Z-fdf694/integrity-browser/browser-results.json). **Toplam 90/90 tarayıcı senaryosu başarılı; altı pakette sıfır beklenmeyen uygulama hatası.**
- [Kaynak/index koruma ve toplu doğrulama](p0-06/evidence/final-20261027T123459Z-fdf694/verification.json).

Derin dondurulmuş snapshot, önce/sonra SHA-256 eşitliği, localStorage getter'ını hata verecek şekilde kapatma ve tarayıcıda yazma sayacıyla sıfır audit yazımı sınandı. Kalıcı commit reddinde bellek, ham kayıt, yazıcı çağrısı ve başarı callback'i kontrol edildi. Gerçek kullanıcı origin'i kullanılmadı; testler geçici loopback sunucusu ve temiz Chrome profillerindedir. Uygulama içi browser bağlantısı bulunamadığı için mevcut Playwright/Chrome harness kullanıldı.

İlk koşularda yeni audit tablo/uyarı sözleşmesine bağlı üç P0 ve transfer/planlama beklentisi güncellendi. P0-07 fiziksel teslim kota testi, karma eski/yeni teslim geçmişinin gereksiz engellenmesini yakaladı; tarihsel ayrıntı ile yeni kayıt sınırı ayrıldı ve özel regresyon eklendi. Nihai kanıt klasörleri son koşuları temsil eder; `receipt-recheck` yalnız bu düzeltmenin odak kontrolüdür.

```sh
node --test tests/p0-domain.test.cjs tests/p0-transfer.test.cjs tests/p0-planning.test.cjs tests/p1-domain.test.cjs tests/p0-persistence.test.cjs tests/p0-integrity.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p0-06/evidence/final-20261027T123459Z-fdf694/integrity-browser node tests/p0-integrity-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p0-06/evidence/final-20261027T123459Z-fdf694/prior-p0 node tests/p0-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p0-06/evidence/final-20261027T123459Z-fdf694/prior-transfer node tests/p0-transfer-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p0-06/evidence/final-20261027T123459Z-fdf694/prior-planning node tests/p0-planning-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p0-06/evidence/final-20261027T123459Z-fdf694/prior-p1 node tests/p1-browser.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules P0_EVIDENCE_DIR=docs/p0-06/evidence/final-20261027T123459Z-fdf694/prior-persistence node tests/p0-persistence-browser.cjs
```

Önceki beş browser script'i `P0_EVIDENCE_DIR=docs/p0-06/evidence/<suite>` ile yeniden çalıştırıldı. Tarihsel `docs/release/risk-probe.cjs` eski hatayı bekler; yeni güvenli davranış regresyonunun yerine kullanılmaz.

## Değişen dosyalar

- Yeni motor: `assets/js/integrity.js`.
- Entegrasyon: `assets/js/persistence.js`, `index.html`.
- UX-07: `assets/js/ux-audit.js`, `assets/css/ux-audit.css`.
- Yeni testler: `tests/p0-integrity.test.cjs`, `tests/p0-integrity-browser.cjs`.
- Mevcut test uyarlamaları: `tests/p0-browser.cjs`, `tests/p0-transfer-browser.cjs`, `tests/p0-planning-browser.cjs`.
- Belgeler: bu rapor, `docs/RELEASE_CHECKLIST.md`, `docs/RELEASE_RISK_REPORT.md`, `docs/p0-06/evidence/`.

Başlangıçta staged/unstaged/untracked P0/P1/P0-07 çalışmaları vardı. Toplam git diff bu işin kapsamı değildir; bu tur öncesi hash envanteri ve index özeti kanıt klasöründedir.

## Sınırlar ve kalan riskler

- Bu motor mevcut desteklenen yerel domain sözleşmesinin snapshot mutabakatıdır. Tarihsel olarak kaydedilmemiş tedarikçi lotu, kontrol olayı veya fiziksel parça kimliği yeniden üretilemez. Eski olay listeleri tam bir event-sourcing defteri değildir; tüm üretim sayacı olay listesinden tekrar oluşturulmuş gibi sunulmaz.
- Kaydedilmiş tarih çiftlerinde ters zaman ilişkisi denetlenir; yalnız mevcut snapshot'tan geçmişteki tüm operasyon kapanış zamanları kanıtlanamaz.
- P0-08 hâlâ açık: ön-okuma karşılaştırması atomik sekme kilidi değildir; iki sekme yarışının ve çok cihaz işlemlerinin çözümü bu işte yapılmadı.
- P1-14 gerçek kimlik/sunucu yetkisi, gerçek iOS/Android kabulü ve tekrarlanabilir test bağımlılığı/CI/candidate incelemesi açık.
- Operatör ve makine doğrulaması mevcut yerel demo katalogları içindir; merkezi kullanıcı/makine sicili yoktur. Makine kataloğu genişletilirse saf doğrulama sözleşmesi de birlikte güncellenmelidir.
- İç operasyon → fason → iç operasyon desteklenmez. Domain/lot modeli genişletilmeden backend eklemek bu sınırı çözmez.
- Genel otomatik onarım veya hatalı kaydı yerinde düzenleme aracı eklenmedi. Ham dışa aktarma ve açık ayrı kopya kurtarma korunur; belge mutabakatı ayrı kontrollü iş gerektirir.

P0-06'nın tamamlanması genel release için NO-GO kararını kaldırmaz. Sonraki geliştirme P0-08 olabilir; bu turda başlanmadı.
