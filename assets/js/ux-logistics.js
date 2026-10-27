/* UX-06: order-specific physical movement ledger. Standalone demo subledger; does not claim legacy production stock. */
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
  const num = (id) => {
    let v = document.getElementById(id)?.value;
    if (v == null || !v.trim() || !Number.isSafeInteger(+v)) return NaN;
    return +v;
  };
  let selected = "",
    tab = "material";
  const routeExternal = (o) => RitimQuantities.route(o).external;
  const ledger = (o, draft) => {
    draft.ux06 ??= {};
    draft.ux06[o.id] ??= {};
    for (const k of RitimQuantities.keys) draft.ux06[o.id][k] ??= [];
    return draft.ux06[o.id];
  };
  const sum = RitimQuantities.sum;
  const data = (o) => RitimQuantities.orderQuantities(state, o);
  function message(t) {
    if (typeof toast === "function") toast(t);
    else alert(t);
  }
  const stamp = () => new Date().toISOString();
  function movement(s, o, kind, qty, meta) {
    ledger(o, s).entries.unshift({
      kind,
      qty,
      meta,
      user: s.user,
      time: stamp(),
    });
  }
  function commitMovement(id, kind, n, meta, command, args = {}) {
    return commitState(
      (draft) => {
        const o = draft.orders.find((o) => o.id === id);
        if (!o) return { ok: false, message: "Sipariş bulunamadı" };
        const r = command(draft, o);
        if (!r.ok) return r;
        movement(draft, o, kind, n, meta);
        return r;
      },
      {
        success: "Hareket kaydedildi",
        command: { kind: "logistics." + kind, args: { id, n, meta, ...args } },
      },
    );
  }
  function validate(n, max) {
    return Number.isSafeInteger(n) && n > 0 && n <= max;
  }
  function receive() {
    return RitimStockUI.receive(selected);
  }
  function allocate() {
    const id = selected,
      n = num("ux6-qty"),
      jobId = document.getElementById("ux6-job")?.value;
    return commitMovement(id, "İş emrine tahsis", n, jobId, (draft, o) => {
      const x = RitimQuantities.orderQuantities(draft, o),
        j = draft.jobs.find((j) => j.id === jobId);
      if (!validate(n, x.materialFree))
        return { ok: false, message: "Serbest malzeme miktarı yetersiz" };
      if (!j || j.order !== o.id || j.op !== 0)
        return { ok: false, message: "İlk operasyondan bir iş emri seçin" };
      const cap =
        RitimQuantities.jobBalance(j, o, draft).planned -
        RitimQuantities.allocation(draft, o.id, jobId);
      if (n > cap)
        return { ok: false, message: "İş emri plan miktarı aşılıyor" };
      ledger(o, draft).allocations.push({ qty: n, job: jobId, date: stamp() });
      return { ok: true };
    });
  }
  function verifiedProduction(o) {
    return data(o).verified;
  }
  function productionAvailable(o) {
    return data(o).dispatchAvailable;
  }
  function dispatch() {
    const n = num("ux6-qty"),
      ref = document.getElementById("ux6-ref")?.value,
      supplier = document.getElementById("external-supplier")?.value || "",
      due = document.getElementById("external-due")?.value || "";
    return commitMovement(
      selected,
      "Fason gönderim",
      n,
      ref,
      (d, o) => RitimShipping.dispatch(d, o.id, { qty: n, ref, supplier, due }),
      { supplier, due },
    );
  }
  function supplierReturn() {
    return RitimStockUI.supplierReturn(selected);
  }
  function release() {
    const n = num("ux6-qty");
    return commitMovement(
      selected,
      "Final kontrol onayı",
      n,
      "Son operasyon doğrulandı",
      (d, o) => RitimShipping.release(d, o.id, { qty: n }),
    );
  }
  function shipOrder(id, n, ref) {
    return commitMovement(id, "Müşteri sevkiyatı", n, ref, (d, o) =>
      RitimShipping.ship(d, o.id, { qty: n, ref }),
    );
  }
  function ship() {
    return shipOrder(
      selected,
      num("ux6-qty"),
      document.getElementById("ux6-ref")?.value,
    );
  }
  function customerReturn() {
    return RitimStockUI.customerReturn(selected);
  }
  const opts = (items, value, label) =>
    items
      .map((x) => `<option value="${esc(x[value])}">${esc(label(x))}</option>`)
      .join("");
  const actions = {
    material: {
      title: "Malzeme Kabul",
      fn: receive,
      max: (x) =>
        Math.max(
          0,
          RitimQuantities.receiptLimit(state, order(selected)) - x.material,
        ),
      ref: "Tedarikçi irsaliyesi",
    },
    allocate: {
      title: "İş Emrine Tahsis",
      fn: allocate,
      max: (x) => x.materialFree,
    },
    external: {
      title: "Fason Gönderim",
      fn: dispatch,
      max: (x) => productionAvailable(order(selected), x),
      ref: "Fason gönderim irsaliyesi",
    },
    return: {
      title: "Fason Kısmi Dönüş",
      fn: supplierReturn,
      max: (x) => x.supplierOpen,
    },
    quality: {
      title: "Final Kontrol Onayı",
      fn: release,
      max: (x) => x.releaseAvailable,
    },
    shipping: {
      title: "Müşteri Sevkiyatı",
      fn: ship,
      max: (x) => x.shipAvailable,
      ref: "Müşteri sevk irsaliyesi",
    },
    customerReturn: {
      title: "Müşteri İadesi",
      fn: customerReturn,
      max: (x) => x.net,
    },
  };
  function logisticsView() {
    let o = order(selected) || state.orders[0];
    if (!o) return '<div class="empty">Sipariş yok.</div>';
    selected = o.id;
    const x = data(o),
      a = actions[tab],
      max = Math.max(0, a.max(x));
    return `<div class="ux6-wrap"><div class="card pad"><div class="ux6-head"><div><div class="eyebrow">UX-06 · HAREKET DEFTERİ</div><h2>Malzeme & Fason & Sevkiyat</h2></div><span class="demo">DEMO</span></div><label class="formfield">Sipariş<select class="select" id="ux6-order" onchange="RitimUX06.changeOrder(this.value)">${opts(state.orders, "id", (o) => o.id + " · " + o.part)}</select></label><p class="tiny">${esc(o.customer)} · Sipariş ${o.qty} adet · ${esc(o.route.join(" → "))}</p><div class="ux6-stats">${[
      ["Kabul", x.material],
      ["Serbest Malzeme", x.materialFree],
      ["Fason Açık", x.supplierOpen],
      ["Kontrol Bekleyen", x.releaseAvailable],
      ["Sevke Hazır", x.ready],
      ["Net Sevk", x.net],
    ]
      .map(([t, n]) => `<div><span>${t}</span><strong>${n}</strong></div>`)
      .join(
        "",
      )}</div><div class="ux6-progress"><div style="width:${x.percent}%"></div></div><p class="tiny">Siparişin net sevk ilerlemesi: ${x.net} / ${o.qty} (%${Math.round(x.percent * 100) / 100}) · UX-06 hareketlerinden hesaplanır.</p></div>
${x.issues.map((issue) => '<div class="ux6-alert">' + esc(issue) + "</div>").join("")}
<div class="ux6-tabs">${Object.entries(actions)
      .map(
        ([k, v]) =>
          `<button class="${tab === k ? "active" : ""}" onclick="RitimUX06.setTab('${k}')">${v.title}</button>`,
      )
      .join("")}</div>
<div class="card pad ux6-form"><div class="ux6-head"><h3>${a.title}</h3><span class="badge ${max ? "running" : "waiting"}">Uygun: ${max}</span></div>${tab === "external" && !routeExternal(o) ? '<p class="ux6-alert">Bu siparişin rotasında fason operasyonu bulunmuyor.</p>' : ""}<p class="tiny">Fason çıkışı yalnızca doğrulanmış sağlam üretimden yapılır. Final onay ve sevkiyat, tamamlanmış son operasyon gerektirir; fason rotasında bu miktar belgeye bağlı sağlam dönüştür. Eski kayıtlar otomatik stok olmaz.</p>${tab === "material" ? `<label class="formfield">Tedarikçi<input class="input" id="stock-supplier" value="Demo Tedarikçi"></label><label class="formfield">Stok kodu<input class="input" id="stock-code" value="${esc(o.material || o.partNo || o.id)}"></label><label class="formfield">Giriş birimi<select class="select" id="stock-unit"><option>adet</option><option>kg</option><option>m</option><option>çubuk</option></select></label><label class="formfield">Birim başına üretim adedi<input class="input" id="stock-rate" type="number" value="1" min="0.0001" step="any"></label>` : ""}${tab === "return" ? `<label class="formfield">Dönüş sonucu<select id="stock-disposition" class="select"><option value="good">Sağlam</option><option value="scrap">Hurda</option><option value="rework">Rework</option><option value="lost">Yetkili kayıp kapatma</option></select></label><label class="formfield">Fark / kalite gerekçesi<input id="stock-reason" class="input"></label>` : ""}<label class="formfield">${tab === "material" ? "Giriş miktarı (seçili birim)" : "Adet"}<input class="input" id="ux6-qty" type="number" min="1" max="${max}" value="${Math.min(10, max)}" inputmode="numeric"></label>
${tab === "external" ? `<label class="formfield">Fason tedarikçi<input class="input" id="external-supplier" value="Demo Fason Tedarikçi"></label><label class="formfield">Beklenen dönüş<input class="input" id="external-due" type="date"></label>` : ""}${a.ref ? `<label class="formfield">${a.ref}<input class="input" id="ux6-ref" placeholder="Örn. IRS-2026-001"></label>` : ""}
${
  tab === "allocate"
    ? `<label class="formfield">İş Emri<select class="select" id="ux6-job">${opts(
        state.jobs.filter((j) => j.order === o.id),
        "id",
        (j) => j.id + " · " + (o.route[j.op] || "İmalat"),
      )}</select></label>`
    : ""
}
${tab === "return" ? `<label class="formfield">Fason gönderim<select class="select" id="ux6-dispatch">${opts(x.d.dispatches, "ref", (s) => s.ref + " · " + (s.qty - sum(x.d.returns.filter((r) => r.dispatch === s.ref))) + " adet açık")}</select></label>` : ""}
${tab === "customerReturn" ? `<label class="formfield">İlgili sevkiyat<select class="select" id="ux6-shipment">${opts(x.d.shipments, "ref", (s) => s.ref + " · " + s.qty + " adet")}</select></label><label class="formfield">İade nedeni<input class="input" id="ux6-reason" placeholder="Kalite, hasar, yanlış ürün..."></label>` : ""}
<button class="btn primary full" ${!max || (tab === "external" && !routeExternal(o)) ? "disabled" : ""} onclick="RitimUX06.commit()">${a.title} · Kaydet</button></div>
<div class="card pad"><h3>Ortak Hareket Geçmişi</h3>${x.d.entries.length ? x.d.entries.map((e) => `<div class="ux6-event"><span><strong>${esc(e.kind)}</strong><small>${esc(e.meta)} · ${esc(e.user)} · ${new Date(e.time).toLocaleString("tr-TR")}</small></span><b>${e.qty} adet</b></div>`).join("") : '<div class="empty">Henüz UX-06 hareketi yok.</div>'}</div><div class="ux6-alert">İade karantinadadır; yeniden sevke hazır stokuna eklenmez. Gerçek depo, final üretim ve fason kalite entegrasyonu UX-07 doğrulaması sonrasındaki backend işidir.</div></div>`;
  }
  function renderPage() {
    const p = document.getElementById("page");
    if (p) p.innerHTML = logisticsView();
  }
  window.RitimUX06 = {
    openContext(id, t) {
      selected = id;
      tab = actions[t] ? t : "material";
      go("logistics");
    },
    shipOrder,
    shippingPage: customerShippingPage,
    openShipping(id) {
      selected = id;
      tab = "shipping";
      go("logistics");
    },
    changeOrder(v) {
      selected = v;
      renderPage();
    },
    setTab(v) {
      tab = v;
      renderPage();
    },
    commit() {
      return actions[tab].fn();
    },
  };
  window.RitimUX07Ledger = {
    data,
    ledger: (o) => RitimQuantities.readLedger(state, o.id),
    sum,
    verifiedProduction,
    productionAvailable,
  };
  const originalRender = render;
  render = function () {
    if (view === "logistics") {
      el("app").innerHTML = shell();
      renderPage();
      return;
    }
    originalRender();
  };
  const originalGo = go;
  go = function (v) {
    originalGo(v);
    if (v === "logistics") {
      const title = document.querySelector(".header h1");
      if (title) title.textContent = "Malzeme, Fason ve Sevkiyat";
    }
  };
  const originalShell = shell;
  shell = function () {
    let html = originalShell();
    html = html.replace('class="sidebar-note"', 'class="sidebar-note"');
    html = html.replace(
      '<div class="sidebar-note">',
      '<button class="side-btn" onclick="go(\'logistics\')">' +
        I("shipping", 19) +
        ' Malzeme / Fason</button><div class="sidebar-note">',
    );
    html = html.replace(
      "</nav>",
      `<button class="${view === "logistics" ? "active" : ""}" onclick="go('logistics')">${I("shipping", 18)}<span>Fason</span></button></nav>`,
    );
    if (view === "logistics")
      html = html.replace(
        "<h1>undefined</h1>",
        "<h1>Malzeme, Fason ve Sevkiyat</h1>",
      );
    return html;
  };
  function customerShippingPage() {
    const cards = state.orders
      .map((o) => {
        const x = data(o);
        return `<div class="card pad"><div class="row"><b>${esc(o.id)} · ${esc(o.part)}</b><button class="btn primary sm" data-order="${esc(o.id)}" onclick="RitimUX06.openShipping(this.dataset.order)">Sevkiyat Aç</button></div><p>Sevke hazır: <b>${x.ready}</b> · Net müşteri sevkiyatı: <b>${x.net} / ${o.qty}</b> · %${Math.round(x.percent * 100) / 100}</p>${x.issues.map((t) => '<p class="tiny">' + esc(t) + "</p>").join("")}${x.d.shipments.map((t) => '<p class="tiny">' + esc(t.ref) + " · " + t.qty + " adet müşteri sevkiyatı</p>").join("")}${x.historical.legacyShipments.length ? "<details><summary>Eski sevkiyat geçmişi (aktif toplam dışında)</summary>" + x.historical.legacyShipments.map((t) => "<p>" + esc(t.job) + " · " + t.qty + " adet · " + esc(t.time) + "</p>").join("") + "</details>" : ""}</div>`;
      })
      .join("");
    return (
      '<div class="list">' +
      (cards || '<div class="empty">Sipariş yok.</div>') +
      "</div>"
    );
  }
})();
