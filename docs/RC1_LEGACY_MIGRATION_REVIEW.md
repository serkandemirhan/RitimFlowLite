# RC1 eski veri geçişi — inceleme ve açık engel

27 Ekim 2026. Durum: **uygulama tamamlanmadı; NO-GO**. Candidate commit `5b8ec29a687f1e8346c63b3e2c12226a2c2936b4` korunur. Bu çalışma yalnız test ve belge ekler; uygulamanın etkin anahtarını veya import akışını değiştirmez. Mevcut candidate'ı eski sekme ile aynı origin'de kullanmak hâlâ güvensizdir.

## Somut inceleme

Ana uygulamanın mevcut `BASE_KEY` değeri `ritimLiteAnonymousDemoV1`; eski `a28d562` sürümü bu anahtar üzerinde kilitsiz `getItem`/`setItem` yapar. Eski bağımsız satış HTML'i farklı `ritimFlowLiteDemo` anahtarını kullanır; mevcut satış sayfası bu anahtarı salt okunur arşiv olarak açar. RC1 halen aynı `BASE_KEY` üzerinden açılır. `dataKey` yalnız mevcut `:copy:` adreslerini seçer. `RitimTransactions.copy` hedef için exclusive Web Lock alır ve `P.copy` şemayı denetler; `P.copy` bütünlük motorunu çalıştırmaz, kaynak raw sürümünü kilit altında karşılaştırmaz ve normal komut günlüğünü oluşturmaz. Bu sebeple olduğu gibi güvenli geçiş değildir.

Ana `ritimLiteAnonymousDemoV1:rc1:v1` gibi yeni bir namespace bilinen sabit anahtarlı eski writer için yalıtım sağlar; fakat localStorage aynı origin'deki tüm JavaScript'e açıktır. Keyfî eski/üçüncü taraf kod veya `localStorage.clear()` yeni key'i silebilir; namespace güvenlik yetkisi değildir. Önceden oluşturulmuş `:copy:` kayıtları da kullanıcı verisidir ve keşif/geri yükleme planı gerektirir. `ritimFlowLiteDemo` formatının otomatik olarak ana snapshot ile uyumlu olduğu varsayılmaz.

## Çalıştırılan testler

- `node --test tests/rc1-legacy-preflight.test.cjs`: **3/3**. Gerçek P0-07 `decode` ve P0-06 `validate` ile geçerli snapshot, bozuk/desteklenmeyen şema ve şeması geçerli fazla tahsis senaryoları. Bu test import UI'sı değildir.
- `AUDIT_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tests/rc1-legacy-isolation-browser.cjs`: **2/2 karakterizasyon**. İki sayfa ve aynı geçici origin; Web Locks gerçekten kullanıldı. Biri kurgusal ayrı key'deki sevkiyatın eski sabit key yazısından ve reload'dan etkilenmediğini kontrol eder. Diğeri eski yazıcının yeni sekme lock tutarken kaynağı değiştirip tekrar eski byte'lara döndürebildiğini gösterir. Bu, üretim importu veya eski HTML entegrasyon kabul testi değildir; hipotetik key'e test kodu doğrudan yazar. Test verileri ve HTTP origin geçicidir.

## Kaynak değişikliği garantisinin sınırı

Eski tab P0-08 lock'unu almaz. localStorage yalnız tek anahtar işlemlerinde atomiktir; kaynak okuma ile hedef yazma arasında eski tab başka işlem yapabilir. Önce/sonra byte karşılaştırması, aradaki değişiklik eski byte'lara döndüğünde (ABA) bunu kesin olarak saptamaz. Web Locks yeni ve eski yazıcıları istemci tarafında zorla eşgüdümleyemez. Doğrulanmış snapshot'ın bir kopyasını ayrı anahtara yazmak bilinen eski koddan korur; ancak eski kaynak değişikliği tespitinin mutlak garantisi ve bütün işlemlerin otomatik birleştirilmesi sağlanmaz. Ayrı origin de keyfî eski same-origin koddan hedefi ayırır ama kaynak ile hedef arasında atomik compare-and-copy sağlamaz.

## Tamamlanması gerekenler

1. Kilitli, tek-yazarlı **sunucu transaction/revision** veya eski yazıcıların gerçekte durdurulup doğrulandığı kontrollü geçiş prosedürü tanımlanmalı. Sadece kullanıcıya sekmeleri kapatma talimatı verilmesi teknik olarak zorlama değildir ve mutlak garanti olarak sunulmamalıdır. Gerçek kullanıcı ve cihazlar için sunucu yetkisi gerekir.
2. Ürün onayladığı koruma sınırına göre ayrı sürümlü namespace, eski raw/backup dışa aktarımı, açık önizleme/onay, iki doğrulayıcı, kilit altında revalidation, kalıcı idempotency/transaction geçmişi ve hedef varlığında overwrite reddi uygulanmalı. Eski `:copy:` anahtarları ve tarihsel satış verileri ayrı ele alınmalı. Kaynak sonrası değişim kullanıcıya gösterilmeli; otomatik merge ve miktar toplama yapılmamalı.
3. Hata/kota/lock reddi ve kesinti halinde önceki veriler korunmalı; kesintili importun hiçbir aday kaydı etkin olarak açılamamalı. Hatalı/bozuk kaynakta P0-07 recovery ve ham export erişilebilir kalmalı.
4. Gerçek eski HTML/JS ve RC1 UI kullanan iki sekmeli kabul testleri, cache geçişi, reload, rollback ve tam önceki regresyon suite'leri çalıştırılmalı. Bu incelemedeki testler bunların yerine geçmez.
5. GH Actions, gerçek mobil kabul ve hedef ortam/yedekleme onayı hâlâ açık. Dağıtım kapalı tutulmalı.

## Yedek ve geri dönüş

Eski ham veriyi yedekleyip saklayın. Gelecekte geçiş olursa kaynak ve hedefin bağımsız geçmişlerini ayrı dışa aktarın; eski sürümü yeni namespace'e yazdırmayın ve iki geçmişi otomatik toplamayın. Geri dönüş öncesinde sonraki RC1 hareketlerini kaybetmemek için verileri ayrı saklayıp yetkili mutabakat yapın. Bu inceleme hiçbir gerçek veri yedeği veya migration yapmamıştır.
