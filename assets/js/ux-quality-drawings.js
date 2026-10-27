(function () {
  "use strict";
  const h = esc;
  function commit(api, command, args) {
    return commitState((draft) => api[command](draft, args), {
      command: {
        kind: (api === RitimDrawings ? "drawings." : "quality.") + command,
        args,
      },
      success: "İşlem kaydedildi",
    });
  }
  const operator = operatorJob;
  operatorJob = function (j) {
    const v = RitimDrawings.current(state, j.order);
    return (
      `${v ? `<div class="card pad"><h3>Çizim Revizyonu ${h(v.revision)}</h3><p>${h(v.reason)}</p><button class="btn" onclick="showDrawing(${jsArg(j.order)})">Güncel Çizimi Aç</button><button class="btn" onclick="RitimQC.ack(${jsArg(j.id)})" ${RitimDrawings.acknowledged(state, j) ? "disabled" : ""}>Revizyonu Okudum ve Onayladım</button></div>` : ""}` +
      operator(j)
    );
  };
  const block = drawingBlock;
  drawingBlock = function (o) {
    return (
      block(o) +
      `<div class="card pad"><h3>Çizim Revizyon Yönetimi</h3><label class="formfield">Yeni revizyon adı<input class="input" id="drawing-revision" placeholder="Örn. B"></label><label class="formfield">Değişiklik gerekçesi<input class="input" id="drawing-reason"></label><p class="tiny">Bu alanları doldurup yukarıdaki dosya seçimiyle yeni revizyonu yükleyin. Önceki dosyalar korunur.</p>${RitimDrawings.list(
        state,
        o.id,
      )
        .map(
          (v) =>
            `<button class="btn full" onclick="RitimQC.version(${jsArg(o.id)},${jsArg(v.id)})">Rev ${h(v.revision)} · ${h(v.reason)}</button>`,
        )
        .join("")}</div>`
    );
  };
  uploadDrawing = function (e, id) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1900000) return toast("1.9 MB altı dosya seçin");
    const revision = el("drawing-revision")?.value,
      reason = el("drawing-reason")?.value;
    if (!revision?.trim() || !reason?.trim())
      return toast("Önce revizyon adı ve gerekçeyi yazın");
    if (!RitimConcurrencyUI.beginFileRead()) return;
    const reader = new FileReader();
    reader.onerror = () => {
      RitimConcurrencyUI.endFileRead();
      toast("Dosya okunamadı");
    };
    reader.onload = () => {
      RitimConcurrencyUI.endFileRead();
      return commit(RitimDrawings, "add", {
        order: id,
        revision,
        reason,
        url: reader.result,
        name: f.name,
      });
    };
    try {
      reader.readAsDataURL(f);
    } catch (e) {
      RitimConcurrencyUI.endFileRead();
      toast("Dosya okunamadı");
    }
  };
  function quality() {
    const tasks = (state.reworkTasks || []).filter((t) => t.remaining > 0);
    return `<div class="card pad"><h3>Rework İş Emirleri</h3>${state.jobs
      .filter(
        (j) =>
          (j.ux05?.rework || 0) >
          (state.reworkTasks || [])
            .filter((t) => t.job === j.id)
            .reduce((n, t) => n + t.remaining, 0),
      )
      .map(
        (j) =>
          `<p>Eski rework: ${h(j.id)} — kaynak kontrol ve lot bilinmiyor.</p><input class="input" id="legacy-rw-${h(j.id)}" placeholder="Kaynak açıklaması / gerekçe"><button class="btn full" onclick="RitimQC.legacy(${jsArg(j.id)})">Eski Bakiyeyi Rework İşine Bağla</button>`,
      )
      .join(
        "",
      )}${tasks.map((t) => `<div class="card pad"><b>${h(t.id)}</b><p>${h(t.job)} · ${h(t.defect)}</p><label class="formfield">Rework operatörü<select class="select" id="rwo-${h(t.id)}">${RitimWorkforce.operators.map((u) => `<option ${u === t.owner ? "selected" : ""}>${h(u)}</option>`).join("")}</select></label><button class="btn" onclick="RitimQC.assign(${jsArg(t.id)})">Rework Operatörü Ata</button><p>Kalan: ${t.remaining} · İşlenmiş / kontrol bekliyor: ${t.executed}</p><p class="tiny">Kaynak kontrol: ${h(t.inspection)} · Girdi: ${t.inputLots.map(h).join(", ")}</p><label class="formfield">Yeniden işlenen adet<input class="input" id="rw-${h(t.id)}" type="number" min="1" value="${t.remaining - t.executed}"></label><button class="btn full" onclick="RitimQC.execute(${jsArg(t.id)})">Yeniden İşlemeyi Kaydet</button><button class="btn full" onclick="RitimUX.openProduction(${jsArg(t.job)})">Kalite Sonucunu Gir</button></div>`).join("") || "<p>Açık rework işi yok.</p>"}</div><div class="card pad"><h3>Operasyon Öz Kontrol Politikası</h3><p class="tiny">Yönetici onayı varsayılandır. Seçili operatöre yalnızca belirtilen operasyon için öz kontrol izni verilir. Koşullu sevkiyat kapalıdır.</p><label class="formfield">İş emrinin operasyonu<select id="policy-job" class="select">${state.jobs.map((j) => `<option value="${h(j.id)}">${h(j.id)} · ${h(jo(j).id)} · ${j.op + 1}</option>`).join("")}</select></label><label class="formfield">Öz kontrol kullanıcısı<select id="policy-user" class="select"><option value="">Yalnızca yönetici</option>${RitimWorkforce.operators.map((u) => `<option>${u}</option>`).join("")}</select></label><button class="btn full" onclick="RitimQC.policy()">Politikayı Kaydet</button></div>`;
  }
  const oldRender = render;
  render = function () {
    oldRender();
    if (view === "quality")
      el("page").insertAdjacentHTML("beforeend", quality());
  };
  window.RitimQC = {
    assign(id) {
      return commit(RitimQuality, "assign", {
        id,
        owner: el("rwo-" + id)?.value,
      });
    },
    legacy(id) {
      return commit(RitimQuality, "registerLegacy", {
        job: id,
        reason: el("legacy-rw-" + id)?.value,
      });
    },
    zoom(delta) {
      zoom = Math.max(0.5, Math.min(3, zoom + delta));
      const child = document.querySelector(
        ".tech-stage iframe,.tech-stage img",
      );
      if (child) {
        child.style.transformOrigin = "0 0";
        child.style.transform = `scale(${zoom})`;
      }
    },
    execute(id) {
      return commit(RitimQuality, "execute", {
        id,
        qty: Number(el("rw-" + id)?.value),
      });
    },
    policy() {
      const j = job(el("policy-job")?.value),
        u = el("policy-user")?.value;
      if (j)
        return commit(RitimQuality, "policy", {
          order: j.order,
          operation: j.op,
          users: u ? [u] : [],
        });
    },
    ack(id) {
      return commit(RitimDrawings, "acknowledge", { job: id });
    },
    version(orderId, id) {
      const v = RitimDrawings.list(state, orderId).find((v) => v.id === id);
      if (!v) return;
      showDrawing(orderId);
      const stage = document.querySelector(".tech-stage");
      if (stage)
        stage.innerHTML =
          /\.pdf$/i.test(v.url) || v.url.startsWith("data:application/pdf")
            ? `<iframe title="Teknik resim PDF" src="${h(v.url)}"></iframe>`
            : `<img src="${h(v.url)}" alt="Rev ${h(v.revision)}">`;
      document.querySelector(".modal-head h2").textContent =
        orderId + " · Rev " + v.revision;
    },
  };
  render();
})();
