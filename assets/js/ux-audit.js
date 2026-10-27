/* UX-07: read-only integrity findings and location/history reconciliation. */
(function () {
  "use strict";
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function audit() {
    const result = RitimIntegrity.validate(state);
    // Keep the public warning-list contract for previous callers, with structured detail.
    return {
      ...result,
      warnings: result.findings.map((f) => f.explanation),
      warningFindings: result.warnings,
      rows: result.balances.orders.map((x) => ({
        o: state.orders.find((o) => o.id === x.order),
        x,
        v: state.jobs
          .filter((j) => j.order === x.order)
          .reduce((n, j) => n + j.good, 0),
      })),
    };
  }
  function links(f) {
    const r = f.refs,
      buttons = [];
    if (r.order && state.orders.some((o) => o.id === r.order))
      buttons.push(
        `<button class="btn" onclick="openOrder(${jsArg(r.order)})">Siparişi Aç</button>`,
      );
    if (r.job && state.jobs.some((j) => j.id === r.job))
      buttons.push(
        `<button class="btn" onclick="openJob(${jsArg(r.job)})">İş Emrini Aç</button>`,
      );
    if (r.destination && state.jobs.some((j) => j.id === r.destination))
      buttons.push(
        `<button class="btn" onclick="openJob(${jsArg(r.destination)})">Hedef İş Emrini Aç</button>`,
      );
    if (r.record && r.order && state.orders.some((o) => o.id === r.order))
      buttons.push(
        `<button class="btn" onclick="RitimUX06.openContext(${jsArg(r.order)},'material')">Sipariş Hareketlerini Aç</button>`,
      );
    return buttons.join("");
  }
  function diagnostic() {
    const a = audit();
    return `<section class="ux07-wrap"><div class="card pad"><div class="eyebrow">UX-07 · VERİ BÜTÜNLÜĞÜ</div><h2>Sipariş / İş Emri Miktar Kontrolü</h2><p>Denetim salt okunurdur. Veriyi, belleği veya depolamayı değiştirmez. Tarihsel üretim, mevcut fiziksel konum ve henüz başlamamış plan ayrı gösterilir.</p><div class="ux07-alert ${a.critical.length ? "problem" : "ok"}">${a.critical.length} kritik ihlal · ${a.warningFindings.length} uyarı</div><p class="tiny">Kontrollerin geçmesi tarihsel lot bilgisini geri getirmez ve çoklu sekme güvenliği kanıtı değildir.</p><button class="btn" onclick="render()">Kontrolleri Yenile</button><button class="btn" onclick="openDataSafety()">Veri Güvenliği / Ham Veri</button></div>
      ${a.findings
        .map(
          (f) =>
            `<article class="card pad ux07-finding" data-integrity-code="${esc(f.code)}" data-severity="${esc(f.severity)}"><strong>${f.severity === "critical" ? "Kritik ihlal" : "Uyarı"} · ${esc(f.code)}</strong><p>${esc(f.explanation)}</p><p class="tiny">${Object.entries(
              f.refs,
            )
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => esc(k) + ": " + esc(v))
              .join(
                " · ",
              )}<br>${esc(f.path)}</p><p>${esc(f.remediation)}</p>${links(f)}</article>`,
        )
        .join("")}
      <div class="card pad"><h3>Sipariş Mutabakatı</h3><div class="ux07-table-wrap"><table class="ux07-table"><thead><tr><th>Sipariş</th><th>Malzeme</th><th>Tahsis</th><th>Fason Açık</th><th>Kayıtlı Onay − Sevk</th><th>Net Sevk</th><th>Karantina</th><th>Tarihsel Sevk</th></tr></thead><tbody>${a.balances.orders.map((x) => `<tr data-audit-order="${esc(x.order)}"><td><button class="ux07-link" onclick="openOrder(${jsArg(x.order)})">${esc(x.order)}</button></td>${["material", "allocated", "supplierOpen", "ready", "net", "quarantine", "historicalShipment"].map((k) => `<td data-metric="${k}">${esc(x[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="tiny">Kritik ihlal varsa kayıtlı onay farkı sevk izni değildir; kaynak kanıtı ayrıca doğrulanır.</p></div>
      <div class="card pad"><h3>Üretim Geçmişi / Fiziksel Konum / Plan</h3><div class="ux07-table-wrap"><table class="ux07-table"><thead><tr><th>İş Emri</th><th>Plan</th><th>Teslim</th><th>Tarihsel Sağlam</th><th>Hurda</th><th>Kontrol Bekleyen</th><th>Fiziksel İşlenmemiş</th><th>Başlamamış Plan</th><th>Konumda Sağlam</th></tr></thead><tbody>${a.balances.jobs.map((x) => `<tr><td><button class="ux07-link" onclick="openJob(${jsArg(x.job)})">${esc(x.job)}</button></td>${["planned", "received", "historicalGood", "historicalScrap", "pending", "physicalUnprocessed", "unstartedPlan", "onHandGood"].map((k) => `<td>${x[k] === null ? "Kanıt yok" : esc(x[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div></section>`;
  }
  const oldRender = render;
  render = function () {
    if (view === "audit") {
      el("app").innerHTML = shell();
      el("page").innerHTML = diagnostic();
      return;
    }
    return oldRender();
  };
  const oldShell = shell;
  shell = function () {
    let h = oldShell();
    h = h.replace(
      '<div class="sidebar-note">',
      '<button class="side-btn" onclick="go(\'audit\')">' +
        I("check", 19) +
        ' UX-07 Kontrol</button><div class="sidebar-note">',
    );
    if (view === "audit")
      h = h.replace("<h1>undefined</h1>", "<h1>Entegrasyon Kontrolü</h1>");
    return h;
  };
  window.RitimUX07 = { audit };
})();
