# Rol ve erişim

Yetkiler backend `permissions.js` ve veritabanındaki etkin site üyeliklerinden elde edilir; menü gizleme güvenlik sınırı değildir. Manager bütün mevcut iş yetkilerini, planner planlama, operator üretim, quality kalite, logistics stok ve sevkiyat, viewer okuma yetkisini alır. Birleşik roller sunucuda birleşir. Kullanıcı/site değişiminde istemci verileri temizlenir.

Arama `orders.read` kapsamındadır; fason ve iade arama/listeleri ayrıca kendi yetki ailelerini ister. Lot izinde fason ve iade ilişkileri yetkisiz kullanıcılara verilmez ve bu eksilme belirtilir. Rollerle gerçek uçtan uca kabul tüm alanlar için henüz bitmedi.
