/* P0-07: pure schema checks and a synchronous, single-key commit boundary.
 * This is not a cross-tab lock or a replacement for server transactions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimPersistence = api;
})(globalThis, function () {
  "use strict";
  const VERSION = 1,
    FORMAT = "ritim-flow-lite",
    BASE_KEY = "ritimFlowLite:fictional-demo:v1";
  const object = (x) =>
    x !== null && typeof x === "object" && !Array.isArray(x);
  const count = (x) => Number.isSafeInteger(x) && x >= 0;
  const arrays = [
    "orders",
    "jobs",
    "events",
    "shipments",
    "physicalTransfers",
    "physicalLotUses",
    "operationInputs",
    "allocationReleases",
    "planningEvents",
    "qualityPolicies",
    "inspectionCases",
    "reworkTasks",
    "drawingVersions",
    "supplierDispositions",
    "returnDispositions",
    "returnReworks",
    "compensations",
    "materialAuthorizations",
  ];
  const ledgerKeys = [
    "receipts",
    "allocations",
    "dispatches",
    "returns",
    "releases",
    "shipments",
    "customerReturns",
    "entries",
  ];
  const top = new Set([
    "schema",
    "schemaVersion",
    "user",
    "ux06",
    "transactionState",
    ...arrays,
  ]);
  const numberFields = new Set([
    "qty",
    "good",
    "scrap",
    "pending",
    "setup",
    "rework",
    "received",
    "legacyGood",
    "legacyBaseline",
    "allocatable",
    "plannedQty",
    "op",
    "operation",
    "remaining",
    "executed",
  ]);
  const stringFields = new Set([
    "id",
    "order",
    "job",
    "source",
    "destination",
    "inputLot",
    "outputLot",
    "ref",
    "dispatch",
    "shipment",
    "caseId",
    "inspection",
    "user",
    "owner",
    "machine",
    "state",
    "status",
    "kind",
    "type",
    "reason",
    "detail",
    "defect",
    "time",
    "date",
    "routeKey",
    "name",
    "url",
    "revision",
    "supplier",
    "stockCode",
    "unit",
    "customer",
    "part",
    "partNo",
    "drawing",
    "material",
    "dimensions",
    "due",
    "created",
  ]);
  const nestedArrays = new Set([
    "history",
    "sources",
    "results",
    "execution",
    "assignments",
    "drawingAcknowledgements",
    "receipts",
    ...ledgerKeys,
  ]);
  function validate(s, { legacy = false } = {}) {
    const errors = [];
    const bad = (p) => errors.push(p);
    if (!object(s)) return { ok: false, errors: ["Kök veri bir nesne olmalı"] };
    if (!legacy && (s.schema !== FORMAT || s.schemaVersion !== VERSION))
      bad("Desteklenmeyen şema/sürüm");
    if (legacy && ("schemaVersion" in s || "schema" in s))
      bad("Sürümlü veri eski veri olarak açılamaz");
    for (const k of Object.keys(s))
      if (!top.has(k)) bad("Tanınmayan kök alan: " + k);
    if (typeof s.user !== "string" || !s.user.trim()) bad("user");
    for (const k of ["orders", "jobs", "events", "shipments"])
      if (!Array.isArray(s[k])) bad(k);
    for (const k of arrays)
      if (k in s && (!Array.isArray(s[k]) || s[k].some((r) => !object(r))))
        bad(k);
    // Optional P0-08 protocol metadata. Absence is revision zero, never migrated on read.
    if ("transactionState" in s) {
      const t = s.transactionState,
        ids = new Set();
      if (
        !object(t) ||
        t.version !== 1 ||
        !count(t.revision) ||
        !Array.isArray(t.commands) ||
        t.commands.length !== t.revision ||
        Object.keys(t).some(
          (k) => !["version", "revision", "commands"].includes(k),
        )
      )
        bad("transactionState");
      else
        for (const [i, c] of t.commands.entries()) {
          if (
            !object(c) ||
            typeof c.id !== "string" ||
            !c.id.trim() ||
            c.id.length > 200 ||
            ids.has(c.id) ||
            c.revision !== i + 1 ||
            typeof c.actor !== "string" ||
            !c.actor.trim() ||
            typeof c.kind !== "string" ||
            !c.kind.trim() ||
            typeof c.time !== "string" ||
            !Number.isFinite(Date.parse(c.time)) ||
            !/^[a-f0-9]{64}$/.test(c.fingerprint) ||
            Object.keys(c).some(
              (k) =>
                ![
                  "id",
                  "revision",
                  "actor",
                  "kind",
                  "time",
                  "fingerprint",
                ].includes(k),
            )
          )
            bad("transactionState.commands[" + i + "]");
          ids.add(c?.id);
        }
    }
    // Validate JSON-serializable types without coercing, stripping or repairing fields.
    const walk = (v, p, key) => {
      if (key === "transactionState" && p === "state.transactionState") return;
      // In stock dispositions/returns rework is a task ID, not a quantity.
      const reworkReference =
        key === "rework" &&
        (p.startsWith("state.returnDispositions[") ||
          p.startsWith("state.supplierDispositions[") ||
          (p.startsWith("state.ux06.") && p.includes(".returns[")));
      if (reworkReference && typeof v !== "string") bad(p);
      if (numberFields.has(key) && !reworkReference && !count(v)) bad(p);
      if (stringFields.has(key) && typeof v !== "string") bad(p);
      if (
        ["inputQty", "piecesPerUnit"].includes(key) &&
        (!Number.isFinite(v) || v <= 0)
      )
        bad(p);
      if (v === null) {
        if (key !== "handover") bad(p);
        return;
      }
      if (typeof v === "number" && !Number.isFinite(v)) bad(p);
      if (["undefined", "function", "symbol", "bigint"].includes(typeof v))
        bad(p);
      if (Array.isArray(v)) {
        v.forEach((x, i) => walk(x, p + "[" + i + "]", ""));
        return;
      }
      if (key === "ux06" && object(v)) {
        for (const [id, d] of Object.entries(v)) walk(d, p + "." + id, "");
        return;
      }
      if (object(v))
        for (const [k, x] of Object.entries(v)) {
          if (["__proto__", "constructor", "prototype"].includes(k))
            bad(p + "." + k);
          if (
            nestedArrays.has(k) &&
            (!Array.isArray(x) || x.some((r) => !object(r)))
          )
            bad(p + "." + k);
          if (
            ["users", "inputLots"].includes(k) &&
            (!Array.isArray(x) || x.some((r) => typeof r !== "string"))
          )
            bad(p + "." + k);
          if (k === "handover" && x !== null && !object(x)) bad(p + "." + k);
          if (k === "ux05" && !object(x)) bad(p + "." + k);
          walk(x, p + "." + k, k);
        }
    };
    try {
      walk(s, "state", "");
    } catch (_) {
      bad("Döngüsel veya aşırı derin veri");
    }
    for (const o of Array.isArray(s.orders) ? s.orders : []) {
      if (!object(o)) continue;
      if (["__proto__", "constructor", "prototype"].includes(o.id))
        bad("orders.id: ayrılmış anahtar");
      if (
        typeof o.id !== "string" ||
        !o.id ||
        !count(o.qty) ||
        !Array.isArray(o.route) ||
        !o.route.length
      )
        bad("orders: id/qty/route");
      if (
        Array.isArray(o.route) &&
        o.route.some(
          (r) =>
            !(typeof r === "string" && r.trim()) &&
            !(
              object(r) &&
              typeof r.name === "string" &&
              ["internal", "external"].includes(r.type)
            ),
        )
      )
        bad("orders.route");
    }
    const orderIds = new Set(
      (Array.isArray(s.orders) ? s.orders : []).filter(object).map((o) => o.id),
    );
    for (const j of Array.isArray(s.jobs) ? s.jobs : []) {
      if (!object(j)) continue;
      if (!orderIds.has(j.order)) bad("jobs.order: sipariş yok");
      if (
        typeof j.id !== "string" ||
        !j.id ||
        typeof j.order !== "string" ||
        !count(j.op) ||
        !count(j.good) ||
        !count(j.scrap) ||
        !["waiting", "running", "paused", "complete", "shipped"].includes(
          j.state,
        )
      )
        bad("jobs: zorunlu alanlar");
      if (object(j.ux05))
        for (const k of ["received", "pending", "setup", "rework"])
          if (!count(j.ux05[k])) bad("jobs.ux05." + k);
    }
    const required = {
      physicalTransfers: [
        "id",
        "source",
        "destination",
        "qty",
        "status",
        "history",
      ],
      operationInputs: [
        "id",
        "source",
        "destination",
        "qty",
        "status",
        "history",
      ],
      reworkTasks: [
        "id",
        "job",
        "order",
        "qty",
        "remaining",
        "executed",
        "inputLots",
        "results",
      ],
      returnReworks: ["id", "order", "qty", "remaining"],
      qualityPolicies: ["order", "operation", "users"],
      drawingVersions: ["id", "order", "revision", "url"],
      inspectionCases: ["id", "job", "inputLots"],
    };
    for (const [collection, fields] of Object.entries(required))
      if (Array.isArray(s[collection]))
        for (const row of s[collection])
          if (object(row))
            for (const field of fields)
              if (!(field in row)) bad(collection + "." + field);
    if ("ux06" in s) {
      if (!object(s.ux06)) bad("ux06");
      else
        for (const [id, d] of Object.entries(s.ux06)) {
          if (["__proto__", "constructor", "prototype"].includes(id))
            bad("ux06: ayrılmış anahtar");
          if (!object(d)) {
            bad("ux06." + id);
            continue;
          }
          for (const [k, rows] of Object.entries(d)) {
            if (
              !ledgerKeys.includes(k) ||
              !Array.isArray(rows) ||
              rows.some((r) => !object(r))
            )
              bad("ux06." + id + "." + k);
            else if (k !== "entries" && rows.some((r) => !count(r.qty)))
              bad("ux06." + id + "." + k + ".qty");
          }
        }
    }
    return { ok: errors.length === 0, errors: [...new Set(errors)] };
  }
  function decode(raw) {
    if (raw === null) return { kind: "missing" };
    let value;
    try {
      value = JSON.parse(raw);
    } catch (_) {
      return {
        kind: "invalid",
        message: "JSON okunamıyor; özgün veri korunuyor.",
      };
    }
    const legacy =
      object(value) && !("schema" in value) && !("schemaVersion" in value);
    const v = validate(value, { legacy });
    return v.ok
      ? { kind: legacy ? "legacy" : "ready", value }
      : { kind: "invalid", message: v.errors.join(" · ") };
  }
  const message = (e) =>
    e?.name === "QuotaExceededError"
      ? "Depolama kotası dolu. İşlem kaydedilmedi."
      : "Depolamaya erişilemiyor. İşlem kaydedilmedi.";
  function open({ storage, key = BASE_KEY, initial, validateTransaction }) {
    let raw = null,
      current = null,
      status = "recovery",
      reason = "",
      uncertain = false;
    const load = () => {
      try {
        raw = storage().getItem(key);
        const d = decode(raw);
        status = d.kind;
        reason = d.message || "";
        current =
          d.kind === "ready"
            ? d.value
            : d.kind === "missing"
              ? structuredClone(initial)
              : null;
        if (d.kind === "missing") {
          const v = validate(current);
          if (!v.ok) {
            status = "invalid";
            current = null;
            reason = v.errors.join(" · ");
          }
        }
      } catch (e) {
        status = "unavailable";
        reason = message(e);
        current = null;
      }
    };
    load();
    return {
      get key() {
        return key;
      },
      get raw() {
        return raw;
      },
      get status() {
        return status;
      },
      get reason() {
        return reason;
      },
      get ready() {
        return status === "ready" || status === "missing";
      },
      snapshot() {
        return current && structuredClone(current);
      },
      reload() {
        load();
        return this.ready;
      },
      commit(mutate, base = current) {
        if (!this.ready)
          return { ok: false, message: "Veri kurtarma / sürüm onayı gerekli." };
        let draft, result, encoded;
        try {
          // Stale-snapshot detection is defensive; it is NOT an atomic multi-tab lock.
          if (storage().getItem(key) !== raw) {
            status = "conflict";
            reason = "Kayıt başka bir işlemde değişti. Yeniden açıp inceleyin.";
            return { ok: false, message: reason };
          }
          const before = validate(base);
          if (!before.ok)
            return { ok: false, message: before.errors.join(" · ") };
          draft = structuredClone(base);
          result = mutate(draft);
          if (!result?.ok)
            return result || { ok: false, message: "İşlem tamamlanmadı" };
          if (result.then)
            return {
              ok: false,
              message: "Asenkron taslak işlemi desteklenmiyor",
            };
          const v = validate(draft);
          if (!v.ok)
            return {
              ok: false,
              message: "Taslak şeması geçersiz: " + v.errors.join(" · "),
            };
          if (validateTransaction) {
            const integrity = validateTransaction(base, draft);
            if (!integrity.ok) return integrity;
          }
          encoded = JSON.stringify(draft);
        } catch (e) {
          return { ok: false, message: message(e) };
        }
        try {
          storage().setItem(key, encoded);
          if (storage().getItem(key) !== encoded)
            throw Error("Write verification failed");
        } catch (e) {
          // Never roll back storage blindly: an exception after a successful write can
          // have an uncertain outcome. Block retry until the stored value is reloaded.
          try {
            uncertain = storage().getItem(key) !== raw;
          } catch (_) {
            uncertain = true;
          }
          if (uncertain) {
            status = "uncertain";
            reason =
              "Kayıt sonucu doğrulanamadı. Tekrar işlem yapmadan depodaki kaydı yeniden açın.";
          }
          return {
            ok: false,
            message: uncertain ? reason : message(e),
            uncertain,
          };
        }
        raw = encoded;
        current = draft;
        status = "ready";
        return { ...result, state: structuredClone(current) };
      },
    };
  }
  // Explicit copies only. The original key/raw bytes are never modified.
  function copy({ storage, key, value, legacy = false }) {
    const v = validate(value, { legacy });
    if (!v.ok) return { ok: false, message: v.errors.join(" · ") };
    const draft = structuredClone(value);
    if (legacy) {
      draft.schema = FORMAT;
      draft.schemaVersion = VERSION;
    }
    const valid = validate(draft);
    if (!valid.ok) return { ok: false, message: valid.errors.join(" · ") };
    let wrote = false;
    try {
      if (storage().getItem(key) !== null)
        return {
          ok: false,
          message: "Hedef anahtar zaten var; üzerine yazılmadı.",
        };
      const raw = JSON.stringify(draft);
      storage().setItem(key, raw);
      wrote = true;
      if (storage().getItem(key) !== raw)
        throw Error("Write verification failed");
      return { ok: true, key };
    } catch (e) {
      try {
        wrote = storage().getItem(key) !== null;
      } catch (_) {
        wrote = true;
      }
      return { ok: false, message: message(e), uncertain: wrote, key };
    }
  }
  return Object.freeze({
    VERSION,
    FORMAT,
    BASE_KEY,
    validate,
    decode,
    open,
    copy,
  });
});
