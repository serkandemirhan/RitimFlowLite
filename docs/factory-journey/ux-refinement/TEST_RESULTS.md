# Test durumu

Başlangıçtaki koordinasyon incelemesinde uygulama kodu değiştirilmediği için yeni regresyon çalıştırılmamıştı; checkpoint sonrası sonuçlar aşağıdadır. Önceki çalışmanın 292 alan, 110 kaynak ve 110 paket tarayıcı sonucu kendi [raporunda](../UX_FIX_CONTINUATION.md) tarihsel kanıttır; yeni UX kabulü değildir. Uygulama sonrasında tam CI ve istenen gerçek Keycloak, üretim, depo, rework, fason ve iade senaryoları tekrar çalıştırılmalıdır.

## Sonraki çalışma — kaynak ekranları

Gerçek Keycloak/Fastify/PostgreSQL ile `tests/factory-refinement-browser.cjs` 1/1; 11 ekranda 77 responsive görüntü, 0 sayfa taşması ve ölçülen mobil butonlarda 44 px altı yok. Depoda görev değişimi sırasında form değerleri korundu. [Çıktı](warehouse-browser.tap). Teknik çizim politikasına ilişkin ilk gerçek tarayıcı denemesi eski teknik hata metni beklentisi nedeniyle başarısız oldu; [kanıt](drawing-first-attempt.tap). Tekrar koşusu ve tam CI ayrıca raporlanmalıdır.

- Teknik çizim politikası: gerçek Keycloak, Fastify ve PostgreSQL ile yeniden koşu 1/1 geçti; PDF isteği başarısızken onay devre dışı, yeni revizyonda eski görüntüleme geçersiz, açma sonrası açık onayla üretim ve iki operasyon senaryosu çalıştı. [Kayıt](drawing-retry.tap). Bu istemci kontrolü, insanın çizimi gerçekten okuduğunu veya mobil PDF görüntüleyicisinin içeriği eksiksiz gösterdiğini kanıtlamaz.
- Görünüm hesapları ve çizim durumu için odaklı testler: 6/6.
- Depo mal kabul → 30 taşı → 20 iş emrine tahsis → üretim ve fazla hurda reddi: gerçek Keycloak/PostgreSQL testinin uyarlanmış sürümü 1/1 geçti. İlk deneme, beklenen teknik hata kodu yerine güncel kullanıcı mesajı alındığı için hata verdi; [ilk deneme](inventory-first-attempt.tap), [tekrar](inventory-retry.tap). Başka modüllerin tüm testleri bu çalışma için henüz tamamlanmadı.
- Son çizim yükleme korumasıyla gerçek Keycloak akışı tekrar 1/1 geçti: [son koşu](drawing-final.tap). Her revizyon ve iframe için ayrı görüntüleme denetlenir.
- Depo görev seçimine uyarlanmış tam kurgusal fabrika yolculuğu gerçek OIDC ile 1/1 geçti: malzeme, üretim, fason, sevkiyat, iade ve rework soyağacı [kayıt](factory-journey-final.tap). Bu sonuç bütün cihaz ve hata senaryolarının tamamlandığını göstermez.
- Son kaynakta 77 ekran taraması tekrar 1/1, yatay taşma 0 ve ölçülen mobil düğmelerde 44 px altı 0: [son tarama](warehouse-final.tap).
- Son paketlenmiş uygulamayla kurgusal fabrika yolculuğu 1/1 geçti: [paket kanıtı](factory-journey-packaged.tap). Paket kaynak özeti `4c348d3faf704431b2d46ba5b2f267af5d9cdaaae8a486ada606ffa2e1ba8095`.
- Son kaynakta gerçek çizim/operatör koşusu ilk denemede kalite penceresinin kapanmamasıyla başarısız oldu: [kayıt](drawing-final-code-first.tap). Tekrarı 1/1 geçti: [kayıt](drawing-final-code-retry.tap). Testte paralel üretim çıktısını ilk sıradan seçmek yerine ilgili olay kimliğiyle seçen düzeltme yapıldı; bu test değişikliği ayrıca tekrar koşulmalıdır.
- Kalite testinde olay kimliğine göre seçim düzeltmesi yapıldıktan sonra gerçek çizim/operatör senaryosu yeniden 1/1 geçti: [kayıt](drawing-deterministic.tap). İlk kalite hatasının kök nedeni kesin kanıtlanmış değildir; olay sırası bağımlılığı testten kaldırılmıştır.
- Son kaynak ve son paket üzerinde tam kurgusal fabrika yolculuğu ayrı ayrı 1/1 geçti. Paket kanıtı `factory-journey-packaged.tap`; kaynakta adımların açılmasıyla koşulan senaryo `factory-journey-guided.tap`. Çizim, operatör ve rol senaryosu son kaynakta 1/1 geçti (`drawing-deterministic.tap`).
- Son ekran taraması: `guided-screens.tap`, 11 ekran / 77 genişlik görüntüsü; 0 belge taşması, ölçülen mobil düğmelerde 44 px altı 0. Bunlar gerçek mobil cihaz testi değildir.
- Odaklı gösterim ve çizim durum testleri: 7/7.
- Son uygulama kaynaklarıyla `npm run test:ci` başarılı: 292/292 alan, 12/12 kurtarma, 12/12 paketleme; kaynak 110/110 ve paket 110/110 tarayıcı, her modda 32/32 izolasyon/Sprint 0/1 kontrolü. [Tam günlük](final-ci.log). Son kaynak ve paket Sprint 2 responsive 7/7 ve durum 4/4 ayrı ayrı geçti.

