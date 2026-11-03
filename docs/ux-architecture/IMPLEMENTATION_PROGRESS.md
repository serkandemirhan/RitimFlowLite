# UI mimarisi uygulama durumu

2026-11-02. Başlangıç: frontend `bbb5657`, backend `2980d8d`. Bu kayıt tamamlanmış mimari kabulü değildir.

- Mevcut işlevlerin ilk haritası `MASTER_FUNCTIONALITY_MATRIX.md` dosyasındadır; mevcut ekranlar ve sipariş kapsamlı API sınırlamaları listelenmiştir. Tam etkileşim/rol envanteri ayrıca doğrulanmalıdır.
- API kabuğunda yetkili oturumun seçili tenant/site adı gösterilir; mevcut ekranın gezinme düğmesine `aria-current="page"` ve seçili stil uygulanır. Site veya oturum değişiminde mevcut temizleme davranışı korunur.
- Yedi alanlı kabuk, rol bazlı başlangıç ekranları, bağımsız kalite/rework ve lojistik kuyrukları, kalıcı derin bağlantılar, genel arama ve soyağacı henüz uygulanmadı.
- Önceki fabrika yolculuğu ve responsive kanıtları `docs/factory-journey/ux-refinement/` altında geçmiş durumu gösterir; bu değişikliklerin kabulü yerine geçmez.
- Değişim kısmi olduğundan tüm alanlar için karar **NO-GO / doğrulanmadı**. Mevcut sunucu yetkisi, şifreli kurtarma, demo veri yalıtımı ve PDF açılmadan onay verilmemesi korunmalıdır.

## Bu tur doğrulama notları

- `node --check integration/premium-api.js`: geçti.
- `tests/ux-architecture-shell-browser.cjs`: son koşu 1/1 geçti. Test sahte oturum ve yerel sunucu kullanır; gerçek Keycloak veya yetki güvenliği testi değildir. Fikstür geliştirilirken önce eksik `render` küreseli, sonra test sunucusunda UTF-8 başlığı, sonra eksik `wizard`/`modal` küreselleri nedeniyle önceki denemeler başarısız oldu; bunlar uygulama kabulü sayılmaz.
- Backend ilk tam koşu: 134 geçti / 2 başarısız (başarısız alt test ve üst testi); PostgreSQL 16 sunucusu karşısında PATH'teki pg_dump 14 kullanıldı. `/tmp/ritim-master-ui-backend.tap`. Doğru PostgreSQL 16 istemcisiyle aynı migration/backup/restore testi 4/4 geçti; `/tmp/ritim-master-ui-backend-pg16-retry.tap`. Tam backend tekrarının ve frontend CI'ın kesin sonuçları koşu tamamlandığında kaydedilmelidir.
- Doğru PostgreSQL 16 istemcisiyle backend tam tekrar: **136/136**, 0 fail/skip. `/tmp/ritim-master-ui-backend-pg16.tap`.
- Frontend `npm run test:ci`: başlatıldı, bu kayıt yazılırken devam ediyor. Şimdiye kadar 292/292 alan, 12/12 kurtarma, 12/12 paketleme ve 43 varlık smoke kontrolü başarılı; tam CI sonucu `/tmp/ritim-master-ui-ci.log` tamamlanmadan başarılı sayılmaz.

## Yedi alanlı kabuk — devam çalışması

- API kipinde Genel Bakış, Siparişler, Planlama, Üretim, Kalite, Depo ve Lojistik ana gezinmesi eklendi. Planlama ile Lojistik için mevcut ekranlara ait bağlamsal alt bağlantılar kullanılıyor. Genel Bakış yalnız mevcut iş alanlarına giriş sunar; uydurma sayı/uyarı üretmez.
- `tests/ux-architecture-shell-browser.cjs` sahte oturumla 1/1 geçti. `tests/ux-architecture-oidc-browser.cjs` gerçek Keycloak/Fastify ile 1/1 geçti; 320, 360, 390, 430, 768 ve 1440 genişlik ve lojistik alt bağlantıları doğrulandı. Sipariş ekranı görüntüleri `screenshots/orders-{390,768,1440}.png` altındadır. İlk gerçek giriş denemesi yanlış porttaki geri dönüş nedeniyle başarısızdı: `/tmp/ritim-master-ui-oidc-first.tap`; doğru 44729 portuyla tekrar geçti: `/tmp/ritim-master-ui-oidc-retry.tap`.
- Bu gezinti değişikliği bağımsız sunucu kuyrukları, rol bazlı açılış, derin bağlantı, genel arama, uçtan uca izlenebilirlik veya tam fabrika akışı kabulü değildir. Yedi alanın tamamı için kaynak ve paket uçtan uca kabulü yapılmadı. Genel karar NO-GO kalır.
- Yeni frontend tam CI `/tmp/ritim-master-ui-navigation-ci.log` içinde sürmektedir; tamamlanmadan başarılı kabul edilmez.

