# P0-05 — Operasyon seçimi, bölünmüş plan ve girdi rezervasyonu

26 Ekim 2026. Önceki dört denetim belgesi ve P0-01/02/03 ile P0-04 uygulama raporları esas alındı. Eski denetim/test kanıtları değiştirilmedi.

## Sonuç

İş emri oluştururken operasyon, planlanan miktar ve makine seçiliyor. Sipariş miktarı 150 olduğunda ilk operasyon 100+50 olarak iki makineye bölünebiliyor; ek 1 adet plan reddediliyor. Sonraki iç operasyon planı, bir önceki operasyonun **tamamlanmış ve kalite kontrolünden geçmiş sağlam çıktısından** kaynak iş emri/lot bağlantısıyla ayrılıyor.

Planlama fiziksel teslim değildir. Sonraki operasyonda akış:

```text
Önceki operasyon tamamlanmış sağlam çıktı
  → girdi rezervasyonu + miktarlı iş emri
  → operasyon girdisini gönder (yolda)
  → hedefte fiziksel kabul
  → üretim / kontrol / iş emri kapatma
  → son operasyonda final kalite onayı
  → müşteri sevkiyatı
```

Kabul edilmeden üretim açılamaz. Sonraki operasyon yeni hammadde tahsisi veya doğrudan hammadde teslimi alamaz. İlk operasyon çıktısı sonraki operasyon tamamlanmadan müşteri sevkiyatına dönüşmez. Tamamı iç operasyonlardan oluşan zincirler ve sonunda tek fason adımı bulunan iç operasyon zincirleri desteklenir. Fason → iç operasyon dönüş bağlantısı henüz desteklenmez; bu rotalar kapalıdır.

## Önce incelenen veri bağımlılıkları

- `index.html` içindeki eski `createAdditionalJob` daima `op:0` yazıyor, `plannedQty` oluşturmuyordu. İlk sipariş sihirbazının ayrı oluşturma yolu vardı. Her iki giriş artık aynı planlama servisini kullanır.
- UX-05 teslim miktarı UX-06 hammadde tahsisine bağlıydı. Sonraki operasyon girdisini bu sayaçlara eklemek hammaddeyi tekrar sayardı. Yeni girdi hareketleri ayrı tutulur; ortak fiziksel bakiye yalnızca kabul edilmiş miktarı ekler.
- P0-04 aynı operasyonun işlenmemiş giriş lotlarını izliyordu. Bu lot projeksiyonu artık kabul edilmiş operasyon girdilerini de okuyup üretim tüketimini aynı lot defterine bağlar.
- Önceki final sevkiyat modeli sadece ilk iç operasyonu veya ilk iç operasyon + fason rotasını doğruluyordu. Kaynak hesaplaması şimdi operasyon sırası boyunca ilerleyerek her adımın kabul edilmiş girdisini ve önceki tamamlanmış sağlam çıktıyı doğrular. Final onay/sevkiyat servisi korunur; ona verilen kaynaklar son iç operasyondan gelir.
- Plan azaltılırken eski tahsis kaydını silmek yerine `allocationReleases` eklenir. Ortak miktar modeli, UX-05, UX-06, transfer doğrulaması ve UX-07 net tahsisi okur.

## Kurallar ve veri sözleşmesi

