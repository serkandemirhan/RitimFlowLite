/* UX-05: operator workflow extension on top of existing demo, localStorage only. */
(function () {
  "use strict";
  const html = (v) =>
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
  const field = (id) => document.getElementById(id);
  function amount(id, input) {
    const value = input[id];
    if (value == null || !value.trim() || !Number.isInteger(Number(value)))
      return NaN;
    return Number(value);
  }
  function plan(j) {
    return RitimQuantities.jobBalance(j, jo(j), state).planned;
  }
  function ledger(j, write = false) {
    const historic = j.good + j.scrap;
    const x = j.ux05 || {
      received: historic,
      pending: 0,
      setup: 0,
      rework: 0,
      allocatable: 0,
      handover: null,
      receipts: [],
      legacyBaseline: historic,
      legacyGood: j.good,
    };
    if (write && !j.ux05) j.ux05 = x;
    return x;
  }
  function used(j, s = state) {
    return RitimQuantities.jobBalance(
      j,
      s.orders.find((o) => o.id === j.order),
      s,
    ).used;
  }
  function unprocessed(j, s = state) {
    return RitimQuantities.jobBalance(
      j,
      s.orders.find((o) => o.id === j.order),
      s,
    ).unprocessed;
  }
  function eligibleStart(j, s = state) {
    return unprocessed(j, s) > 0;
  }
  function record(s, j, type, n, detail) {
    s.events.unshift({
      job: j.id,
      machine: j.machine || "—",
      user: s.user,
      type,
      qty: n,
      time: new Date().toISOString(),
      ...(detail ? { detail } : {}),
    });
  }
  const fail = (message) => ({ ok: false, message });
  function guardJob(j) {
    if (!j) throw Error("İş emri bulunamadı");
  }
  function sampleReceive(id, state, input) {
    const j = state.jobs.find((j) => j.id === id);
    guardJob(j);
    if (window.RitimWorkforce && !RitimWorkforce.canWork(state, j))
      return fail("Önce işi devralın veya atanmış operatörü seçin");
    const x = ledger(j, true),
      n = amount("ux05-receive", input),
      b = RitimQuantities.jobBalance(
        j,
        state.orders.find((o) => o.id === j.order),
        state,
      );
    if (j.op !== 0)
      return fail(
        "Sonraki operasyon girdisini Planlama ekranından fiziksel kabul edin",
      );
    if (j.state === "complete" || j.state === "shipped")
      return fail("Tamamlanmış iş emrine teslim yapılamaz");
    if (!(n > 0) || n > b.unstarted - b.awaitingTransfer)
      return fail("Teslim miktarı planlanan iş emrini aşamaz");
    const ux = window.RitimUX07Ledger;
    if (!ux) return fail("Malzeme tahsis modülü bulunamadı");
    const o = state.orders.find((o) => o.id === j.order);
    const allocated = RitimQuantities.allocation(state, o.id, j.id);
    if (n + x.received - x.legacyBaseline > allocated)
      return fail(
        "UX-06 üzerinden bu iş emrine tahsis edilen malzeme yetersiz",
      );
    x.received += n;
    x.receipts.push({
      qty: n,
      user: state.user,
      time: new Date().toISOString(),
    });
    record(
      state,
      j,
      "physical_receive",
      n,
      "Fiziksel teslim demo onayı; gerçek stok rezervasyonu henüz bağlı değil",
    );
    return { ok: true, message: n + " adet teslim alındı" };
  }
  function logProduction(id, state, input) {
    const j = state.jobs.find((j) => j.id === id);
    guardJob(j);
    const x = ledger(j, true),
      n = amount("ux05-qty", input),
      type = input["ux05-type"];
    if (window.RitimWorkforce && !RitimWorkforce.canWork(state, j))
      return fail("İş başka operatöre atanmış");
    if (!j.machine) return fail("İş emrine makine atayın");
    if (window.RitimDrawings && !RitimDrawings.acknowledged(state, j))
      return fail("Güncel çizim revizyonunu okuyup onaylayın");
    if (j.state !== "running" || x.handover)
      return fail("İş aktif ve devredilmiş olmalı");
    if (!(n > 0) || n > unprocessed(j, state))
      return fail("Henüz işlenmeyen miktarı aşamazsınız");
    if (
      type === "good" &&
      !(window.RitimQuality
        ? RitimQuality.canSelf(state, j)
        : state.user === "Yönetici")
    )
      return fail(
        "Doğrudan sağlam kaydı sadece yetkili öz kontrol kullanıcıları için",
      );
    if (!["good", "pending", "scrap", "setup"].includes(type)) return;
    const consumed = RitimTransfers.consume(state, j, n, type);
    if (!consumed.ok) return fail(consumed.message);
    if (type === "good") j.good += n;
    else if (type === "pending") x.pending += n;
    else if (type === "scrap") j.scrap += n;
    else if (type === "setup") x.setup += n;
    else return;
    record(
      state,
      j,
      "ux05_" + type,
      n,
      type === "setup" || type === "scrap"
        ? "Firenin nedeni demo ortamında ayrıntılandırılmalıdır"
        : "",
    );
    return { ok: true, message: n + " adet kaydedildi" };
  }
  function inspect(id, state, input) {
    const j = state.jobs.find((j) => j.id === id);
    guardJob(j);
    const x = ledger(j, true);
    if (state.user !== "Yönetici")
      return fail(
        "Kontrol sonuçları yetkili kullanıcı tarafından onaylanmalıdır",
      );
    const good = amount("ux05-ig", input),
      scrap = amount("ux05-is", input),
      rework = amount("ux05-ir", input);
    if (
      [good, scrap, rework].some((n) => !Number.isInteger(n) || n < 0) ||
      good + scrap + rework < 1 ||
      good + scrap + rework > x.pending
    )
      return fail("Kontrol toplamı kontrol bekleyen miktarı aşamaz");
    const result = RitimQuality.inspect(state, {
      job: id,
      good,
      scrap,
      rework,
      defect: input["quality-defect"] || "Kontrolde yeniden işlem gereği",
    });
    if (!result.ok) return fail(result.message);
    record(
      state,
      j,
      "inspection",
      good + scrap + rework,
      `Sağlam ${good}, hurda ${scrap}, rework ${rework}`,
    );
    return { ok: true, message: "Kontrol sonuçları onaylandı" };
  }
  function reworkInspect(id, state, input) {
    const j = state.jobs.find((j) => j.id === id);
    guardJob(j);
    const x = ledger(j, true);
    if (state.user !== "Yönetici")
      return fail("Rework sonucu yetkili tarafından onaylanmalıdır");
    const good = amount("ux05-rg", input),
      scrap = amount("ux05-rs", input);
    if (
      [good, scrap].some((n) => !Number.isInteger(n) || n < 0) ||
      good + scrap < 1 ||
      good + scrap > x.rework
    )
      return fail("Rework bakiyesini aşan işlem");
    const result = RitimQuality.rework(state, {
      job: id,
      task: input["quality-task"],
      good,
      scrap,
    });
    if (!result.ok) return fail(result.message);
    record(
      state,
      j,
      "rework_result",
      good + scrap,
      `Yeniden kontrol: sağlam ${good}, hurda ${scrap}`,
    );
    return { ok: true, message: "Rework sonucu kaydedildi" };
  }
  function pause(id, state, input) {
    const j = state.jobs.find((j) => j.id === id),
      reason = input["ux05-pause-reason"] || "Diğer";
    if (window.RitimWorkforce && !RitimWorkforce.canWork(state, j))
      return fail("İş başka operatöre atanmış");
    if (j.state !== "running")
      return fail("Yalnızca çalışan iş duraklatılabilir");
    j.state = "paused";
    record(state, j, "pause", 0, reason);
    return { ok: true, message: "Duruş nedeni kaydedildi" };
  }
  function resume(id, state, input) {
    const j = state.jobs.find((j) => j.id === id);
    if (!j.machine) return fail("Devam etmeden önce makine atayın");
    if (window.RitimDrawings && !RitimDrawings.acknowledged(state, j))
      return fail("Güncel çizim revizyonunu okuyup onaylayın");
    if (window.RitimWorkforce && !RitimWorkforce.canWork(state, j))
      return fail("İş başka operatöre atanmış");
    if (j.state !== "paused" || ledger(j, true).handover)
      return fail("Devredilmeyi bekleyen iş devam ettirilemez");
    j.state = "running";
    record(state, j, "start", 0, "Üretime devam");
    return { ok: true, message: "Üretim devam ediyor" };
  }
  function start(id, state, input) {
    const j = state.jobs.find((j) => j.id === id),
      x = ledger(j, true);
    if (!j.machine) return fail("Önce bu iş emrine makine atayın");
    if (window.RitimDrawings && !RitimDrawings.acknowledged(state, j))
      return fail("Güncel çizim revizyonunu okuyup onaylayın");
    if (window.RitimWorkforce && !RitimWorkforce.canWork(state, j))
      return fail("İş başka operatöre atanmış");
    if (x.handover) return fail("Önce vardiya devralma gerekli");
    if (!eligibleStart(j, state))
      return fail("Önce üretilecek parçaları fiziksel teslim al");
    j.state = "running";
    record(state, j, "start", 0, "Teslim alınan miktar doğrulandı");
    return { ok: true, message: "İş başladı" };
  }
  function handover(id, state, input) {
    const j = state.jobs.find((j) => j.id === id),
      x = ledger(j, true),
      note = input["ux05-handover-note"]?.trim();
    if (window.RitimWorkforce && !RitimWorkforce.canWork(state, j))
      return fail("İş başka operatöre atanmış");
    if (!note) return fail("Devir notu yazılmalı");
    if (!["running", "paused"].includes(j.state))
      return fail("Önce işi başlat");
    x.handover = { from: state.user, note, time: new Date().toISOString() };
    j.state = "paused";
    record(state, j, "shift_handover", 0, note);
    return { ok: true, message: "Yeni operatör devri bekleniyor" };
  }
  function takeOver(id, state, input) {
    const j = state.jobs.find((j) => j.id === id),
      x = ledger(j, true);
    if (!x.handover) return;
    if (state.user === x.handover.from)
      return fail("Devri farklı bir operatör almalı");
    const old = x.handover.from;
    x.handover = null;
    j.owner = state.user;
    record(state, j, "shift_takeover", 0, `${old} → ${state.user}`);
    return { ok: true, message: "Devir alındı; iş duraklatılmış durumda" };
  }
  function close(id, state, input) {
    const j = state.jobs.find((j) => j.id === id),
      x = ledger(j, true);
    if (window.RitimWorkforce && !RitimWorkforce.canWork(state, j))
      return fail("İş başka operatöre atanmış");
    if (j.state === "complete" || j.state === "shipped")
      return fail("İş zaten kapalı");
    if (
      x.pending ||
      x.rework ||
      unprocessed(j, state) ||
      RitimQuantities.jobBalance(
        j,
        state.orders.find((o) => o.id === j.order),
        state,
      ).unstarted
    )
      return fail(
        "Açık kontrol/rework/işlenmemiş veya işe alınmamış miktar var; iş emri kapatılamaz",
      );
    j.state = "complete";
    record(
      state,
      j,
      "finish",
      0,
      "Kontrol edilmiş miktarlar ile üretim kapatıldı",
    );
    return { ok: true, message: "Üretim kapatıldı" };
  }
  const name = {
    physical_receive: "Fiziksel parça teslimi",
    ux05_pending: "Kontrol bekleyen",
    ux05_good: "Yetkili öz kontrol · sağlam",
    ux05_scrap: "Üretim hurdası",
    ux05_setup: "Ayar firesi",
    inspection: "Kontrol onayı",
    rework_result: "Rework kontrolü",
    shift_handover: "Vardiya devri",
    shift_takeover: "İşi devralma",
  };
  const oldEventsMarkup = eventsMarkup;
  eventsMarkup = function (items) {
    return oldEventsMarkup(
      items.map((e) => (name[e.type] ? { ...e, type: e.type } : e)),
    ).replace(
      /<b>(physical_receive|ux05_pending|ux05_good|ux05_scrap|ux05_setup|inspection|rework_result|shift_handover|shift_takeover)<\/b>/g,
      (_, key) => "<b>" + name[key] + "</b>",
    );
  };
  operatorJob = function (j) {
    const o = jo(j),
      x = ledger(j),
      b = RitimQuantities.jobBalance(j, o, state),
      total = plan(j),
      remaining = unprocessed(j),
      receivedOpen = b.unstarted;
    const finished = j.good + j.scrap + x.pending + x.setup + x.rework;
    return `<div class="ux05-wrap">
 <div class="card ux05-hero">
  <div class="ux05-top"><div><div class="eyebrow">${html(j.id)} · ${html(o.customer)}</div><h2>${html(o.part)}</h2><div class="tiny">${html(o.route?.[j.op] || "İmalat")} · ${html(j.machine)} · Rev ${html(o.revision)}</div></div><button class="btn sm" onclick="showDrawing(${jsArg(o.id)})">${I("image", 16)} Çizim</button></div>
  <div class="ux05-progress"><strong>${j.good} <small>/ ${total} sağlam</small></strong>${badge(j.state)}</div>
  ${prog(j.good, total)}
  <div class="ux05-metrics">
   ${[
     ["Fiziksel alınan", b.received],
     ["Sağlam (toplam üretim)", j.good],
     ["Kontrol bekleyen", x.pending],
     ["Üretim hurdası", j.scrap],
     ["Ayar firesi", x.setup],
     ["Rework bekleyen", x.rework],
     ["Henüz işlenmeyen", remaining],
     ["İşe alınmamış", receivedOpen],
     ["Transfer çıkışı", b.transferredOut],
     ["Yolda", b.inTransit],
     ["Transfer kabulü", b.transferredIn],
   ]
     .map(([t, n]) => `<div><span>${t}</span><strong>${n}</strong></div>`)
     .join("")}
  </div>
  <div class="ux05-balance">${b.received} işe alınan = ${finished} sonuçlanan/bekleyen + ${remaining} henüz işlenmeyen${b.transferredOut ? ` + ${b.transferredOut} transfer çıkışı` : ``}</div>
 </div>
 ${window.RitimUXTransfers ? RitimUXTransfers.panel(j) : ""}
 ${x.handover ? `<div class="card pad ux05-handover"><strong>Vardiya devri bekleniyor</strong><p>${html(x.handover.note)}</p><p class="tiny">Devreden: ${html(x.handover.from)}</p><button class="btn primary full" onclick="RitimUX05.takeOver(${jsArg(j.id)})">İşi Devral</button></div>` : ""}
 <div class="card pad ux05-block"><h3>1 · Fiziksel Malzeme Teslimi</h3><p class="tiny">UX-06 iş emri tahsisi doğrulanır. İlk malzeme girişini Malzeme / Fason ekranından yapın.</p>
 <div class="ux05-inline"><input id="ux05-receive" class="input" type="number" min="1" step="1" inputmode="numeric" value="${receivedOpen > 0 ? Math.min(10, receivedOpen) : 0}" aria-label="Teslim miktarı"><button class="btn primary" ${!receivedOpen || ["complete", "shipped"].includes(j.state) ? "disabled" : ""} onclick="RitimUX05.receive(${jsArg(j.id)})">Teslim Aldım</button></div>
 </div>
 <div class="card pad ux05-block"><h3>2 · Üretim Kaydı</h3>
 <div class="ux05-inline"><select id="ux05-type" class="select" aria-label="Üretim sonucu">
 <option value="pending">Kontrol Bekleyen</option><option value="good" ${(window.RitimQuality ? RitimQuality.canSelf(state, j) : state.user === "Yönetici") ? "" : "disabled"}>Sağlam · Yetkili Öz Kontrol</option><option value="scrap">Üretim Hurdası</option><option value="setup">Ayar Firesi</option></select>
 <input id="ux05-qty" class="input ux05-number" type="number" min="1" step="1" inputmode="numeric" value="1" aria-label="Adet"></div>
 <button class="btn primary full" ${j.state !== "running" || !!x.handover || remaining === 0 ? "disabled" : ""} onclick="RitimUX05.production(${jsArg(j.id)})">Üretim Sonucunu Kaydet</button>
 <div class="ux05-inline ux05-buttons">${j.state === "running" ? `<select id="ux05-pause-reason" class="select"><option>Makine arızası</option><option>Takım değişimi</option><option>Malzeme bekleme</option><option>Mola</option><option>Diğer</option></select><button class="btn softamber" onclick="RitimUX05.pause(${jsArg(j.id)})">Duraklat</button>` : j.state === "paused" && !x.handover ? `<button class="btn good full" onclick="RitimUX05.resume(${jsArg(j.id)})">Üretime Devam Et</button>` : j.state === "waiting" ? `<button class="btn good full" onclick="RitimUX05.start(${jsArg(j.id)})">İşe Başla</button>` : ""}</div>
 </div>
 <div class="card pad ux05-block"><h3>3 · Kalite Kontrol</h3><p class="tiny">Yalnızca yetkili kullanıcı kontrol sonucunu onaylar. Diğerleri açık miktarı izler.</p>
 <label class="formfield">Kontrol / rework açıklaması<input class="input" id="quality-defect"></label><div class="ux05-three"><label>Sağlam<input id="ux05-ig" type="number" min="0" value="0"></label><label>Hurda<input id="ux05-is" type="number" min="0" value="0"></label><label>Rework<input id="ux05-ir" type="number" min="0" value="0"></label></div>
 <button class="btn full" ${!x.pending || state.user !== "Yönetici" ? "disabled" : ""} onclick="RitimUX05.inspect(${jsArg(j.id)})">Kontrol Sonucunu Onayla (${x.pending} bekliyor)</button>
 <label class="formfield">Kaynak rework işi<select class="select" id="quality-task">${(
   state.reworkTasks || []
 )
   .filter((t) => t.job === j.id && t.remaining > 0)
   .map(
     (t) =>
       `<option value="${html(t.id)}">${html(t.id)} · ${t.executed} kontrol bekliyor</option>`,
   )
   .join(
     "",
   )}</select></label><div class="ux05-three"><label>Rework → Sağlam<input id="ux05-rg" type="number" min="0" value="0"></label><label>Rework → Hurda<input id="ux05-rs" type="number" min="0" value="0"></label></div>
 <button class="btn full" ${!x.rework || state.user !== "Yönetici" ? "disabled" : ""} onclick="RitimUX05.rework(${jsArg(j.id)})">Rework Kontrolünü Onayla</button>
 </div>
 <div class="card pad ux05-block"><h3>4 · Vardiya Devri / Sonuçlandırma</h3><textarea id="ux05-handover-note" class="textarea" rows="2" placeholder="Sonraki operatöre takım, parça ve işlem notları…"></textarea>
 <div class="ux05-inline ux05-buttons"><button class="btn" ${x.handover || !["running", "paused"].includes(j.state) ? "disabled" : ""} onclick="RitimUX05.handover(${jsArg(j.id)})">Vardiya Devret</button><button class="btn" ${j.state === "complete" || j.state === "shipped" ? "disabled" : ""} onclick="RitimUX05.close(${jsArg(j.id)})">İş Emrini Kapat</button></div>
 <p class="tiny">Açık kontrol, rework, henüz işlenmeyen veya işe alınmamış miktar varsa doğrudan kapatma engellenir. Makine değişimi ve plan revizyonu yöneticinin ayrı işlemidir.</p>
 </div></div>`;
  };
  function run(fn, id) {
    const keys =
      {
        sampleReceive: ["ux05-receive"],
        logProduction: ["ux05-qty", "ux05-type"],
        inspect: ["ux05-ig", "ux05-is", "ux05-ir", "quality-defect"],
        reworkInspect: ["ux05-rg", "ux05-rs", "quality-task"],
        pause: ["ux05-pause-reason"],
        handover: ["ux05-handover-note"],
      }[fn.name] || [];
    const input = Object.fromEntries(
      keys.map((key) => [key, document.getElementById(key)?.value]),
    );
    return commitState((d) => fn(id, d, input), {
      command: { kind: "operator." + fn.name, args: { id, input } },
    });
  }
  recordQty = function () {
    toast("Operatör panelindeki yeni kontrollü kaydı kullanın");
  };
  setStatus = function (id, s) {
    return s === "running"
      ? run(start, id)
      : s === "paused"
        ? run(pause, id)
        : { ok: false };
  };
  finishJob = async function () {
    const r = await run(close, chosenJob);
    if (r.ok) closeModal();
    return r;
  };
  window.RitimUX05 = {
    receive: (id) => run(sampleReceive, id),
    production: (id) => run(logProduction, id),
    inspect: (id) => run(inspect, id),
    rework: (id) => run(reworkInspect, id),
    pause: (id) => run(pause, id),
    resume: (id) => run(resume, id),
    start: (id) => run(start, id),
    handover: (id) => run(handover, id),
    takeOver: (id) => run(takeOver, id),
    close: (id) => run(close, id),
  };
})();