## Kontroller ve rework ayrımı

- Kalite kontrolleri ve rework için ayrı alt ekranlar oluşturuldu; rework kayıtları mevcut yetkili sunucu kuyruğundan yüklenir. Tahsis ve iş emri işlemlerinin API ve kurtarma mekanizması değiştirilmedi.
- Odaklı sahte oturum tarayıcı testi 1/1 geçti (`/tmp/ritim-master-ui-rework-test.tap`). Gerçek OIDC ve tam frontend CI son kodla tekrar başlatıldı (`/tmp/ritim-master-ui-rework-oidc.tap`, `/tmp/ritim-master-ui-rework-ci.log`); bu koşular bitmeden başarılı kabul edilmez.
- Önceki yedi alanlı kabuk sürümü için tam `npm run test:ci` tamamlandı: 292 alan, 12 kurtarma, 12 paketleme, 110 kaynak + 110 paket browser ve iki modda 25'er wizard/Sprint kontrolü; hata yok. Bu sonuç yeni rework ayrımını kapsamaz.
- Lojistik bağımsız sunucu kuyrukları, güvenli derin bağlantılar, küresel arama/soyağacı ve tüm fabrika E2E kabulü henüz tamamlanmadı. NO-GO.
- Son kodla gerçek Keycloak/Fastify menü ve ayrı rework ekranı tarayıcı testi **1/1 geçti**, `/tmp/ritim-master-ui-rework-oidc.tap`. Bu test tam rework üretim ve yeniden kontrol yolculuğu değildir.

## İş alanı bağlantıları ve düğme temizliği

- Operatör ekranına ana Üretim düğmesiyle erişildiğinden aynı ekrana giden tekil alt düğme kaldırıldı. Diğer işlev düğmeleri korundu.
- API kipinde ana alanlar `view` parametresiyle açılır; iş yeri seçimi sonrası yetki tekrar denetlenerek geri yüklenir. Tarayıcı geri/ileri desteği eklendi. URL yalnız ekran kimliğini içerir; kayıt detayları için kalıcı bağlantı uygulanmadı.
- Geri/ileri, iş yeri değişimi ve rework ayrımı için odaklı test 1/1; gerçek Keycloak oturumunda ekranı yenileyip iş yeri seçerek rework ekranına dönüş testi 1/1 geçti (`/tmp/ritim-master-ui-routes-test.tap`, `/tmp/ritim-master-ui-routes-oidc.tap`).
- Önceki rework ayrımıyla tam CI tamamlandı: 292/292 alan, 12/12 kurtarma, 12/12 paketleme, kaynak 110/110 ve paket 110/110 browser; iki moddaki ek izolasyon ve Sprint kontrolleri başarılı. Son adres değişiklikleriyle CI yeniden çalışıyor (`/tmp/ritim-master-ui-routes-ci.log`).
- Form taslağı koruması, sipariş/iş emri/lot düzeyinde derin bağlantılar, bağımsız lojistik sunucu kuyrukları, genel arama ve lot soyağacı tamamlanmadı. Önceki tam CI, yeni adres değişikliğinin veya gerçek fabrika E2E kabulünün kanıtı değildir; NO-GO.

## Kayıt adresleri — devam

- Sipariş ayrıntısı, iş emri ve kalite iş emri ekranları için URL'de yalnız kayıt kimlikleri saklanır. Geri/ileri veya iş yeri seçimi sonrası sunucudan yeniden yüklenir; iş emrinin seçili siparişte olması doğrulanır. Sunucu yetki kontrolü değişmedi.
- Odaklı sahte oturum testi: son koşu 1/1; `/tmp/ritim-master-ui-detail-test-final.tap`. İlk iki denemede test fikstürünün asenkron adres beklemesi ve `jsArg` kodlaması hatalıydı; `/tmp/ritim-master-ui-detail-test.tap` ve `/tmp/ritim-master-ui-detail-test-retry.tap`. Gerçek Keycloak ile kayıt düzeyinde derin bağlantı kabulü henüz yapılmadı.
- Son kod için tam frontend CI başlatıldı: `/tmp/ritim-master-ui-detail-ci.log`; sonucu tamamlanmadan kabul edilmez.
- Genel arama, lot soyağacı, bağımsız lojistik kuyrukları, form taslaklarının korunması, gerçek fabrika E2E ve kapsamlı mobil/görsel kabul hâlâ açık. Proje NO-GO.
