/* Context-safe navigation, work ownership and unified mobile entry points. */
(function () {
  "use strict";
  let selectedProduction = null,
    drawingOrder = null,
    queueKind = "";
  const listState = {};
  const h = (v) => esc(v),
    title = {
      myjobs: "İşlerim",
      quality: "Kalite Kuyruğu",
      more: "Tüm Ekranlar",
      queue: "İşlem Kuyruğu",
    };
  function mutate(command, args) {
    return commitState((draft) => RitimWorkforce[command](draft, args), {
      command: { kind: "workforce." + command, args },
      success: "İşlem kaydedildi",
    });
  }
  function workPanel(j) {
    return `<div class="card pad"><h3>İş Sorumluluğu</h3><p>${h(j.id)} · Operatör: <b>${h(j.owner || "Atanmamış")}</b></p>${state.user === "Yönetici" ? `<label class="formfield">Atanacak operatör<select class="select" id="work-owner">${RitimWorkforce.operators.map((o) => `<option ${j.owner === o ? "selected" : ""}>${h(o)}</option>`).join("")}</select></label><button class="btn full" onclick="RitimUX.assign(${jsArg(j.id)})">Operatör Ata</button><label class="formfield">Makine değişikliği gerekçesi<input class="input" id="work-reason"></label><button class="btn full" onclick="RitimUX.releaseMachine(${jsArg(j.id)})">Duraklatılmış İşin Makinesini Serbest Bırak</button>` : !j.owner ? `<button class="btn primary full" onclick="RitimUX.take(${jsArg(j.id)})">Bu İşi Devral</button>` : ""}<p class="tiny">Makine değişimi fiziksel parçaları veya planı taşımaz. Fiziksel transfer ve plan azaltma ayrı kayıtlardır.</p></div>`;
  }
  const oldJob = jobDetail;
  jobDetail = function () {
    const j = job(chosenJob);
    return oldJob() + (j ? workPanel(j) : "");
  };
  const oldOperator = operatorJob;
  operatorJob = function (j) {
    return workPanel(j) + oldOperator(j);
  };
  productionPage = function () {
    const j = selectedProduction ? job(selectedProduction) : byMachine(machine);
    return `<div class="operator"><div class="operator-top"><label>Makine<select class="op-machine-select" aria-label="Makine seçimi" onchange="RitimUX.machine(this.value)">${MACHINES.map((m) => `<option value="${h(m.id)}" ${machine === m.id ? "selected" : ""}>${h(m.id)} · ${h(m.brand)}</option>`).join("")}</select></label></div>${j ? `<p class="tiny">Seçili iş emri: ${h(j.id)}</p>${!j.machine ? '<div class="ux6-alert">Bu iş emrine makine atanmamış. Üretime başlamadan önce yönetici makine atamalı.</div>' : ""}${operatorJob(j)}` : '<div class="card pad empty">Bu makinede aktif iş yok.</div>'}</div>`;
  };
  assignMachine = function (id, target) {
    return mutate("machine", {
      id,
      target,
      reason: el("work-reason")?.value || "",
      machines: MACHINES.map((m) => m.id),
    });
  };
  const rememberList = () => {
    if (["orders", "jobs"].includes(view)) listState[view] = { search, filter };
  };
  const oldOpenOrder = openOrder;
  openOrder = function (id) {
    rememberList();
    oldOpenOrder(id);
  };
  const oldOpenJob = openJob;
  openJob = function (id) {
    rememberList();
    oldOpenJob(id);
  };
  const oldGo = go;
  go = function (v) {
    if (["orders", "jobs"].includes(view)) listState[view] = { search, filter };
    if (v === "production") selectedProduction = null;
    oldGo(v);
    if (listState[v]) {
      ({ search, filter } = listState[v]);
      render();
    }
  };
  const oldFiltered = filtered;
  filtered = function (data, mode) {
    const keep = filter;
    filter = "all";
    const rows = oldFiltered(data, mode);
    filter = keep;
    return rows.filter((x) => {
      const status =
        mode === "order"
          ? RitimQuantities.orderQuantities(state, x).status
          : x.state;
      return keep === "all" || keep === status;
    });
  };
  filters = function () {
    return `<div class="filterbar">${[
      ["all", "Tümü"],
      ["running", "Üretimde"],
      ["waiting", "Bekleyen"],
      ["paused", "Duraklatıldı"],
      ["partial", "Kısmi Sevk"],
      ["complete", "Tamamlandı"],
    ]
      .map(
        ([key, label]) =>
          `<button class="filter-chip ${filter === key ? "active" : ""}" onclick="filter='${key}';updateList()">${label}</button>`,
      )
      .join("")}</div>`;
  };
  function queue(kind) {
    const today = new Date().toISOString().slice(0, 10);
    if (kind === "running" || kind === "waiting")
      return state.jobs
        .filter((j) => j.state === kind)
        .map((j) => ({
          id: j.id,
          job: true,
          label: j.id + " · " + jo(j).part,
        }));
    if (kind === "quality")
      return state.jobs
        .filter((j) => j.ux05?.pending || j.ux05?.rework)
        .map((j) => ({
          id: j.id,
          job: true,
          label: `${j.id} · ${j.ux05.pending} kontrol · ${j.ux05.rework} rework`,
        }));
    return state.orders
      .filter((o) => {
        const x = RitimQuantities.orderQuantities(state, o);
        return kind === "open"
          ? !x.complete
          : kind === "delayed"
            ? o.due && o.due < today && !x.complete
            : kind === "ready"
              ? x.ready > 0
              : kind === "supplier"
                ? x.supplierOpen > 0
                : kind === "supplierLate"
                  ? x.d.dispatches.some(
                      (d) =>
                        d.due &&
                        d.due < today &&
                        d.qty -
                          RitimQuantities.sum(
                            x.d.returns.filter((r) => r.dispatch === d.ref),
                          ) -
                          RitimStockLedger.supplierResolved(
                            state,
                            o.id,
                            d.ref,
                          ) >
                          0,
                    )
                  : kind === "compensation"
                    ? state.jobs
                        .filter((j) => j.order === o.id)
                        .reduce(
                          (n, j) => n + j.scrap + (j.ux05?.setup || 0),
                          0,
                        ) +
                        RitimStockLedger.sum(
                          (state.supplierDispositions || []).filter(
                            (d) =>
                              d.order === o.id &&
                              ["scrap", "lost"].includes(d.kind),
                          ),
                        ) +
                        RitimStockLedger.sum(
                          (state.returnDispositions || []).filter(
                            (d) =>
                              d.order === o.id &&
                              ["scrap", "rework-scrap"].includes(d.kind),
                          ),
                        ) >
                      RitimQuantities.compensation(state, o.id)
                    : kind === "material"
                      ? x.material < x.allocated ||
                        x.material <
                          state.jobs
                            .filter((j) => j.order === o.id && j.op === 0)
                            .reduce(
                              (n, j) =>
                                n +
                                RitimQuantities.jobBalance(j, o, state).planned,
                              0,
                            )
                      : false;
      })
      .map((o) => ({ id: o.id, job: false, label: o.id + " · " + o.part }));
  }
  function queuePage() {
    const rows = queue(queueKind);
    return `<div class="card pad"><h2>${h({ open: "Açık Siparişler", running: "Üretimdeki İşler", waiting: "Bekleyen İşler", delayed: "Geciken Siparişler", quality: "Kalite Kuyruğu", material: "Malzeme Bekleyen", supplier: "Fason Açık", supplierLate: "Geciken Fason", compensation: "Telafi Gerektiren", ready: "Sevke Hazır" }[queueKind] || queueKind)} · ${rows.length} kayıt</h2>${rows.map((r) => `<button class="list-card" onclick="${r.job ? "RitimUX.openProduction" : "openOrder"}(${jsArg(r.id)})">${h(r.label)}</button>`).join("") || "<p>Kayıt yok.</p>"}</div>`;
  }
  function myJobs() {
    const mine = state.jobs.filter(
      (j) =>
        !["complete", "shipped"].includes(j.state) &&
        (state.user === "Yönetici" || j.owner === state.user || !j.owner),
    );
    return `<div class="card pad"><h2>İşlerim ve Devralınabilir İşler</h2><p class="tiny">${h(state.user)} · ${mine.length} iş</p>${mine.map((j) => `<button class="list-card" onclick="RitimUX.openProduction(${jsArg(j.id)})"><b>${h(j.id)} · ${h(jo(j).part)}</b><p>${h(j.owner || "Devralınabilir")} · ${h(j.machine || "Makine atanmamış")}</p>${badge(j.state)}</button>`).join("") || "<p>Atanmış veya devralınabilir iş yok.</p>"}</div>`;
  }
  function more() {
    return `<div class="card pad"><h2>Tüm Ekranlar</h2><div class="p1-menu">${[
      ["home", "Ana Ekran"],
      ["orders", "Siparişler"],
      ["jobs", "İş Emirleri"],
      ["myjobs", "İşlerim"],
      ["production", "Üretim"],
      ["quality", "Kalite Kuyruğu"],
      ["planning", "Operasyon Planlama"],
      ["transfers", "Fiziksel Transferler"],
      ["logistics", "Malzeme / Fason"],
      ["shipping", "Sevkiyat"],
      ["history", "Hareketler"],
      ["audit", "Miktar Kontrolü"],
    ]
      .map(
        ([v, label]) =>
          `<button class="btn" onclick="go('${v}')">${label}</button>`,
      )
      .join("")}</div></div>`;
  }
  const oldShell = shell;
  shell = function () {
    let text = oldShell().replace(
      '<div class="sidebar-note">',
      `<button class="side-btn" onclick="go('myjobs')">İşlerim</button><button class="side-btn" onclick="go('quality')">Kalite Kuyruğu</button><button class="side-btn" onclick="go('more')">Tüm Ekranlar</button><div class="sidebar-note">`,
    );
    return text.replace(
      /<nav class="bottomnav"[\s\S]*?<\/nav>/,
      `<nav class="bottomnav" aria-label="Mobil navigasyon">${[
        ["home", "Genel"],
        ["myjobs", "İşlerim"],
        ["orders", "Sipariş"],
        ["quality", "Kalite"],
        ["more", "Diğer"],
      ]
        .map(
          ([v, label]) =>
            `<button class="${view === v || (v === "more" && !["home", "myjobs", "orders", "quality"].includes(view)) ? "active" : ""}" ${view === v || (v === "more" && !["home", "myjobs", "orders", "quality"].includes(view)) ? 'aria-current="page"' : ""} onclick="go('${v}')">${I(v === "more" ? "jobs" : v === "quality" ? "check" : v === "myjobs" ? "jobs" : v)}<span>${label}</span></button>`,
        )
        .join("")}</nav>`,
    );
  };
  const oldHome = home;
  home = function () {
    return (
      oldHome() +
      `<div class="p1-alerts">${[
        ["material", "Malzeme bekleyen"],
        ["quality", "Kontrol / rework"],
        ["supplier", "Fason açık"],
        ["supplierLate", "Fason gecikmesi"],
        ["compensation", "Telafi gerektiren"],
        ["ready", "Sevke hazır"],
      ]
        .map(
          ([key, label]) =>
            `<button class="card pad" onclick="RitimUX.queue('${key}')"><b>${queue(key).length}</b> ${label}</button>`,
        )
        .join("")}</div>`
    );
  };
  const oldOrder = orderDetail;
  orderDetail = function () {
    const o = order(chosenJob);
    if (!o) return oldOrder();
    const movements = [
      ...state.events.filter((e) =>
        state.jobs.some((j) => j.id === e.job && j.order === o.id),
      ),
      ...(state.ux06?.[o.id]?.entries || []),
      ...(state.planningEvents || []).filter((e) => e.order === o.id),
      ...(state.physicalTransfers || [])
        .filter((t) => t.order === o.id)
        .flatMap((t) =>
          t.history.map((e) => ({
            ...e,
            job: t.source,
            qty: t.qty,
            type: "Fiziksel transfer · " + e.action,
            detail: t.destination,
          })),
        ),
      ...(state.operationInputs || [])
        .filter((t) => t.order === o.id)
        .flatMap((t) =>
          t.history.map((e) => ({
            ...e,
            job: t.destination,
            qty: e.qty || t.qty,
            type: "Operasyon girdisi · " + e.action,
            detail: t.source,
          })),
        ),
      ...(state.drawingVersions || [])
        .filter((e) => e.order === o.id)
        .map((e) => ({ ...e, type: "Çizim revizyonu " + e.revision })),
    ].sort((a, b) => String(b.time).localeCompare(String(a.time)));
    return (
      `<div class="p1-context">${[
        ["material", "Malzeme"],
        ["external", "Fason"],
        ["quality", "Final Kalite"],
        ["shipping", "Sevkiyat"],
      ]
        .map(
          ([tab, label]) =>
            `<button class="btn" onclick="RitimUX.logistics(${jsArg(o.id)},'${tab}')">${label}</button>`,
        )
        .join(
          "",
        )}<button class="btn" onclick="RitimUXPlanning.open(${jsArg(o.id)})">Planla</button></div>` +
      oldOrder() +
      `<div class="card pad"><h3>Sipariş Hareketleri</h3>${movements.map((e) => `<p>${h(e.kind || e.type || e.action)} · ${e.qty || 0} · ${h(e.job || e.meta || "")} · ${h(e.detail || e.reason || "")} · ${h(e.user)} · ${h(e.time)}</p>`).join("") || "Henüz hareket yok."}</div>`
    );
  };
  // Drawing context is independent from selected job/order and detail tabs.
  showDrawing = function (id) {
    drawingOrder = id;
    zoom = 1;
    modal = "drawing";
    renderModal();
  };
  const oldModal = renderModal;
  renderModal = function () {
    if (modal !== "drawing") return oldModal();
    const o = order(drawingOrder);
    if (!o) return closeModal();
    const src = o.drawing || "teknikResim.pdf",
      pdf =
        /\.pdf(?:$|[?#])/i.test(src) || src.startsWith("data:application/pdf");
    el("overlay").innerHTML =
      `<div class="modal-back"><div class="modal tech-modal" role="dialog" aria-modal="true" aria-label="Teknik Resim"><div class="modal-head"><h2>${h(o.id)} · Rev ${h(o.revision)}</h2><button class="btn" onclick="closeModal()" aria-label="Kapat">Kapat</button></div><div class="modal-body"><div class="row"><button class="btn" onclick="RitimQC.zoom(-0.25)">Uzaklaştır</button><button class="btn" onclick="RitimQC.zoom(0.25)">Yakınlaştır</button></div><div class="tech-stage" style="overflow:auto">${pdf ? `<iframe title="Teknik resim PDF" src="${h(src)}"></iframe>` : `<img id="techZoom" src="${h(src)}" alt="Teknik resim">`}</div></div></div></div>`;
  };
  const oldRender = render;
  render = function () {
    if (["myjobs", "quality", "more", "queue"].includes(view)) {
      el("app").innerHTML = shell();
      el("page").innerHTML =
        view === "myjobs"
          ? myJobs()
          : view === "more"
            ? more()
            : view === "quality"
              ? ((queueKind = "quality"), queuePage())
              : queuePage();
      document.querySelector(".header h1").textContent = title[view];
    } else oldRender();
    if (view === "home") {
      for (const b of document.querySelectorAll(".ux-kpi-link")) {
        const label = b.getAttribute("aria-label") || "";
        const key = label.startsWith("Açık")
          ? "open"
          : label.startsWith("Aktif")
            ? "running"
            : label.startsWith("Bekleyen")
              ? "waiting"
              : "delayed";
        b.onclick = () => window.RitimUX.queue(key);
      }
    }
  };
  window.RitimUX = {
    openProduction(id) {
      selectedProduction = id;
      view = "production";
      const j = job(id);
      if (j?.machine) machine = j.machine;
      render();
      window.scrollTo(0, 0);
    },
    machine(id) {
      selectedProduction = null;
      machine = id;
      render();
    },
    assign(id) {
      return mutate("assign", { id, operator: el("work-owner")?.value });
    },
    take(id) {
      return mutate("take", { id });
    },
    releaseMachine(id) {
      return mutate("machine", {
        id,
        target: "",
        reason: el("work-reason")?.value || "",
        machines: MACHINES.map((m) => m.id),
      });
    },
    queue(kind) {
      queueKind = kind;
      go("queue");
    },
    logistics(id, tab) {
      RitimUX06.openContext(id, tab);
    },
  };
  render();
})();
