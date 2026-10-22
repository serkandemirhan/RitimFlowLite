# Ritim Flow Lite — UX-01–UX-07 (Entegre HTML5 demo)

## Kurulum
ZIP arşivinin içeriğini GitHub deposunun köküne yükleyin (yalnız `index.html` değil, `assets` ve `teknikResim.pdf` dahil). GitHub Pages main/root yayın ayarını doğrulayın. Canlı siteye yüklemeden önce dosyaların yedeğini alın.

## UX-07 güncellemeleri
- Üretim fiziksel teslimi artık **UX-06 iş emri malzeme tahsisi** üst sınırını doğrular. Malzeme kabul + iş emrine tahsis yapılmadan yeni fiziksel teslim yapılamaz.
- Fason gönderimi yalnızca iş emrine tahsis edilmiş **ve UX-05 üzerinde yeni sağlam kayıt olarak doğrulanmış** miktara dayanır.
- Fasonsuz siparişlerde final kontrol onayı aynı doğrulanmış sağlam miktar sınırına uyar.
- İlk sürümden kalan eski demo sağlamları `legacyGood` olarak ayrıştırılır; yeni modüle otomatik stok girişi yapılmaz.
- Yeni `UX-07 Kontrol` ekranında sipariş mutabakat tablosu, açık miktar ve olası tutarsızlık uyarıları, test adımları bulunur.

## Bilinen sınırlamalar — üretimde kullanmayın
- `localStorage` tek tarayıcı verisidir: çok kullanıcılı tutarlılık, oturum yetkilendirmesi ve sunucu işlemleri yoktur.
- Güncel üretimden sonraki operasyonlara fiziksel transfer zinciri henüz eksiksiz entegre değildir. Bu kontrol öncelikle **ilk iç operasyon → fason/son kontrol** demolarını güvenceye alır.
- Operasyonlar arası parti/lot, rezervasyon, üretim kalitesi, fason kayıp/hurda mutabakatı, iade karantina kararı, ters kayıt, transfer onayı ve makine değiştirme henüz eksiktir.
- Demo rolü Yönetici seçimi güvenli kimlik doğrulama değildir.
- Eski demo stokları değişmeden kalır; sürümler arası migrasyon yapılmadı. Test için tarayıcı demo sıfırlama kullanmak eski yerel demo kayıtlarını siler.
- GitHub'a otomatik push yapılmadı; teslimat manuel yüklemeye hazır ZIP'tir.

## Test rotası
1. Demo için malzeme kabul → iş emrine tahsis.
2. Operatörde fiziksel teslim → üretim → kontrol bekleyen.
3. Demo Yönetici yetkisiyle sağlam onayla.
4. Fason rotası varsa fason gönder / kısmi dönüş; yoksa final kontrol.
5. Son kontrol → kısmi sevkiyat → iade.
6. UX-07 Kontrol raporunda tutarsızlık kontrolü.
