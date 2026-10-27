/* Physical transfer UI; commands validate again on every commit. */
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
  const val = (id) => document.getElementById(id)?.value;
  let selectedJob = "";
  const label = {
    in_transit: "Yolda · kabul bekliyor",
    accepted: "Hedefte kabul edildi",
    reversed: "Geri alındı · kaynakta",
  };
  function panel(j) {
    const b = RitimQuantities.jobBalance(j, jo(j), state),
      lots = RitimTransferLedger.lots(state, j);
    const physical = RitimQuantities.jobPhysicalStock(state, j, jo(j));
    const targets = state.jobs.filter(
      (t) =>
        t.id !== j.id &&
        t.order === j.order &&
        t.op === j.op &&
        !["complete", "shipped"].includes(t.state),
    );
    const rows = RitimTransferLedger.rows(state).filter(
      (t) => t.source === j.id || t.destination === j.id,
    );
    return `<div class="card pad ux05-block" id="physical-transfer-panel"><h3>Fiziksel Parça Transferi</h3><button class="btn full" data-job="${h(j.id)}" onclick="RitimUXTransfers.open(this.dataset.job)">Tüm İş Emirlerinin Transferleri</button>
      <p class="tiny">Toplam sağlam üretim: ${j.good} · İş emrinde doğrulanmış sağlam: ${physical.onHandGood === null ? "Doğrulanamıyor" : physical.onHandGood} · Sağlam çıkışı: ${physical.departedGood}. Geçmiş üretim sayacı fiziksel stok değildir.</p>
      <p class="tiny">Yalnızca aynı operasyonun işlenmemiş parçaları taşınır. Kaynak: ${h(j.id)} · ${b.unprocessed} fiziksel parça. ${b.unstarted} işe alınmamış parça plan bakiyesidir; bu işlemle taşınmaz. Giriş lotu, iş emrinin toplu teslimlerini temsil eder; tedarikçi parti numarası değildir.</p>
      ${RitimTransferLedger.issues(state)
        .map((t) => `<p class="ux6-alert">${h(t)}</p>`)
        .join("")}
      <label class="formfield">Hareket numarası<input class="input" id="transfer-id" placeholder="Örn. TR-2026-001"></label>
      <label class="formfield">Giriş lotu<select class="select" id="transfer-lot">${lots
        .filter((l) => l.available > 0)
        .map(
          (l) =>
            `<option value="${h(l.id)}">${h(l.id)} · ${l.available} işlenmemiş</option>`,
        )
        .join("")}</select></label>
      <label class="formfield">Hedef iş emri<select class="select" id="transfer-target">${targets.map((t) => `<option value="${h(t.id)}">${h(t.id)} · ${h(t.machine || "Makine atanmamış")}</option>`).join("")}</select></label>
      <label class="formfield">Transfer adedi<input class="input" id="transfer-qty" type="number" min="1" step="1" value="${Math.min(25, b.unprocessed)}"></label>
      <label class="formfield">Transfer / geri alma gerekçesi<input class="input" id="transfer-reason" placeholder="Makine değişimi, yanlış hedef…"></label>
      <button class="btn primary full" data-source="${h(j.id)}" onclick="RitimUXTransfers.issue(this.dataset.source)" ${!targets.length || !b.unprocessed || state.user !== "Yönetici" ? "disabled" : ""}>Fiziksel Transferi Gönder</button>
      ${!targets.length ? '<p class="tiny">Aynı operasyonda açık hedef iş emri yok. İş emirleri ekranından hedef oluşturun. Operasyon ve bölünmüş plan yönetimi ayrı geliştirme kapsamındadır.</p>' : ""}
      ${rows
        .map(
          (
            t,
          ) => `<div class="card pad" style="margin-top:12px;overflow-wrap:anywhere"><b>${h(t.id)} · ${t.qty} adet</b><p>${h(t.source)} → ${h(t.destination)}<br>${h(label[t.status])}</p><p class="tiny">${h(t.inputLot)} → ${h(t.outputLot)}<br>${h(t.reason)}</p>
      ${t.status === "in_transit" && t.destination === j.id ? `<button class="btn primary full" data-movement="${h(t.id)}" onclick="RitimUXTransfers.accept(this.dataset.movement)" ${state.user !== "Yönetici" ? "disabled" : ""}>Fiziksel Teslimi Kabul Et</button>` : ""}
      ${t.status !== "reversed" && t.source === j.id ? `<label class="tiny"><input type="checkbox" data-return-confirm="${h(t.id)}"> Parçaların kaynakta olduğunu doğruluyorum</label><button class="btn full" data-movement="${h(t.id)}" onclick="RitimUXTransfers.reverse(this.dataset.movement)" ${state.user !== "Yönetici" ? "disabled" : ""}>Kaynağa Dönüşü Onayla</button>` : ""}
      <details><summary>Hareket geçmişi</summary>${(Array.isArray(t.history)
        ? t.history
        : []
      )
        .filter(Boolean)
        .map(
          (e) =>
            `<p class="tiny">${h(e.action)} · ${h(e.user)} · ${h(e.time)} · ${h(e.reason || "")}</p>`,
        )
        .join("")}</details></div>`,
        )
        .join("")}
      <p class="tiny">Kabul ve geri alma tüm hareket adedini kapsar. Kısmi transfer için ayrı hareketler oluşturun. Geri alma yalnızca lot bütünüyle işlenmemişse ve kaynakta fiziksel dönüş doğrulandıysa yapılır.</p>
    </div>`;
  }
  function commit(command, args) {
    return commitState((draft) => RitimTransfers[command](draft, args), {
      command: { kind: "transfers." + command, args },
      success: "İşlem kaydedildi",
    });
  }
  const previousRender = render;
  render = function () {
    if (view !== "transfers") return previousRender();
    const j = job(selectedJob) || state.jobs[0];
    el("app").innerHTML = shell();
    const title = document.querySelector(".header h1");
    if (title) title.textContent = "Fiziksel Transferler";
    el("page").innerHTML = j
      ? `<div class="ux05-wrap"><div class="card pad"><label class="formfield">Transfer iş emri<select class="select" onchange="RitimUXTransfers.open(this.value)">${state.jobs.map((t) => `<option value="${h(t.id)}" ${t.id === j.id ? "selected" : ""}>${h(t.id)} · ${h(t.machine || "Makine atanmamış")}</option>`).join("")}</select></label><p class="tiny">Makine ataması olmadan da iş emrinin fiziksel teslimi burada kabul edilebilir.</p></div>${panel(j)}</div>`
      : '<div class="empty">İş emri yok.</div>';
  };
  const previousShell = shell;
  shell = function () {
    return previousShell().replace(
      '<div class="sidebar-note">',
      '<button class="side-btn" onclick="RitimUXTransfers.open()">Fiziksel Transferler</button><div class="sidebar-note">',
    );
  };
  window.RitimUXTransfers = {
    panel,
    open(id) {
      selectedJob = id || selectedJob;
      go("transfers");
    },
    issue(source) {
      return commit("issue", {
        id: val("transfer-id"),
        source,
        destination: val("transfer-target"),
        inputLot: val("transfer-lot"),
        qty: Number(val("transfer-qty")),
        reason: val("transfer-reason"),
      });
    },
    accept(id) {
      return commit("accept", { id });
    },
    reverse(id) {
      const returned = [
        ...document.querySelectorAll("[data-return-confirm]"),
      ].some((e) => e.dataset.returnConfirm === id && e.checked);
      return commit("reverse", {
        id,
        reason: val("transfer-reason"),
        returned,
      });
    },
  };
})();