## Modül regresyonları ve operatör listesi düzeltmesi

Fason ve müşteri iadesi ayrı gerçek OIDC testleri geçti. Rework ilk denemesinde operatör ekranına dönüşte atanmış işlerin kapalı kalması gözlendi: [ilk koşu](module-first-attempt.tap). Navigasyonda ve atama yenilemede listeyi açan düzeltmeden sonra test, eski hata kodu beklentisinde durdu; aynı çalışmada sevkiyat testi geçti: [ikinci koşu](rework-shipping-first-retry.tap). Güncel hata mesajı beklentisiyle rework tekrar 1/1 geçti: [son koşu](rework-final.tap). Başarısız testler korunmuştur.
- Operatör listesi düzeltmesi sonrası son kaynakta tam fabrika yolculuğu ve 77 ekran taraması 2/2 geçti: [kanıt](final-source-journey-screen.tap). Aynı son sürümün paketlenmiş fabrika yolculuğu 1/1 geçti: [kanıt](factory-journey-current-packaged.tap).
- Operatör listesi düzeltmesinden sonra çizim/Keycloak/üretim rol akışı tekrar 1/1 geçti: [son kayıt](drawing-after-operator-fix.tap).
- Operatör listesi düzeltmesinden sonra `npm run test:ci` tekrar geçti: 292/292 alan, 12/12 kurtarma, 12/12 paketleme, kaynak 110/110 ve paket 110/110 tarayıcı, her modda 32/32 ek izolasyon/Sprint 0/1. [Tam günlük](final-ci-after-operator-fix.log). Paket özeti `8e67fb29e23be06ec649008098c9bc5eda1e6deafba9d26403e287ae60403d5e`.
- Mevcut depo, rework, fason, sevkiyat ve iade regresyonları yeni görev panellerini açacak şekilde güncellendi; gerçek Keycloak/PostgreSQL ile özgün test dosyalarında 5/5 geçti: [kayıt](original-modules-final.tap).
- Son operatör/kalite özgün Fastify/PostgreSQL testi 1/1 geçti: [kayıt](operator-quality-final.tap). Çizim revizyonunu açmadan onaylama beklentisi yeni kullanıcı kararıyla güncellendi.
- Son kaynak ve paket Sprint 2 responsive 7/7 ve durum eylemleri 4/4 geçti.
