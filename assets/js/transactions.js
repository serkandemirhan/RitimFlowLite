/* P0-08: cooperative same-origin exclusive writer. No unlocked write fallback. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(
    node ? require("./persistence.js") : root.RitimPersistence,
    node ? require("./integrity.js") : root.RitimIntegrity,
  );
  if (node) module.exports = api;
  else root.RitimTransactions = api;
})(globalThis, function (P, I) {
  "use strict";
  const fail = (code, message, extra = {}) => ({
    ok: false,
    code,
    message,
    ...extra,
  });
  const lockName = (key) => "ritim-flow-lite:writer:" + key;
  const revision = (s) => s?.transactionState?.revision || 0;
  function canonical(v) {
    if (v === undefined) return "[undefined]";
    if (typeof v === "number" && !Number.isFinite(v))
      return "[" + String(v) + "]";
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (v && typeof v === "object")
      return (
        "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",") +
        "}"
      );
    return JSON.stringify(v);
  }
  async function fingerprint(intent, actor) {
    const data = new TextEncoder().encode(canonical({ actor, intent }));
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(bytes)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  }
  async function exclusive(locks, key, work) {
    try {
      const manager = locks();
      if (typeof manager?.request !== "function")
        return fail(
          "LOCK_UNSUPPORTED",
          "Bu tarayıcıda güvenli sekme kilidi yok. Kayıt kapalı; desteklenen güvenli bir tarayıcı kullanın.",
        );
      return await manager.request(
        lockName(key),
        { mode: "exclusive", ifAvailable: true },
        (lock) => {
          if (!lock)
            return fail(
              "LOCK_BUSY",
              "Başka bir sekme işlem yapıyor. Kayıt yapılmadı; aynı işlemi yeniden deneyin.",
            );
          if (lock.mode !== "exclusive" || lock.name !== lockName(key))
            return fail(
              "LOCK_INVALID",
              "Özel yazma kilidi doğrulanamadı. Kayıt yapılmadı.",
            );
          return work();
        },
      );
    } catch (e) {
      return fail(
        "LOCK_FAILURE",
        "Sekme kilidine erişilemiyor. İşlem kaydedilmedi.",
      );
    }
  }
  function open({
    storage,
    locks = () => globalThis.navigator?.locks,
    key = P.BASE_KEY,
    initial,
  }) {
    let store = P.open({ storage, key, initial, validateTransaction: I.guard }),
      blocked = "",
      reason = "";
    function reload() {
      store = P.open({ storage, key, initial, validateTransaction: I.guard });
      blocked = "";
      reason = "";
      return store.ready;
    }
    return Object.freeze({
      get key() {
        return key;
      },
      get raw() {
        return store.raw;
      },
      get status() {
        return blocked || store.status;
      },
      get reason() {
        return reason || store.reason;
      },
      get ready() {
        return !blocked && store.ready;
      },
      get revision() {
        return revision(store.snapshot());
      },
      snapshot: () => store.snapshot(),
      reload,
      check() {
        try {
          const raw = storage().getItem(key);
          return {
            changed: raw !== store.raw,
            revision: raw === null ? 0 : revision(P.decode(raw).value),
          };
        } catch (e) {
          return { changed: true, unavailable: true };
        }
      },
      async commit(mutate, { id, actor, intent } = {}) {
        if (blocked || !store.ready)
          return fail(
            "RECOVERY_REQUIRED",
            "Veri kurtarma / sürüm onayı gerekli.",
          );
        if (
          typeof id !== "string" ||
          !id.trim() ||
          id.length > 200 ||
          typeof actor !== "string" ||
          !actor.trim() ||
          !intent?.kind
        )
          return fail(
            "COMMAND_REQUIRED",
            "Benzersiz işlem kimliği, kullanıcı ve komut gerekli.",
          );
        let digest;
        try {
          digest = await fingerprint(intent, actor);
        } catch (e) {
          return fail(
            "COMMAND_INVALID",
            "İşlem kimliği doğrulanamadı. Kayıt yapılmadı.",
          );
        }
        return exclusive(locks, key, () => {
          const latest = P.open({
            storage,
            key,
            initial,
            validateTransaction: I.guard,
          });
          if (!latest.ready) {
            if (latest.status !== "unavailable") store = latest;
            blocked = latest.status;
            reason = latest.reason;
            return fail(
              "RECOVERY_REQUIRED",
              reason || "Güncel veri okunamıyor; kurtarma gerekli.",
            );
          }
          if (
            (latest.raw === null && store.raw !== null) ||
            revision(latest.snapshot()) < revision(store.snapshot())
          ) {
            blocked = "conflict";
            reason =
              "Kayıt silinmiş veya sürümü gerilemiş. Üzerine yazılmadı; yeniden açıp inceleyin.";
            return fail("REVISION_ROLLBACK", reason);
          }
          const before = latest.snapshot();
          const audit = I.validate(before); // Pure, order-scoped guard below decides affected-record safety.
          if (audit.critical.some((f) => f.code === "SCHEMA_INVALID"))
            return fail(
              "INTEGRITY_INVALID",
              "Güncel kayıt şeması doğrulanamadı.",
              { findings: audit.critical },
            );
          const prior = before.transactionState?.commands.find(
            (c) => c.id === id,
          );
          if (prior) {
            if (prior.fingerprint !== digest || prior.actor !== actor)
              return fail(
                "IDEMPOTENCY_CONFLICT",
                "Aynı işlem kimliği farklı içerikle kullanılamaz.",
              );
            store = latest;
            return {
              ok: true,
              duplicate: true,
              commandId: id,
              revision: revision(before),
              state: before,
              message: "İşlem daha önce kaydedilmiş; tekrar uygulanmadı.",
            };
          }
          if (revision(before) === Number.MAX_SAFE_INTEGER)
            return fail(
              "REVISION_EXHAUSTED",
              "İşlem sürüm sınırına ulaşıldı. Kayıt yapılmadı.",
            );
          if (mutate?.constructor?.name === "AsyncFunction")
            return fail(
              "ASYNC_COMMAND",
              "Asenkron taslak komutu desteklenmiyor.",
            );
          const r = latest.commit((d) => {
            d.user = actor; // Local demo actor belongs to this submitted intent, not another tab's selector.
            const result = mutate(d);
            if (result?.then) {
              result.then(
                () => {},
                () => {},
              );
              return fail(
                "ASYNC_COMMAND",
                "Asenkron taslak komutu desteklenmiyor.",
              );
            }
            if (!result?.ok) return result;
            let safeResult;
            try {
              safeResult = structuredClone(result);
            } catch (e) {
              return fail(
                "COMMAND_RESULT_INVALID",
                "Komut sonucu güvenle aktarılabilir değil. İşlem kaydedilmedi.",
              );
            }
            if (
              canonical(d.transactionState) !==
              canonical(before.transactionState)
            )
              return fail(
                "PROTOCOL_MUTATION",
                "Komut işlem günlüğünü doğrudan değiştiremez.",
              );
            const n = revision(before) + 1;
            d.transactionState = {
              version: 1,
              revision: n,
              commands: [
                ...(before.transactionState?.commands || []),
                {
                  id,
                  fingerprint: digest,
                  actor,
                  kind: intent.kind,
                  revision: n,
                  time: new Date().toISOString(),
                },
              ],
            };
            return safeResult;
          });
          if (!r.ok) {
            if (!latest.ready) {
              store = latest;
              blocked = latest.status;
              reason = latest.reason;
            }
            return { ...r, commandId: id };
          }
          store = latest;
          return structuredClone({
            ...r,
            commandId: id,
            revision: revision(r.state),
          });
        });
      },
    });
  }
  async function copy({ locks = () => globalThis.navigator?.locks, ...args }) {
    return exclusive(locks, args.key, () => P.copy(args));
  }
  return Object.freeze({ open, copy, fingerprint, lockName, revision });
});
