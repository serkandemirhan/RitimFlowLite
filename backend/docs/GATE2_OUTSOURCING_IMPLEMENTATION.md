# Gate 2 — Fason geliştirme notları

Bu uygulama yalnız geliştirme/test modunda, `internal → external → internal` sırasını destekler. Gerçek üretimde etkin değildir. Ayrı tahsis komutu yerine gönderim, uygun kaynak lotundan miktarı aynı işlemde ayırıp tedarikçiye çıkarır. Kaynak operasyonun tamamlanmış ve çıktının kalite onaylı olması gerekir.

## Veri ve hesap

024 tedarikçiyi, 025 fason işi/gönderim/dönüş/giriş kontrolü kayıtlarını, 026 onaylı dönüşün sonraki iç iş emrine fiziksel teslimini tutar. Tablolar tenant/site anahtarlı, zorunlu RLS kapsamlı ve append-only'dir. Kaynak lotun sevke uygun miktarından tedarikçiye gönderim düşülür. Dışarıdaki miktar gönderim eksi fiziksel dönüş; kontrol bekleyen miktar dönüş eksi onay ve rettir. Sonraki işe teslim edilebilir miktar onay eksi önceki teslimlerdir. Gönderim, dönüş ve kalite kararı stok veya üretim kaydı uydurmaz. Dönüş lotu orijinal çıktı, gönderim, fason işi ve tedarikçiye bağlanır. Teslim komutu sonraki işi ve onaylı fiziksel girdisini aynı transaction içinde oluşturur; sonraki üretim mevcut üretim ledger'ını kullanır.

## Geliştirme API sözleşmesi

Tüm yollar `/api/v1/sites/{tenant}/{site}` altında; yazmalar doğrulanmış oturum, yetki, idempotency ve audit gerektirir.

- `GET/POST /outsourcing/suppliers`: site tedarikçileri / `{code,name}` oluşturma.
- `GET /orders/{order}/outsourcing`: rota, iş, uygun kaynak lotlar, gönderim, kısmi dönüş ve kontrol özetleri.
- `POST /orders/{order}/outsourcing/jobs`: `{supplierId,operationId}`.
- `POST /orders/{order}/outsourcing/jobs/{job}/dispatches`: `{outputLotId,quantity}`.
- `POST /orders/{order}/outsourcing/dispatches/{dispatch}/returns`: `{quantity}`; dönüş karantinadadır.
- `POST /orders/{order}/outsourcing/returns/{return}/inspections`: `{outcome,quantity,evidence}`; outcome `approved` veya `rejected`.
- `POST /orders/{order}/outsourcing/returns/{return}/downstream-work-orders`: `{workOrderNumber,plannedQuantity}`; onaylanmış fiziksel dönüşü sonraki iç işe teslim eder.

Gönderim ve dönüş tedarikçinin ayrıca teyit verdiği anlamına gelmez. Kullanıcı tarafından girilmeyen belge/kanıt otomatik üretilmez. Sonraki üretim ve kalite, mevcut yetki, atama, çizim ve lot kapılarını korur. Farklı sıra veya daha uzun fason rotalar kapalıdır. Müşteri iade ve genel tedarikçi yönetimi bu kapsamda değildir.
