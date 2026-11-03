/* Capture intent before awaiting locks. Remote changes never rerender an open form. */
(function () {
  "use strict";
  let pending = null,
    edits = 0,
    gesture = 0,
    lastGesture = 0,
    stale = false,
    installed = false,
    fileRead = null,
    finishFileRead = null;
  const cacheKey = "ritim-flow-lite:intents:" + KEY;
  let recoveryDraft = null;
  const identity = (e) =>
    e.id
      ? "#" + CSS.escape(e.id)
      : e.dataset.wiz
        ? '[data-wiz="' + CSS.escape(e.dataset.wiz) + '"]'
        : e.dataset.returnConfirm
          ? '[data-return-confirm="' +
            CSS.escape(e.dataset.returnConfirm) +
            '"]'
          : e.classList.contains("user-select")
            ? ".user-select"
            : null;
  const form = () =>
    [...document.querySelectorAll("input,select,textarea")]
      .filter((e) => e.type !== "file" && identity(e))
      .map((e) => ({
        selector: identity(e),
        value: e.value,
        checked: e.checked,
      }));
  const restore = (fields) =>
    fields.forEach((f) => {
      const e = document.querySelector(f.selector);
      if (e && e.type !== "file") {
        e.value = f.value;
        if ("checked" in e) e.checked = f.checked;
      }
    });
  function attachRecoveryDraft() {
    if (!recoveryDraft || document.getElementById("concurrency-draft-export"))
      return;
    const panel = document.querySelector("[data-recovery]");
    if (!panel) return;
    const note = document.createElement("p");
    note.textContent =
      "Kaydedilmemiş alanlar bu sekmede korunuyor. Sekmeyi kapatmadan önce ayrı taslak olarak indirebilirsiniz.";
    const button = document.createElement("button");
    button.id = "concurrency-draft-export";
    button.className = "btn full";
    button.textContent = "Kaydedilmemiş Alanları İndir";
    button.onclick = () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(recoveryDraft, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "ritim-unsaved-form.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    panel.append(note, button);
  }
  function notice(message) {
    let box = document.getElementById("concurrency-notice");
    if (!box) {
      box = document.createElement("aside");
      box.id = "concurrency-notice";
      box.setAttribute("role", "status");
      document.body.insertBefore(box, document.getElementById("app"));
    }
    box.replaceChildren();
    box.hidden = !message;
    if (!message) return;
    const text = document.createElement("span");
    text.textContent = message;
    box.append(text);
    if (stale) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = "Güncel Kaydı Yükle (Alanları Koru)";
      b.onclick = refresh;
      box.append(b);
    }
  }
  function lockSupported() {
    try {
      return typeof navigator.locks?.request === "function";
    } catch (e) {
      return false;
    }
  }
  function check() {
    const c = dataSession.check();
    stale = c.changed;
    if (stale)
      notice(
        "Bu görünüm eski. Yazdığınız alanlar korunuyor; yeni işlem güncel kayıt altında yeniden doğrulanır.",
      );
    else if (!lockSupported())
      notice(
        "Güvenli sekme kilidi desteklenmiyor. Kayıt işlemleri kapalı; okuma ve ham veri kurtarma kullanılabilir.",
      );
    else if (!state.transactionState)
      notice(
        "Sekme koruması etkin. İlk yeni kayıtla revizyon ve komut günlüğü eklenir; mevcut kayıtlar dönüştürülmez.",
      );
    else if (!pending) notice("");
  }
  function refresh() {
    if (pending || fileRead)
      return toast(
        "Önce mevcut işlemin veya dosya okumanın sonucunu bekleyin.",
      );
    const fields = form(),
      actor = state.user;
    dataSession.reload();
    if (dataSession.ready) {
      state = dataSession.snapshot();
      state.user = actor;
      recoveryVisible = false;
      render();
      restore(fields);
    } else {
      recoveryDraft = { fields };
      renderRecovery();
      attachRecoveryDraft();
    }
    check();
  }
  async function submit(mutate, { success, after, command, commandId }) {
    if (bootstrapRequired) {
      const message = "Demo güvenli şekilde başlatılmadan kayıt yapılamaz.";
      toast(message);
      return {ok:false, code:"DEMO_NOT_INITIALIZED", message};
    }
    const intent = command || {
        kind: "custom",
        args: { source: String(mutate), view, chosenJob, fields: form() },
      },
      actor = state.user;
    const signature = JSON.stringify({ intent, actor });
    if (fileRead) {
      const r = {
        ok: false,
        message: "Dosya okuma sürüyor. İşlem kaydedilmedi; sonucu bekleyin.",
      };
      toast(r.message);
      return r;
    }
    if (pending) {
      if (pending.signature === signature)
        return pending.promise.then((r) => ({ ...r, duplicate: true }));
      const r = {
        ok: false,
        message:
          "Bu sekmede bir işlem sürüyor. İşlem kaydedilmedi; sonucu bekleyin.",
      };
      toast(r.message);
      return r;
    }
    const startEdits = edits,
      fields = form();
    const job = { signature, promise: null };
    pending = job;
    // Defer a tick so repeated calls see the same in-flight command immediately.
    job.promise = Promise.resolve()
      .then(async () => {
        let id = commandId,
          cache = {},
          digest;
        try {
          digest = await RitimTransactions.fingerprint(intent, actor);
          cache = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
          if (
            !cache ||
            Array.isArray(cache) ||
            typeof cache !== "object" ||
            Object.entries(cache).some(
              ([k, v]) =>
                !/^[a-f0-9]{64}$/.test(k) ||
                !v ||
                typeof v.id !== "string" ||
                !v.id ||
                !Number.isSafeInteger(v.gesture) ||
                typeof v.done !== "boolean",
            )
          )
            throw Error("invalid intent cache");
          const saved = cache[digest];
          if (!id)
            id =
              saved && (!saved.done || saved.gesture === gesture)
                ? saved.id
                : crypto.randomUUID();
          cache[digest] = { id, gesture, done: false };
          sessionStorage.setItem(cacheKey, JSON.stringify(cache));
        } catch (e) {
          const r = {
            ok: false,
            message: "İşlem kimliği güvenle saklanamadı. İşlem kaydedilmedi.",
          };
          toast(r.message);
          return r;
        }
        const r = await dataSession.commit(mutate, { id, actor, intent });
        if (!r.ok) {
          if (!dataSession.ready) {
            recoveryDraft = {
              fields: form(),
              command: intent,
              commandId: id,
              actor,
            };
            recoveryVisible = true;
            renderRecovery();
            attachRecoveryDraft();
          }
          toast(r.message || "İşlem kaydedilmedi");
          check();
          return r;
        }
        // Failure to mark an acknowledgement is safe: the durable snapshot receipt deduplicates retry.
        try {
          cache[digest] = { id, gesture, done: true };
          sessionStorage.setItem(cacheKey, JSON.stringify(cache));
        } catch (e) {}
        const newerEdits = edits !== startEdits ? form() : null;
        state = r.state;
        if (r.duplicate) {
          render();
          restore(newerEdits || fields);
          toast(r.message);
        } else {
          after();
          if (newerEdits) restore(newerEdits);
          if (success || r.message) toast(success || r.message);
        }
        return r;
      })
      .catch(() => {
        const r = {
          ok: false,
          message:
            "İşlem sonucu alınamadı. Tekrar göndermeden Veri Güvenliği ekranında kaydı inceleyin.",
        };
        toast(r.message);
        return r;
      })
      .finally(() => {
        pending = null;
        check();
      });
    return job.promise;
  }
  function install() {
    if (installed) return;
    installed = true;
    document.addEventListener(
      "input",
      () => {
        edits++;
        if (!pending) gesture++;
      },
      true,
    );
    document.addEventListener(
      "change",
      () => {
        edits++;
        if (!pending) gesture++;
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      (e) => {
        const now = performance.now();
        if (
          e.isTrusted &&
          e.target.closest("button") &&
          !pending &&
          now - lastGesture > 500
        )
          gesture++;
        lastGesture = now;
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (
          e.isTrusted &&
          !e.repeat &&
          ["Enter", " "].includes(e.key) &&
          e.target.closest("button") &&
          !pending
        ) {
          const now = performance.now();
          if (now - lastGesture > 500) gesture++;
          lastGesture = now;
        }
      },
      true,
    );
    window.addEventListener("storage", (e) => {
      if (e.key === KEY || e.key === null) check();
    });
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    check();
  }
  window.RitimConcurrencyUI = {
    submit,
    install,
    refresh,
    check,
    attachRecoveryDraft,
    restoreRecovered() {
      if (recoveryDraft) {
        restore(recoveryDraft.fields);
        recoveryDraft = null;
      }
    },
    beginFileRead() {
      if (pending || fileRead) {
        toast("Önce mevcut işlemin sonucunu bekleyin.");
        return false;
      }
      fileRead = new Promise((resolve) => (finishFileRead = resolve));
      return true;
    },
    endFileRead() {
      finishFileRead?.();
      fileRead = null;
      finishFileRead = null;
    },
    idle: () =>
      fileRead
        ? fileRead.then(() => pending?.promise)
        : pending?.promise || Promise.resolve(),
  };
  // Explicit serialized command entry for integrations; every route uses the same protected commit.
  window.RitimCommands = {
    submit(kind, args, { id } = {}) {
      const [group, method] = kind.split(".");
      const api = {
        stock: window.RitimStock,
        planning: window.RitimPlanning,
        transfers: window.RitimTransfers,
        quality: window.RitimQuality,
        drawings: window.RitimDrawings,
        workforce: window.RitimWorkforce,
        shipping: window.RitimShipping,
      }[group];
      const payload = structuredClone(args);
      return commitState(
        (d) => {
          if (!api || typeof api[method] !== "function")
            return { ok: false, message: "Komut bulunamadı." };
          return group === "shipping"
            ? api[method](d, payload.order, payload)
            : api[method](d, payload);
        },
        { command: { kind, args: payload }, commandId: id },
      );
    },
  };
})();
