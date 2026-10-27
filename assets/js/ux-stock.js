(function () {
  "use strict";
  let selected = "";
  const h = esc,
    val = (id) => el(id)?.value,
    num = (id) => Number(val(id));
  function commit(command, args) {
    return commitState((draft) => RitimStock[command](draft, args), {
      command: { kind: "stock." + command, args },
      success: "İşlem kaydedildi",
    });
  }
  function page() {
    const o = order(selected) || state.orders[0];
    if (!o) return '<div class="empty">Sipariş yok</div>';
    selected = o.id;
    const x = RitimQuantities.orderQuantities(state, o),
      returns = x.d.customerReturns.filter((r) => r.id),
      supplier = (state.supplierDispositions || []).filter(
        (d) => d.order === o.id && d.kind === "rework" && d.remaining > 0,
      ),
      reworks = (state.returnReworks || []).filter(
        (r) => r.order === o.id && r.remaining > 0,
      );
    const losses = [
      ...state.jobs
        .filter((j) => j.order === o.id && (j.scrap || j.ux05?.setup))
        .map((j) => ({
          id: j.id,
          label: j.id + " · üretim kaybı " + (j.scrap + (j.ux05?.setup || 0)),
        })),
      ...(state.supplierDispositions || [])
        .filter((d) => d.order === o.id && ["scrap", "lost"].includes(d.kind))
        .map((d) => ({
          id: d.id,
          label: d.id + " · fason " + d.kind + " " + d.qty,
        })),
      ...(state.returnDispositions || [])
        .filter(
          (d) => d.order === o.id && ["scrap", "rework-scrap"].includes(d.kind),
        )
        .map((d) => ({ id: d.id, label: d.id + " · iade hurdası " + d.qty })),
    ];
    return `<div class="ux05-wrap"><div class="card pad"><h2>Malzeme, İade ve Telafi</h2><label class="formfield">Sipariş<select class="select" onchange="RitimStockUI.open(this.value)">${state.orders.map((o) => `<option value="${h(o.id)}" ${o.id === selected ? "selected" : ""}>${h(o.id)} · ${h(o.part)}</option>`).join("")}</select></label><p>Serbest malzeme: ${x.materialFree} · Net sevk: ${x.net}/${o.qty} · Sevke hazır: ${x.ready}</p><button class="btn full" onclick="RitimUX.logistics(${jsArg(o.id)},'material')">Birimli Malzeme Kabulü</button><button class="btn full" onclick="RitimUX.logistics(${jsArg(o.id)},'return')">Fason Dönüşü / Fark Kapatma</button><button class="btn full" onclick="RitimUX.logistics(${jsArg(o.id)},'customerReturn')">Müşteri İadesi Kaydet</button></div>
<div class="card pad"><h3>İşlem Miktarı ve Gerekçesi</h3><label class="formfield">Adet<input class="input" id="stock-qty" type="number" value="1" min="1"></label><label class="formfield">Gerekçe<input class="input" id="stock-decision-reason"></label><label class="formfield">Kalite kararı<select class="select" id="stock-decision"><option value="restock">Kontrol edildi · yeniden sevke hazır</option><option value="scrap">Hurda</option><option value="rework">Rework işi aç</option></select></label></div>
<div class="card pad"><h3>Müşteri İade Dosyaları</h3>${
      returns
        .map((r) => {
          const decisions = (state.returnDispositions || []).filter(
            (d) => d.caseId === r.id && !d.kind.startsWith("rework-"),
          );
          return `<div class="card pad"><b>${h(r.id)}</b><p>${h(r.shipment)} · ${r.qty} adet · ${h(r.status === "reversed" ? "Geri alınmış kayıt" : "Karantina / kalite süreci")}</p><p>Karar bekleyen: ${r.status === "reversed" ? 0 : r.qty - RitimStockLedger.sum(decisions)}</p><button class="btn full" onclick="RitimStockUI.dispose(${jsArg(r.id)})" ${r.status === "reversed" ? "disabled" : ""}>Seçili Kalite Kararını Uygula</button><button class="btn full" onclick="RitimStockUI.reverse(${jsArg(r.id)})" ${r.status === "reversed" || decisions.length ? "disabled" : ""}>Gerekçeli İade Ters Kaydı</button>${decisions.map((d) => `<p class="tiny">${h(d.kind)} · ${d.qty} · ${h(d.reason)}</p>`).join("")}</div>`;
        })
        .join("") ||
      "<p>Yeni iade dosyası yok. Eski kimliksiz iadeler tarihsel kayıttır; otomatik stok dönüşümü yapılmaz.</p>"
    }</div>
<div class="card pad"><h3>Rework Sonuçları</h3><label class="formfield">Sağlam<input class="input" id="stock-good" type="number" value="0" min="0"></label><label class="formfield">Hurda<input class="input" id="stock-scrap" type="number" value="0" min="0"></label>${supplier.map((r) => `<button class="btn full" onclick="RitimStockUI.resolve('supplierRework',${jsArg(r.id)})">Fason ${h(r.id)} · ${r.remaining} açık · sonucu onayla</button>`).join("")}${reworks.map((r) => `<button class="btn full" onclick="RitimStockUI.resolve('returnRework',${jsArg(r.id)})">İade ${h(r.id)} · ${r.remaining} açık · sonucu onayla</button>`).join("")}</div>
<div class="card pad"><h3>Kayıp Telafisi ve Ek Malzeme</h3><label class="formfield">Belgelenmiş kayıp<select class="select" id="stock-loss">${losses.map((l) => `<option value="${h(l.id)}">${h(l.label)}</option>`).join("")}</select></label><button class="btn full" onclick="RitimStockUI.compensate()">Kayıp İçin Telafi Planlama İzni Ver</button><button class="btn full" onclick="RitimStockUI.authorize()">Yalnızca Fazla Malzeme Kabulüne İzin Ver</button><p class="tiny">Yukarıdaki adet ve gerekçe kullanılır. Telafi izni yeni iş emri değildir; Planlama ekranında ilk operasyon için ek iş emri açın. Sipariş miktarı ve kayıp parçalar değişmez.</p><button class="btn full" onclick="RitimUXPlanning.open(${jsArg(o.id)})">Telafi İş Emrini Planla</button>${(
      state.compensations || []
    )
      .filter((c) => c.order === o.id)
      .map((c) => `<p>${h(c.source)} · ${c.qty} telafi · ${h(c.reason)}</p>`)
      .join("")}</div></div>`;
  }
  const oldRender = render;
  render = function () {
    if (view === "stock") {
      el("app").innerHTML = shell();
      el("page").innerHTML = page();
      document.querySelector(".header h1").textContent =
        "Malzeme ve İade Yönetimi";
    } else oldRender();
    if (view === "more")
      document
        .querySelector(".p1-menu")
        ?.insertAdjacentHTML(
          "beforeend",
          '<button class="btn" onclick="RitimStockUI.open()">İade / Telafi / Stok</button>',
        );
  };
  const oldShell = shell;
  shell = function () {
    return oldShell().replace(
      '<div class="sidebar-note">',
      '<button class="side-btn" onclick="RitimStockUI.open()">İade / Telafi / Stok</button><div class="sidebar-note">',
    );
  };
  window.RitimStockUI = {
    open(id) {
      selected = id || selected;
      go("stock");
    },
    receive(order) {
      return commit("receive", {
        order,
        inputQty: num("ux6-qty"),
        unit: val("stock-unit"),
        piecesPerUnit: num("stock-rate"),
        supplier: val("stock-supplier"),
        stockCode: val("stock-code"),
        ref: val("ux6-ref"),
      });
    },
    supplierReturn(order) {
      return commit("supplierReturn", {
        order,
        dispatch: val("ux6-dispatch"),
        qty: num("ux6-qty"),
        kind: val("stock-disposition") || "good",
        reason: val("stock-reason"),
      });
    },
    customerReturn(order) {
      return commit("customerReturn", {
        order,
        shipment: val("ux6-shipment"),
        qty: num("ux6-qty"),
        reason: val("ux6-reason"),
      });
    },
    dispose(caseId) {
      return commit("disposeReturn", {
        order: selected,
        caseId,
        qty: num("stock-qty"),
        kind: val("stock-decision"),
        reason: val("stock-decision-reason"),
      });
    },
    reverse(caseId) {
      return commit("reverseReturn", {
        order: selected,
        caseId,
        reason: val("stock-decision-reason"),
      });
    },
    resolve(command, id) {
      return commit(command, {
        id,
        good: num("stock-good"),
        scrap: num("stock-scrap"),
        reason: val("stock-decision-reason"),
      });
    },
    compensate() {
      return commit("compensate", {
        order: selected,
        source: val("stock-loss"),
        qty: num("stock-qty"),
        reason: val("stock-decision-reason"),
      });
    },
    authorize() {
      return commit("authorize", {
        order: selected,
        qty: num("stock-qty"),
        reason: val("stock-decision-reason"),
      });
    },
  };
  render();
})();