- İlk operasyon toplam planı sipariş miktarını aşamaz. Mevcut miktarsız eski iş emirleri önceki sipariş miktarı varsayımıyla kapasiteyi kullanır; otomatik olarak düzeltilmez veya sıfırlanmaz.
- Sonraki operasyon planları hem önceki tamamlanmış sağlam toplamıyla hem de henüz başka iş emrine ayrılmamış kaynak miktarıyla sınırlanır. Bir iş emri birden fazla önceki iş emrinin girdisini alabilir; her kaynak ayrı kayıttır.
- `operationInputs`: hareket kimliği, kaynak/hedef iş emri, operasyon, rota anahtarı, `GOOD:<kaynak>` giriş lotu, miktar, başlangıç miktarı ve işlem geçmişini tutar. Durumlar `reserved → in_transit → accepted`; henüz gönderilmemiş rezervasyon `cancelled` olabilir.
- `GOOD:<iş emri>` doğrulanmış operasyon çıktı havuzudur; tedarikçi parti numarası iddiası değildir. Kabul edilen `OPINPUT:<hareket>` lotu yeni üretimin girişine bağlanır.
- Kabul, gönderim ve iptal tekrarlandığında ikinci stok etkisi oluşmaz. Hareketin tamamı gönderilir/kabul edilir; daha küçük hareketler için ayrı miktarlı iş emirleri/rezervasyonları oluşturulur.
- Plan azaltma yalnızca teslim alınmamış ve yola çıkmamış miktarı kapsar. Gerekçe zorunludur. Başlanmamış ilk operasyon miktarına bağlı kullanılmamış hammadde tahsisi serbest bırakılır; eski tahsis satırı korunur. Sonraki operasyonda henüz gönderilmemiş girdi rezervasyonu bırakılır.
- Kısmi rezervasyon bırakmada başlangıç miktarı ve azaltma geçmişi korunur. Planın tamamı iptal edilirse iş emri silinmez: `plannedQty:0`, `planningState:cancelled` ve kapalı durumla saklanır. Sıfır plan yeniden hammadde tahsisi alamaz.
- Plan geçmişi `planningEvents` içinde kullanıcı, zaman ve gerekçeyle tutulur. Oluşturma/azaltma/gönderme/kabul Yönetici seçimi gerektirir.
- Yeni planlama komutları bir durum kopyasında doğrulanır, localStorage başarıyla yazıldıktan sonra canlı duruma uygulanır. Başarısız doğrulama/kota hatası yarım iş emri veya rezervasyon bırakmaz.
- Rota, kaynak tamamlanma durumu ve miktarı işlem anında yeniden doğrulanır. Eski fason/sevkiyatla çelişen rota değişikliği, gönderilmiş çıktıyı yeni girdiye ayıramaz.
- P0-04 fiziksel transferi hedefte ayrılmış operasyon rezervasyonunun kapasitesini kullanamaz. Aynı parçanın hammadde ve operasyon girdisi olarak çift kullanımı engellenir.

250/150/100 örneğinde 50 başlanmamış plan azaltıldığında kaynak planı 100, fiziksel işlenmemiş miktar 25 olarak kalır. Kullanılmamış 50 hammadde tahsisi serbestleşir. Bu, fiziksel 25 parçanın aktarılmasından ayrı bir işlemdir.

## Değişen dosyalar

| Dosya | Bu çalışmadaki değişiklik |
|---|---|
| `assets/js/operation-ledger.js` | Yeni saf operasyon rezervasyonu, net tahsis ve sıralı üretim kaynağı doğrulaması. |
| `assets/js/planning-service.js` | Yeni miktarlı iş emri oluşturma, kapasite, plan azaltma ve girdi hareket komutları. |
| `assets/js/ux-planning.js` | Yeni planlama ekranı, geçmiş, rezervasyon gönderim/kabulü; eski ek iş emri ve ilk sipariş girişlerini ortak servise bağlar. |
| `assets/js/quantity-model.js` | Son iç operasyonun kaynağını kullanır; çok adımlı iç rotaları doğrular; sıfır planı korur; net tahsis ve operasyon çıktı konumlarını okur. |
| `assets/js/transfer-ledger.js` | Kabul edilmiş operasyon girdisini fiziksel bakiyeye ve lotlara dahil eder; net tahsis kontrolü. |
| `assets/js/transfer-service.js` | Operasyon giriş lotunun üretim tüketimini kaydeder; hedef rezervasyon kapasitesini korur. |
| `assets/js/ux-operator.js` | Sonraki operasyona doğrudan hammadde teslimini engeller; ilk operasyonda net tahsisi kullanır. |
| `assets/js/ux-logistics.js` | Sonraki operasyona hammadde tahsisini ve sıfır planın yeniden tahsisini engeller. |
| `assets/js/ux-audit.js` | Net tahsis ve yeni operasyon bağlantı sorunlarını mutabakata dahil eder. Genel P0-06 çalışması değildir. |
| `index.html` | Yeni modülleri bağımlılık sırasıyla yükler. |
| `tests/p0-planning.test.cjs` | Yeni planlama ve operasyon girdisi domain regresyonları. |
| `tests/p0-planning-browser.cjs` | Yeni masaüstü/mobil planlama, fiziksel kabul, üretim/sevkiyat, iptal ve depolama testleri. |
| `tests/p0-transfer-browser.cjs` | Önceki kanıtları koruyarak ayrı çıktı dizinine yazma seçeneği. |

## Testler

```bash
node --test tests/p0-domain.test.cjs tests/p0-transfer.test.cjs tests/p0-planning.test.cjs
NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p0-planning-browser.cjs
P0_EVIDENCE_DIR=docs/p0-05/evidence/prior-p0 \
  NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p0-browser.cjs
P0_EVIDENCE_DIR=docs/p0-05/evidence/prior-transfer \
  NODE_PATH=/tmp/ritim-ux-audit/node_modules node tests/p0-transfer-browser.cjs
```

