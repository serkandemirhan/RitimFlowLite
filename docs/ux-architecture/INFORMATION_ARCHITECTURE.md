# Bilgi mimarisi — geliştirme durumu

API geliştirme kipinin ana alanları Genel Bakış, Siparişler, Planlama, Üretim, Kalite, Depo ve Lojistik'tir. Planlama altında iş emirleri ve planlama; Kalite altında kontroller ve Rework; Lojistik altında sevkiyat, fason ve iadeler ayrı girişlerdir. Genel Bakış ilgili alanlara bağlantı verir; doğrulanmamış KPI üretmez.

Sipariş, sipariş ve rota kaydının; Planlama iş emrinin; Üretim operatör yürütmesinin; Kalite karar ve Rework'ün; Depo fiziksel depo hareketinin; Lojistik sevkiyat/fason/iadenin sahibidir. Mevcut ayrıntılarda bu sınırlar henüz tamamen uygulanmadı. Ayrı kayıt listelerinin yanında önceki sipariş bağlamlı işlem panelleri korunuyor; durum bazlı tam bağımsız kuyruk kabulü açık.

Arama ve doğrudan lot ilişkileri ortak araçtır. API erişimi mevcut sunucu yetkilerinin yerini almaz. Yerel kurgu demo ve API geliştirme modu ayrı kalır.
