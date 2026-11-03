/* Retired standalone sales demo: no mutations, no implicit conversion. */
(function () {
  const b = document.getElementById("archive-export"),
    status = document.getElementById("archive-status");
  b.onclick = () => {
    try {
      const raw = localStorage.getItem("ritimFlowLiteDemo");
      if (raw === null) {
        status.textContent = "Bu anahtarda kayıt yok.";
        return;
      }
      const url = URL.createObjectURL(
          new Blob([raw], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "ritim-sales-original-raw.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {
      status.textContent = "Depolamaya erişilemiyor; veri değiştirilmedi.";
    }
  };
})();