- **79/79 domain testi:** önceki 56 + yeni 23. Miktar sınırları, makine/kimlik çakışması, 100+50 bölme, onaysız girdinin reddi, kaynak birleştirme, rezervasyon bırakma, 25/50 ayrımı, üç operasyon zinciri, son fason adımı, bozuk/yenilenen kaynak kanıtı ve çift kullanım kontrolleri.
- **9/9 yeni tarayıcı senaryosu:** 1440/390/360 ekranlarda bölünmüş plan ve yeniden yükleme; rezervasyon → gönderim → kabul → üretim → kontrol → kapatma → final onay → sevkiyat; plan azaltma; iptal; kota hatası; eski veriyi okumayla değiştirmeme; sipariş sihirbazı; iptal edilen sıfır planın eski lojistik yolundan yeniden tahsis edilememesi.
- **16/16 önceki P0 tarayıcı senaryosu ve 9/9 P0-04 transfer senaryosu:** geçti. UX-05 denklemi ve UX-06 kısmi hareket/final onay kontrolleri korundu.
- Tarayıcı çalışmalarında uygulama hatası **0**. Yeni ekranlarda 1440/390/360 yatay taşma kontrol edildi; 360px plan ekranı görsel olarak incelendi.
- Değişen JavaScript ve index içindeki scriptlerin sözdizimi ile `git diff --check` doğrulandı.

Kanıtlar: [domain TAP](p0-05/evidence/domain-tests.tap), [yeni tarayıcı sonuçları](p0-05/evidence/browser-results.json), [önceki P0](p0-05/evidence/prior-p0/browser-results.json), [önceki transfer](p0-05/evidence/prior-transfer/browser-results.json), [360px bölünmüş plan](p0-05/evidence/split-360.png), [sonraki operasyon mutabakatı](p0-05/evidence/downstream-audit.png).

Uygulama içi tarayıcı bağlantısı denendi ve kullanılabilir tarayıcı bulunamadı. Testler yerel Chrome, localhost sunucusu ve yalıtılmış geçici profillerle çalıştı. Kullanıcının gerçek localStorage profili veya canlı site değiştirilmedi.

## Kalan sınırlar ve riskler

- Fason sonrası iç operasyona dönüş, çoklu fason zinciri, tedarikçi kayıp/hurda/rework mutabakatı henüz yok; bu rotalar kapalı tutulur. Terminal fason adımı UX-06 gönderim/dönüş ekranında yürür; fason için iç üretim iş emri oluşturulmaz.
- Sonraki operasyon rezervasyonu için kaynak iş emrinin kapanması gerekir. Çalışan iş emrinin kısmi sağlam çıktısını iç operasyona aktarma/koşullu lot serbest bırakma politikası açılmadı. UX-06'nın çalışan ilk operasyondan kısmi fason gönderimi korunur.
- Yola çıkmış veya kabul edilmiş operasyon girdisi plan iptaliyle geri alınamaz. Bu girdilerin ters fiziksel hareketi ve yeniden planlanması ayrı akış gerektirir; geçmiş silinmez. Mevcut P0-04 aynı operasyon fiziksel geri alma akışı korunur.
- Tamamlanmış kaynağın yeniden açılması veya üretim miktarının geriye dönük değiştirilmesi, ona bağlı girdilerin kanıtını geçersiz kılar. Otomatik düzeltme yapılmaz.
- Eski aşırı/miktarsız planlar ve çelişkili hareketler sessizce dönüştürülmez. Eski veriler nedeniyle yeni plan kapasitesi sıfır veya işlem kapalı olabilir; mutabakat ayrıca ele alınmalıdır.
- Kaynak lokasyonu iş emri düzeyindedir; depo/raf ve gerçek tedarikçi parti takibi değildir. Operatör atama, vardiya sahipliği ve atanmamış iş emrinin üretim ekranına yönlendirilmesiyle ilgili diğer P1 bulguları değiştirilmedi.
- Yeni plan komutları tek sekmede kayıt hatasında kısmi mutasyon bırakmaz. Genel bozuk veri kurtarma, eski üretim/lojistik kayıtlarının hata davranışı ve çok sekmeli atomiklik P0-07/08 kapsamındadır. Yönetici seçimi gerçek kimlik doğrulama değildir.
- Commit, GitHub push veya deploy yapılmadı; kullanıcının staging alanına müdahale edilmedi.
