# Fabrika yolculuğu — UX düzeltmeleri

Mevcut kaynak üzerinde sipariş ayrıntısı tarayıcı geçmişine eklenir; geri işlemi listeye döner. OIDC doğrulaması değiştirilmedi. Gerçek Keycloak oturumuyla `tests/factory-back-navigation.cjs` 1/1 geçti.

Transfer ekranı aynı sunucu yanıtındaki rezervasyon ve sevk kayıtlarını birlikte gösterir. Sevk edilmemiş miktar sıfır veya tutarsızsa sevk ve bırakma kapatılır; sunucunun işlem kontrolleri geçerliliğini korur. `tests/factory-ux-fixes.test.cjs` üç gösterim senaryosunda geçti. Bu test, gerçek eşzamanlı transfer kabulünün yerine geçmez.

PDF önizlemesine genişliğe sığdırma ipucu ve indirme seçeneği, yükleme hatasına yeniden deneme açıklaması eklendi. PDF görüntüleyici davranışı tarayıcıya bağlıdır; 320 px gerçek cihaz kabulü henüz yapılmadı. Açık çizim onayına ilişkin iş kuralı değiştirilmedi. Depo hareket geçmişi katlanabilir yapıldı; mobil gezinme ve başlık düğmelerinde asgari yükseklik tanımlandı. Bazı bilinen hata ve iade durumu metinleri Türkçeleştirildi; tüm teknik kimlikler ve durumlar dönüştürülmedi.

## Devam doğrulaması

- Gerçek Keycloak/Fastify/PostgreSQL ile iki operasyonlu tarayıcı senaryosu: 1/1. Sekiz sevk, beş kabul ve üç yolda iken yeniden sevk ve rezervasyon bırakma düğmelerinin kapalı olduğu doğrulandı; üretim ve kalite akışı da geçti. Komut çıktısı `/tmp/ritim-transfer-ux.log` içinde.
- Gerçek siparişte fazla planlama reddi: 1/1; Türkçe hata gösterildi. İlk birleşik ekran çalıştırmasında iki test aynı porta bağlanmaya çalıştığından ekran taraması başlamadı; aynı tarama tek başına yeniden çalıştırıldığında 1/1 geçti.
- Ekran taraması: 11 ekranda 77 görünüm, 320–1440 px arası belge taşması 0, mobilde ölçülen 44 px altı görünür düğme 0. Ölçümler `logs/factory-20261102-ux-verified-screen-audit.json` ve aynı adlı ekran görüntüsü dizinlerinde.
- Gösterim ve durum metinleri için beş odaklı test geçti. Bu testler gerçek cihaz PDF görüntülemesinin yerine geçmez.
- `npm run test:ci` başarılı: 292 alan, 12 güvenli kurtarma, 12 paketleme, kaynak 110 ve paket 110 tarayıcı; her modda 32 izolasyon/Sprint kontrolü. Paket tarayıcı özeti sıfır beklenmeyen uygulama hatası. Kaynak testleri sürerken son durum çevirisi ve mobil hedef CSS'i eklendi; son hâl ayrıca gerçek API ekran taramasında sınandı. Tam koşu günlüğü `logs/factory-20261102-ux-full-ci.log`.
- Son dağıtım özeti `c0582e32dbd11c47e5104fe522fcee7dc94c3c4ad4a339bbd68829f95e940ea3`; `npm run verify:rc1` mevcut kaynakla eşleşti.
