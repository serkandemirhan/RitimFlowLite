# Pilot release checklist

## 10 Kasım 2026 — üç makineli pilot hazırlığı

**Kurulum ortamı ve sahadaki cihaz kabulü henüz doğrulanmadı.** Açık `127.0.0.1:62949` sunumu kurgusal demo verisi kullanır; gerçek üretim kayıt sistemi olarak kurulmaz. Önceki fiziksel cihaz sonuçları güncel sürümün kabulü sayılmaz.

Bu tur yapılan düzeltmeler:

- Yerel API arayüz sunucusu artık ortak tablo/takvim kaynaklarını, PDF modülünü, worker ve font/wasm kaynaklarını sunuyor. Backend ve yapılandırma dosyaları erişime açılmadı. [Regresyon testi](../tests/dev-server-assets.test.cjs).
- Kurulumun hazır olma kontrolü kalite belgeleri, belge-karar bağlantıları, durdurma/iptal alanları ve işlem yapan kişi sorgusunun yetkilerini kontrol ediyor. Belge tablolarında zorunlu satır güvenliği de denetleniyor. [Kontrol](../backend/src/readiness.js), [negatif test](../backend/test/b03a-rls.test.js).
- Bekleyen komut, çevrimdışı işlem, aynı kimlikle yeniden deneme ve operatör taslakları için 11 test geçti. Yerel dosya sunma testi geçti. Backend: **244/244 geçti**, 55 migration; eksik yetki ve belge RLS negatif kontrolleri dahil. [Güncel TAP çıktısı](../artifacts/native-postgres/backend.tap).

### Pilot başlamadan tamamlanacaklar

1. **Hedef ortam:** Yerel ağ veya bulut seçimi, gerçek pilot adresi ve oturum açma yöntemi. Mevcut yerel geliştirme sunucusu yalnız loopback üzerinde çalışır; telefon erişimi için tamamlanmış LAN/HTTPS kurulumu değildir.
2. **Tek sürüm:** Test edilen kaynaklarla hedef kurulumun eşleşmesi; migration 055 dahil şema ve runtime yetkileri; `/health/ready` başarılı olmalı. Henüz bu değişiklikler canlıya yayımlanmadı.
3. **Gerçek tanımlar:** Ayrı firma/tesis, üç makine, operatör ve kalite hesapları, müşteri/parça/operasyon tanımları. Yönetici hesabı ortak operatör hesabı olarak kullanılmamalı.
4. **Takvim:** İşletmenin başlangıç/bitiş saatleri, 10:00 ve 15:00 çay molaları (15 dakika), öğle yemeğinin gerçek başlangıç ve süresi; makine-operatör atamaları.
5. **İlk iş:** Gerçekçi malzeme kabulü → sipariş → üretim emri → üç makinede planlama → operatör bildirimi → kalite dağılımı → tamir veya sevk. Tekrarlanan kaydın miktarı ikinci kez artırmadığı ve ekranlar arası sayılar doğrulanmalı.
6. **Duruş:** Sipariş/üretim emri durdurma, sebep ve kullanıcı kaydı; diğer oturumdan başlatmanın engellenmesi; devam ettirmenin işleri kendiliğinden çalıştırmaması. Uygulamadaki durdurma fiziksel makinenin acil stop devresini kontrol etmez.
7. **Kullanılacak cihazlar:** Gerçek telefonlarda giriş, klavye açık miktar/duruş girişi, müşterinin PDF'si, belge yükleme, ekran kilidi sonrası dönüş, Wi-Fi kesintisi ve tekrar bağlanma. iPhone kullanılacaksa önceki açık dokunma/PDF kabulü tamamlanmalı.
8. **Kurtarma:** Hedef ortamdan yedek alıp ayrı test veritabanına geri yükleme; belge içeriğinin de açılması. Sunucu yeniden başladıktan sonra uygulama ve kimlik servislerinin erişimi doğrulanmalı. DPAPI ile saklanan yerel kimlik bilgileri başka bilgisayara dosya kopyalayarak taşınamaz.

İlk gün kontrollü pilot: üç makine, az sayıda açık iş ve bir sorumlu yönetici ile mevcut üretim takibi paralel tutulur. Kayıt başarısı belirsizse yeni işlem açılmaz; aynı kaydın durumu doğrulanır.

## Önceki fiziksel cihaz kabul listesi

Current decision: **NOT READY**. See [test results](FINAL_OPERATOR_TEST_RESULTS.md). Do not convert missing physical evidence into PASS.

- [x] Compare code, historical reports and operator-refinement archive.
- [x] Keep operator visual design and existing business rules.
- [x] Fix PDF definite height and zoom/refit layout loop locally.
- [x] Verify PDF on physical Android using native touch; retain six screenshots.
- [x] Reconnect physical iPhone Safari and verify normal/fullscreen PDF rendering with injected local preview and DOM controls. Native pinch/pan and deployed application acceptance remain open.
- [x] Preserve command identity and prevent refresh during pending writes; local regressions pass.
- [x] Run backend regression: 217 tests, no failures/skips.
- [x] Document current quality API and legacy compatibility fields.
- [x] Compare local/live asset bytes: mismatch confirmed and recorded.
- [ ] Establish physical iPhone Safari interaction; normal/fullscreen PDF, page change, pinch, pan and fit.
- [ ] Complete T01–T07 using actual touch/keyboard, with device version, screenshot and same-job API evidence.
- [ ] Validate redesigned login/logout/reset/invitation flows on Android and iPhone.
- [ ] Validate keyboard-open pause/production submission and modal recovery; preserve text on failure.
- [ ] Confirm new assignment notification and five-job switching without losing current state.
- [ ] Capture first visible job-card timing separately from data-ready; test Safari background and lock/unlock.
- [ ] Test real Wi-Fi loss separately from controlled request failure/response loss.
- [ ] Test pause save during refresh and pending request during job switch on devices.
- [ ] Obtain a customer-approved dense multi-page technical PDF and test both devices.
- [ ] Freeze a reproducible candidate commit/build, then obtain publication approval if still required. Do not publish unresolved P0 fixes as accepted.
- [ ] Deploy accepted candidate; verify public hashes and deployed commit, cache behaviour and authenticated smoke on real URL.
- [ ] Record any active-shift test limitation and agree pilot operating boundaries.

Live tests that create persistent assignments/production require explicit authorization and isolated named test records. Do not delete existing records or reset databases. Retain only latest relevant evidence; preserve fixtures and scenario checkpoints. Release is READY only after all P0 target-device checks and critical data/authorization regressions pass.
