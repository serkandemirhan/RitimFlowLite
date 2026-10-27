/* Planning UI and legacy entry points share one guarded command boundary. */
(function () {
  "use strict";
  const h = (v) =>
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
  const value = (id) => document.getElementById(id)?.value;
  const actionLabel = {
    create: "Plan oluşturuldu",
    reduce: "Plan azaltıldı",
    reserve: "Girdi ayrıldı",
    release: "Rezervasyon bırakıldı",
    send: "Gönderildi",
    accept: "Kabul edildi",
  };
  const stateLabel = {
    waiting: "Bekliyor",
    running: "Üretimde",
    paused: "Duraklatıldı",
    complete: "Tamamlandı",
    shipped: "Sevk edildi",
  };
  let selected = "",
    operation = 0;
  function commit(command, args) {
    return commitState((draft) => RitimPlanning[command](draft, args), {
      command: { kind: "planning." + command, args },
      success: "İşlem kaydedildi",
      after: () => {
        closeModal();
        render();
      },
    });
  }
  function form(o) {
    const r = RitimQuantities.route(o),
      c = RitimPlanning.capacity(state, o, operation);
    return `<div class="card pad"><h3>Operasyon İş Emri Planla</h3><p>${h(o.id)} · ${h(o.part)}</p><label class="formfield">Operasyon<select class="select" id="plan-operation" onchange="RitimUXPlanning.operation(Number(this.value))">${r.operations.map((r, i) => `<option value="${i}" ${i === operation ? "selected" : ""} ${r.type !== "internal" ? "disabled" : ""}>${i + 1} · ${h(r.name)}${r.type === "external" ? " · Fason ekranından yürütülür" : ""}</option>`).join("")}</select></label><p class="tiny">Uygun toplam: ${c.limit} · Planlanan: ${c.planned} · Yeni plan için uygun: <b>${c.available}</b></p><p class="tiny">${operation === 0 ? "İlk operasyon planı sipariş miktarını aşamaz. Malzeme kabulü ve fiziksel teslim ayrı işlemlerdir." : "Önceki operasyonun tamamlanmış ve kalite kontrolünden geçmiş sağlam çıktısı ayrılır. Üretime başlamak için ayrıca gönderim ve hedef kabulü gerekir."}</p>
${!r.supported ? '<p class="ux6-alert">Bu rotanın fason sonrası girdi bağlantısı henüz desteklenmiyor; yeni plan kapalı.</p>' : ""}<label class="formfield">İş emri numarası<input class="input" id="additionalJobId" value="WO-${Date.now()}"></label><label class="formfield">Planlanan miktar<input class="input" id="additionalQty" type="number" min="1" step="1" value="${Math.min(10, c.available)}"></label><label class="formfield">Makine<select class="select" id="additionalMachine"><option value="">Sonra ata</option>${MACHINES.map((m) => `<option value="${h(m.id)}">${h(m.id)}</option>`).join("")}</select></label><button class="btn primary full" onclick="createAdditionalJob()" ${!c.available || !r.supported ? "disabled" : ""}>İş Emri Oluştur</button></div>`;
  }
  function page() {
    const o = order(selected) || state.orders[0];
    if (!o) return '<div class="empty">Sipariş yok</div>';
    selected = o.id;
    const rs = RitimOperations.rows(state).filter((r) => r.order === o.id),
      labels = {
        reserved: "Ayrıldı · henüz fiziksel çıkış yok",
        in_transit: "Yolda · hedef kabulü bekliyor",
        accepted: "Hedefte kabul edildi",
        cancelled: "Rezervasyon serbest bırakıldı",
      };
    return `<div class="ux05-wrap"><div class="card pad"><h2>Operasyon Planlama</h2><label class="formfield">Planlanacak sipariş<select class="select" onchange="RitimUXPlanning.open(this.value)">${state.orders.map((a) => `<option value="${h(a.id)}" ${a.id === o.id ? "selected" : ""}>${h(a.id)} · ${h(a.part)}</option>`).join("")}</select></label></div>${form(o)}
${state.jobs
  .filter((j) => j.order === o.id)
  .map(
    (j) =>
      `<div class="card pad"><b>${h(j.id)} · ${j.op + 1}. operasyon · ${RitimQuantities.jobBalance(j, o, state).planned} plan</b><p>${h(j.machine || "Makine atanmamış")} · ${h(j.planningState === "cancelled" ? "İptal edildi" : stateLabel[j.state] || j.state)}</p><label class="formfield">Azaltılacak başlanmamış plan<input class="input" type="number" min="1" id="reduce-${h(j.id)}" value="1"></label><label class="formfield">Plan azaltma gerekçesi<input class="input" id="reason-${h(j.id)}"></label><button class="btn full" data-job="${h(j.id)}" onclick="RitimUXPlanning.reduce(this.dataset.job)" ${["complete", "shipped"].includes(j.state) || j.ux05?.handover ? "disabled" : ""}>Planı Azalt / Rezervasyonu Bırak</button></div>`,
  )
  .join("")}
<div class="card pad"><h3>Operasyon Girdi Hareketleri</h3>${rs.map((r) => `<div style="margin:16px 0;overflow-wrap:anywhere"><b>${h(r.id)} · ${r.qty} adet</b><p>${h(r.source)} → ${h(r.destination)}<br>${h(labels[r.status])}</p><p class="tiny">${h(r.inputLot)} → OPINPUT:${h(r.id)}</p>${r.status === "reserved" ? `<button class="btn full" data-movement="${h(r.id)}" onclick="RitimUXPlanning.move(this.dataset.movement,'send')">Operasyon Girdisini Gönder</button>` : r.status === "in_transit" ? `<button class="btn primary full" data-movement="${h(r.id)}" onclick="RitimUXPlanning.move(this.dataset.movement,'accept')">Operasyon Girdisini Kabul Et</button>` : ""}<details><summary>Hareket geçmişi</summary>${r.history.map((e) => `<p class="tiny">${h(actionLabel[e.action] || e.action)} · ${e.qty ?? r.qty} · ${h(e.user)} · ${h(e.reason || "")} · ${h(e.time)}</p>`).join("")}</details></div>`).join("") || '<p class="tiny">Henüz operasyon girdisi ayrılmadı.</p>'}</div><div class="card pad"><h3>Plan geçmişi</h3>${
      (state.planningEvents || [])
        .filter((e) => e.order === o.id)
        .map(
          (e) =>
            `<p class="tiny">${h(e.job)} · ${h(actionLabel[e.action] || e.action)} · ${e.qty} · ${h(e.reason)} · ${h(e.user)}</p>`,
        )
        .join("") || "Henüz plan değişikliği yok."
    }</div></div>`;
  }
  const oldRender = render;
  render = function () {
    if (view !== "planning") return oldRender();
    el("app").innerHTML = shell();
    el("page").innerHTML = page();
    const title = document.querySelector(".header h1");
    if (title) title.textContent = "Operasyon Planlama";
  };
  const oldShell = shell;
  shell = function () {
    return oldShell().replace(
      '<div class="sidebar-note">',
      '<button class="side-btn" onclick="RitimUXPlanning.open()">Operasyon Planlama</button><div class="sidebar-note">',
    );
  };
  newJobFor = function (id) {
    selected = id;
    operation = 0;
    chosenJob = id;
    closeModal();
    go("planning");
  };
  createAdditionalJob = function () {
    const r = commit("create", {
      order: selected || chosenJob,
      id: value("additionalJobId"),
      operation: Number(value("plan-operation")),
      qty: Number(value("additionalQty")),
      machine: value("additionalMachine") || "",
      machines: MACHINES.map((m) => m.id),
    });
    return r;
  };
  // First-order job creation uses the same planner before any state is persisted.
  createOrder = function () {
    captureWizard();
    const w = structuredClone(wizard);
    if (
      !w ||
      !w.id?.trim() ||
      !w.customer?.trim() ||
      !w.part?.trim() ||
      !RitimQuantities.count(w.qty) ||
      w.qty < 1
    )
      return toast("Sipariş bilgileri ve pozitif tam sayı miktar gerekli");
    if (state.orders.some((o) => o.id === w.id.trim()))
      return toast("Sipariş numarası zaten mevcut");
    const { step, machine, jobId, jobQty, ...o } = w;
    o.id = o.id.trim();
    return commitState(
      (draft) => {
        if (draft.orders.some((existing) => existing.id === o.id))
          return { ok: false, message: "Sipariş numarası zaten mevcut" };
        draft.orders.unshift(o);
        return RitimPlanning.create(draft, {
          order: o.id,
          id: jobId,
          operation: 0,
          qty: Number(jobQty),
          machine,
          machines: MACHINES.map((m) => m.id),
        });
      },
      {
        success: "Sipariş ve ilk iş emri oluşturuldu",
        command: {
          kind: "planning.createOrder",
          args: { order: o, jobId, jobQty, machine },
        },
        after: () => {
          closeModal();
          openOrder(o.id);
        },
      },
    );
  };
  window.RitimUXPlanning = {
    open(id) {
      selected = id || selected;
      operation = 0;
      go("planning");
    },
    operation(n) {
      operation = n;
      render();
    },
    reduce(id) {
      return commit("reduce", {
        job: id,
        qty: Number(value("reduce-" + id)),
        reason: value("reason-" + id),
      });
    },
    move(id, action) {
      return commit("move", { id, action });
    },
  };
})();
