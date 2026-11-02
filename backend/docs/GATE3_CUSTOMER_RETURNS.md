# Gate 3 — Müşteri iadesi geliştirme sözleşmesi

Bu işlev yalnız izole geliştirme modunda açıktır. İade, belirli bir `deliver` olayına bağlanır; teslim geçmişi değiştirilmez. İptal/revizyon politikası bulunmadığı için tüm açık yetkiler teslim edilen miktardan düşülür. Sipariş kilidi eşzamanlı yetki, kabul, karar, serbest bırakma ve sevki serileştirir.

`027_customer_rma.sql` tenant/site kapsamlı, zorunlu RLS ve değiştirilemez yetki, fiziksel kabul, kontrol, karar, rework girdi ve serbest bırakma kayıtlarını ekler. Kabul lotu kaynak teslim/çıktı lotuna iade dosyası üzerinden bağlanan ayrı bir mantıksal karantinadır; depo ve normal üretim defterine otomatik giriş yapmaz. Kontrol edilmemiş veya kararsız miktar karantinada kalır. Hurda karantinadan düşer. Rework kararı yalnız bir kez fiziksel iş emrine bağlanır ve mevcut üretim/çizim/tekrar kalite kapılarını kullanır. Onaylı iade karantinada kalır.

Açık serbest bırakma politikası: aktif yönetici, tenant admin veya superadmin yetkisi; `quality.write`; gerekçeli, onaylanmış miktarı aşmayan ayrı komut. Serbest bırakılmış miktar kendi iade kimliği ve kökeni ile sevkiyatta ayrı seçilir; karar tek başına sevke uygunluk yaratmaz. İade miktarı fiziksel kabul edildiğinde siparişin net sevk hesabından düşülür; iade çıkışı yeni sevkiyat olayıdır. İade lotu veya karantina hareketi hammadde deposuna dönüştürülmez. Kredi, iade ödemesi veya muhasebe hareketi oluşturulmaz.

## API

Tüm yollar `/api/v1/sites/{tenant}/{site}/orders/{order}/rma` altında; yazmalar doğrulanmış kimlik, idempotency anahtarı, yetki ve audit gerektirir:

- `GET /`: teslimat uygunluğu, iadeler, karantina, kontrol, karar, rework ve serbest bırakma özeti.
- `POST /`: `{deliveryId,rmaNumber,reason,quantity}` (`shipment.write`).
- `POST /{rmaId}/receipts`: `{quantity}` (`stock.write`).
- `POST /receipts/{receiptId}/inspections`: `{quantity,evidence}` (`quality.write`).
- `POST /inspections/{inspectionId}/dispositions`: `{outcome,quantity}`; `outcome` approved/scrap/rework (`quality.write`).
- `POST /dispositions/{dispositionId}/rework`: `{workOrderNumber}` (`quality.write`).
- `POST /dispositions/{dispositionId}/releases`: `{quantity,reason}` (`quality.write` ve yönetici rolü).

Yeni sevkiyat tahsisi, normal `outputLotId` yanında isteğe bağlı `rmaReleaseId` kabul eder. Sunucu iade serbest bırakma bakiyesini ve lot ilişkisini kontrol eder; dispatch ve deliver aynı ilişkiyi taşır. Genel amaçlı arbitrary rotalar ve ikinci rework döngüsü kapalıdır. Geçmiş kimliksiz iadeler otomatik eşleştirilmez.
