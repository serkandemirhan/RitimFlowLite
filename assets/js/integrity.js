/* P0-06: read-only snapshot reconciliation. No storage, clock, migration or repair. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(
    node ? require("./persistence.js") : root.RitimPersistence,
    node ? require("./quantity-model.js") : root.RitimQuantities,
    node ? require("./transfer-ledger.js") : root.RitimTransferLedger,
  );
  if (node) module.exports = api;
  else root.RitimIntegrity = api;
})(globalThis, function (P, Q, T) {
  "use strict";
  const rows = (a) => (Array.isArray(a) ? a : []);
  const sum = (a, key = "qty") => a.reduce((n, r) => n + r[key], 0);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const operators = ["Operatör A", "Operatör B", "Operatör C"];
  function remediationFor(code) {
    if (/^LEGACY|^DOWNSTREAM_RAW/.test(code))
      return "Tarihsel miktarı yeni kullanılabilir stok saymayın. Bilinmeyen lot veya kontrol bilgisini uydurmayın; varsa özgün belgeleri ayrı mutabakat için saklayın.";
    if (/REFERENCE|PROVENANCE|IDENTIFIER|LOT/.test(code))
      return "Gösterilen iş, belge ve lot kimliklerini özgün kaynaktan doğrulayın. Bağlantı çözülene kadar etkilenen siparişte yeni hareket yapmayın; kaydı silerek gizlemeyin.";
    if (/PLAN|ALLOCATION|RECEIPT/.test(code))
      return "Plan, tahsis ve fiziksel teslim belgelerini birlikte karşılaştırın. 25 fiziksel kalan ile 50 başlamamış planı birbirinin yerine kullanmayın; yalnız bir sayacı değiştirerek denklemi kapatmayın.";
    if (/SUPPLIER/.test(code))
      return "Fason irsaliyesini sağlam dönüş, hurda, rework kalan ve kayıp kararlarıyla mutabık hale getirecek belgeleri toplayın. Fazla dönüşü yeni stok olarak kullanmayın.";
    if (/SHIPMENT|FINAL_RELEASE|CHRONOLOGY/.test(code))
      return "Son operasyonun tamamlanma ve final kalite kanıtlarını sevkiyat belgesiyle doğrulayın. Onaysız miktarı yeniden sevk etmeyin; ham veriyi koruyun.";
    if (/RETURN/.test(code))
      return "Kaynak sevkiyat, aktif iade dosyası ve karantina kararlarını karşılaştırın. Aynı iadeyi ikinci kez stoklaştırmayın.";
    if (/REWORK|INSPECTION/.test(code))
      return "Kaynak kontrolü, rework işi, işlem ve tekrar kontrol sonuçlarını birlikte inceleyin. Yeni üretim ekleyerek farkı kapatmayın.";
    if (/COMPENSATION/.test(code))
      return "Belgelenmiş hurda/kayıp kaynağı ve önceki telafi izinlerini karşılaştırın. Sipariş talebini büyütmeyin; aynı kaybı tekrar kullanmayın.";
    if (/DRAWING/.test(code))
      return "Korunan çizim sürümleri ile aktif revizyon ve iş emri onayını karşılaştırın. Eski dosyanın üzerine yazmayın.";
    if (/ASSIGNMENT/.test(code))
      return "Açık işleri, makine atamalarını ve operatör sahipliğini karşılaştırın; üretim miktarını taşıyarak atama hatasını gidermeyin.";
    return "Özgün veriyi dışa aktarın; kaynak belgelerle mutabakat yapın. Otomatik düzeltme uygulanmaz.";
  }
  function validate(s) {
    const findings = [],
      balances = { jobs: [], orders: [] };
    const add = (
      code,
      path,
      refs,
      explanation,
      severity = "critical",
      remediation = remediationFor(code),
    ) => {
      findings.push({
        code,
        severity,
        path,
        refs: { ...refs },
        explanation,
        remediation,
      });
    };
    const finish = () => ({
      valid: !findings.some((f) => f.severity === "critical"),
      findings,
      critical: findings.filter((f) => f.severity === "critical"),
      warnings: findings.filter((f) => f.severity === "warning"),
      balances,
    });
    const schema = P.validate(s, {
      legacy:
        !!s && !("schema" in Object(s)) && !("schemaVersion" in Object(s)),
    });
    if (!schema.ok) {
      for (const path of schema.errors)
        add(
          "SCHEMA_INVALID",
          path,
          {},
          "Şema/tip/miktar doğrulanamadı: " + path,
          "critical",
          "Veri Güvenliği ekranından ham veriyi indirin ve doğrulanmış yedeği ayrı kopyada inceleyin.",
        );
      return finish();
    }
    const required = {
      physicalLotUses: ["job", "lot", "qty"],
      allocationReleases: ["order", "job", "qty"],
      planningEvents: ["order", "job", "qty"],
      inspectionCases: [
        "order",
        "operation",
        "qty",
        "good",
        "scrap",
        "rework",
        "user",
      ],
      reworkTasks: ["inspection", "status"],
      supplierDispositions: ["id", "order", "dispatch", "qty", "kind"],
      returnDispositions: ["id", "order", "caseId", "qty", "kind"],
      returnReworks: ["id", "order", "caseId", "qty", "remaining", "results"],
      compensations: ["order", "source", "operation", "qty"],
      materialAuthorizations: ["order", "qty"],
      events: ["job", "qty"],
      shipments: ["job", "qty"],
    };
    for (const [key, fields] of Object.entries(required))
      rows(s[key]).forEach((r, i) => {
        for (const field of fields)
          if (!(field in r))
            add(
              "REQUIRED_FIELD",
              `${key}[${i}].${field}`,
              { order: r.order, job: r.job },
              "Zorunlu domain alanı eksik.",
            );
      });
    if (findings.length) return finish();
    const orders = new Map(s.orders.map((o) => [o.id, o])),
      jobs = new Map(s.jobs.map((j) => [j.id, j]));
    const refs = (r, order) => ({
      order: order || r.order || jobs.get(r.job)?.order,
      job: r.job,
      lot: r.lot || r.inputLot,
      record: r.id || r.ref,
    });
    const duplicate = (list, field, path, order, required = false) => {
      const seen = new Set();
      list.forEach((r, i) => {
        const key = r[field];
        if (required && (typeof key !== "string" || !key))
          add(
            "IDENTIFIER_MISSING",
            `${path}[${i}].${field}`,
            refs(r, order),
            "Zorunlu kimlik eksik.",
          );
        if (key && seen.has(key))
          add(
            "DUPLICATE_IDENTIFIER",
            `${path}[${i}].${field}`,
            refs(r, order),
            "Tekrarlanan kimlik/belge: " + key,
          );
        if (key) seen.add(key);
      });
    };
    duplicate(s.orders, "id", "orders", undefined, true);
    duplicate(s.jobs, "id", "jobs", undefined, true);
    const rootCollections = [
      "physicalTransfers",
      "operationInputs",
      "physicalLotUses",
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
      "events",
      "shipments",
    ];
    const idCollections = new Set([
      "physicalTransfers",
      "operationInputs",
      "inspectionCases",
      "reworkTasks",
      "drawingVersions",
      "supplierDispositions",
      "returnDispositions",
      "returnReworks",
    ]);
    for (const k of rootCollections) {
      duplicate(rows(s[k]), "id", k, undefined, idCollections.has(k));
      for (const [i, r] of rows(s[k]).entries()) {
        const path = `${k}[${i}]`,
          ref = refs(r);
        if (r.order !== undefined && !orders.has(r.order))
          add("ORDER_REFERENCE", path, ref, "Hareketin siparişi bulunamıyor.");
        if (
          r.job !== undefined &&
          (!jobs.has(r.job) || (r.order && jobs.get(r.job)?.order !== r.order))
        )
          add(
            "JOB_REFERENCE",
            path,
            ref,
            "Hareketin iş emri yok veya siparişi farklı.",
          );
        if (
          r.operation !== undefined &&
          r.order &&
          !orders.get(r.order)?.route[r.operation]
        )
          add(
            "OPERATION_REFERENCE",
            path,
            ref,
            "Hareket operasyonu rotada yok.",
          );
        if ("qty" in r && !Q.count(r.qty))
          add(
            "PIECE_QUANTITY",
            path,
            ref,
            "Adet negatif olmayan güvenli tam sayı olmalı.",
          );
      }
    }
    const chronology = (source, target, path, ref) => {
      const a = source?.date || source?.time,
        b = target?.date || target?.time;
      if (
        a &&
        b &&
        Number.isFinite(Date.parse(a)) &&
        Number.isFinite(Date.parse(b)) &&
        Date.parse(b) < Date.parse(a)
      )
        add(
          "MOVEMENT_CHRONOLOGY",
          path,
          ref,
          "Bağlı sonuç hareketinin zamanı kaynak hareketinden önce.",
        );
    };
    const ledger = (id) => Q.readLedger(s, id);
    for (const [id, d] of Object.entries(s.ux06 || {})) {
      if (!orders.has(id))
        add(
          "LEDGER_ORDER_REFERENCE",
          `ux06.${id}`,
          { order: id },
          "Defterin siparişi yok.",
        );
      for (const k of Q.keys) {
        duplicate(rows(d[k]), "id", `ux06.${id}.${k}`, id);
        if (["receipts", "dispatches", "shipments"].includes(k))
          duplicate(rows(d[k]), "ref", `ux06.${id}.${k}`, id, k !== "receipts");
        rows(d[k]).forEach((r, i) => {
          if (k !== "entries" && (!Q.count(r.qty) || !r.qty))
            add(
              "MOVEMENT_QUANTITY",
              `ux06.${id}.${k}[${i}]`,
              refs(r, id),
              "Hareket adedi pozitif güvenli tam sayı olmalı.",
            );
        });
      }
      for (const a of rows(d.allocations)) {
        const j = jobs.get(a.job);
        if (!j || j.order !== id || j.op !== 0)
          add(
            "ALLOCATION_JOB_REFERENCE",
            `ux06.${id}.allocations`,
            { order: id, job: a.job },
            "Tahsis mevcut siparişin ilk operasyon iş emrine bağlı olmalı.",
          );
      }
    }
    const activeMachines = new Map();
    for (const j of s.jobs.filter(
      (j) => j.machine && !["complete", "shipped"].includes(j.state),
    )) {
      if (activeMachines.has(j.machine)) {
        for (const affected of [activeMachines.get(j.machine), j])
          add(
            "MACHINE_ASSIGNMENT_CONFLICT",
            "jobs." + affected.id,
            { order: affected.order, job: affected.id },
            "Aynı makineye birden fazla açık iş atanmış.",
          );
      }
      activeMachines.set(j.machine, j);
    }
    const inspections = new Map(rows(s.inspectionCases).map((r) => [r.id, r]));
    const tasks = new Map(rows(s.reworkTasks).map((r) => [r.id, r]));
    const drawings = new Map(rows(s.drawingVersions).map((r) => [r.id, r]));
    // Lot identity is derived only from recorded direct receipts or accepted movements.
    const lotMap = new Map();
    const putLot = (id, job, qty) => {
      if (lotMap.has(id))
        add(
          "DUPLICATE_LOT",
          "lots",
          { job, order: jobs.get(job)?.order, lot: id },
          "Lot kimliği birden fazla kaynağa bağlı.",
        );
      lotMap.set(id, { job, qty });
    };
    for (const j of s.jobs)
      if (j.ux05)
        putLot(
          `INPUT:${j.id}`,
          j.id,
          j.ux05.received - (j.ux05.legacyBaseline || 0),
        );
    for (const t of rows(s.physicalTransfers))
      if (t.status === "accepted") putLot(t.outputLot, t.destination, t.qty);
    for (const t of rows(s.operationInputs))
      if (t.status === "accepted")
        putLot(`OPINPUT:${t.id}`, t.destination, t.qty);
    const lotRef = (id, job, path, ref) => {
      if (!lotMap.has(id) || lotMap.get(id).job !== job)
        add(
          "LOT_REFERENCE",
          path,
          { ...ref, job, lot: id },
          "Lot yok, kabul edilmemiş veya başka iş emrine ait.",
        );
    };
    for (const j of s.jobs) {
      const o = orders.get(j.order),
        ref = { order: j.order, job: j.id },
        path = `jobs.${j.id}`;
      if (!o) {
        add("JOB_ORDER_REFERENCE", path, ref, "İş emrinin siparişi yok.");
        continue;
      }
      const route = Q.route(o),
        x = j.ux05;
      if (route.operations[j.op]?.type !== "internal")
        add(
          "JOB_OPERATION_REFERENCE",
          path,
          ref,
          "İş emri rotadaki geçerli bir iç operasyona bağlı değil.",
        );
      if (j.planningVersion === 1 && j.routeKey !== route.key)
        add(
          "PLAN_ROUTE_CHANGED",
          path,
          ref,
          "Planın kayıtlı rotası sipariş rotasıyla farklı.",
        );
      if (j.machine && !["CNC-01", "CNC-02", "CNC-03"].includes(j.machine))
        add(
          "ASSIGNMENT_MACHINE",
          path,
          ref,
          "Makine mevcut yerel demo makine listesinde yok.",
        );
      if (j.owner && !operators.includes(j.owner) && j.owner !== "Yönetici")
        add(
          "ASSIGNMENT_USER",
          path,
          ref,
          "Atanan operatör yerel kullanıcı listesinde yok.",
        );
      const b = Q.jobBalance(j, o, s),
        allocation = Q.allocation(s, o.id, j.id);
      if (allocation < 0 || !Q.count(allocation))
        add(
          "NEGATIVE_ALLOCATION",
          path,
          ref,
          "Tahsis serbest bırakma toplamı tahsisi aşıyor.",
        );
      if (
        b.received +
          b.awaitingTransfer +
          sum(
            rows(s.operationInputs).filter(
              (t) => t.destination === j.id && t.status === "reserved",
            ),
          ) >
          b.planned &&
        (x || j.plannedQty !== undefined)
      )
        add(
          "RECEIPT_RESERVATION_OVER_PLAN",
          path,
          ref,
          "Teslim, yoldaki miktar ve ayrılan girdi toplamı planı aşıyor.",
          j.plannedQty === undefined && x?.received === x?.legacyBaseline
            ? "warning"
            : "critical",
        );
      if (allocation > b.planned)
        add(
          "ALLOCATION_OVER_PLAN",
          path,
          ref,
          `Tahsis ${allocation}, iş emri planı ${b.planned}.`,
        );
      if (!x) {
        if (j.good || j.scrap)
          add(
            "LEGACY_PRODUCTION",
            path,
            ref,
            "Tarihsel toplu üretim mevcut; fiziksel stok ve lot kanıtı olarak kullanılamaz.",
            "warning",
          );
      } else {
        if (b.received > b.planned)
          add(
            "RECEIVED_OVER_PLAN",
            path,
            ref,
            `Fiziksel teslim ${b.received}, plan ${b.planned}.`,
            j.plannedQty === undefined && x.received === x.legacyBaseline
              ? "warning"
              : "critical",
          );
        if (!b.valid || !Q.count(b.received - b.used - b.transferredOut))
          add(
            "PRODUCTION_BALANCE",
            path,
            ref,
            "Sağlam + hurda + ayar + bekleyen + rework + transfer çıkışı teslimi aşıyor.",
          );
        if (
          !Q.count(x.legacyBaseline) ||
          !Q.count(x.legacyGood) ||
          x.legacyGood > j.good ||
          x.legacyGood > x.legacyBaseline ||
          x.legacyBaseline > x.received
        )
          add(
            "LEGACY_BASELINE",
            path,
            ref,
            "Tarihsel başlangıç miktarları tutarsız.",
          );
        if (x.legacyBaseline)
          add(
            "LEGACY_BASELINE_NOTICE",
            path,
            ref,
            "Tarihsel başlangıç fiziksel yeni stoktan ayrı tutulur; eski lot ayrıntısı yok.",
            "warning",
          );
        if (x.received - x.legacyBaseline > allocation)
          add(
            "RECEIPT_WITHOUT_ALLOCATION",
            path,
            ref,
            "Yeni doğrudan fiziksel teslim tahsisi aşıyor.",
          );
        if (j.op > 0 && (x.received || x.legacyBaseline || x.legacyGood))
          add(
            "DOWNSTREAM_RAW_RECEIPT",
            path,
            ref,
            "Sonraki operasyon yalnız kabul edilmiş operasyon girdisi kullanabilir; eski başlangıç yeni stok sayılmaz.",
            x.received === x.legacyBaseline &&
              j.good === x.legacyGood &&
              j.scrap === x.legacyBaseline - x.legacyGood &&
              !x.pending &&
              !x.setup &&
              !x.rework
              ? "warning"
              : "critical",
          );
        const receipts = rows(x.receipts),
          receiptTotal = sum(receipts);
        if (receipts.length && receiptTotal !== x.received - x.legacyBaseline)
          add(
            "RECEIPT_HISTORY_MISMATCH",
            path,
            ref,
            "Teslim geçmişi toplamı doğrudan yeni teslimle eşleşmiyor.",
            receipts.some((a) => !a.user && !a.time) ? "warning" : "critical",
          );
        if (
          sum(receipts.filter((a) => a.user || a.time)) >
          x.received - x.legacyBaseline
        )
          add(
            "RECEIPT_HISTORY_EXCESS",
            path,
            ref,
            "Kullanıcı/zaman bilgili yeni teslim kayıtları fiziksel yeni teslimi aşıyor.",
          );
        const checks = rows(s.inspectionCases).filter((c) => c.job === j.id);
        if (
          sum(checks, "good") > j.good ||
          sum(checks, "scrap") > j.scrap ||
          sum(checks) > j.good + j.scrap + x.rework
        )
          add(
            "INSPECTION_TOTAL",
            path,
            ref,
            "Kontrol kayıtlarının toplamı üretilmiş sonuçları aşıyor.",
          );
        const linked = sum(
          rows(s.reworkTasks).filter((t) => t.job === j.id),
          "remaining",
        );
        if (linked > x.rework)
          add(
            "REWORK_BALANCE",
            path,
            ref,
            "Rework işlerinin kalan toplamı üretim rework bakiyesini aşıyor.",
          );
        if (linked < x.rework)
          add(
            "LEGACY_UNLINKED_REWORK",
            path,
            ref,
            "Toplu rework bakiyesinin bir bölümü kontrol kimliğine bağlı değil; açık gerekçeli eski rework bağlama gerekir.",
            "warning",
          );
        if (
          sum(rows(s.physicalLotUses).filter((t) => t.job === j.id)) >
          b.used - x.legacyBaseline
        )
          add(
            "LOT_USAGE_OVER_PRODUCTION",
            path,
            ref,
            "Lot tüketimleri yeni üretim toplamını aşıyor.",
          );
      }
      const local = {
        ...s,
        jobs: s.jobs.filter((a) => a.order === o.id),
        physicalTransfers: rows(s.physicalTransfers).filter(
          (a) => a.order === o.id,
        ),
        operationInputs: rows(s.operationInputs).filter(
          (a) => a.order === o.id,
        ),
        physicalLotUses: rows(s.physicalLotUses).filter(
          (a) => jobs.get(a.job)?.order === o.id,
        ),
      };
      const physical = Q.jobPhysicalStock(local, j, o);
      if (!Q.count(physical.verifiedGood - physical.departedGood))
        add(
          "GOOD_LOCATION_BALANCE",
          path,
          ref,
          "Sağlam fiziksel çıkış doğrulanmış üretimden fazla.",
        );
      balances.jobs.push({
        ...ref,
        planned: b.planned,
        received: b.received,
        historicalGood: j.good,
        historicalScrap: j.scrap,
        pending: b.pending,
        setup: b.setup,
        rework: b.rework,
        physicalUnprocessed: x ? b.received - b.used - b.transferredOut : null,
        unstartedPlan: b.planned - b.received,
        onHandGood:
          x && Q.count(physical.verifiedGood - physical.departedGood)
            ? physical.verifiedGood - physical.departedGood
            : null,
        departedGood: physical.departedGood,
      });
      for (const a of rows(j.drawingAcknowledgements))
        if (drawings.get(a.revision)?.order !== j.order)
          add(
            "DRAWING_ACK_REFERENCE",
            path,
            ref,
            "Çizim onayı aynı siparişin kayıtlı revizyonuna bağlı değil.",
          );
      for (const lot of T.lots(s, j))
        if (!lot.valid)
          add(
            "LOT_OVERDRAWN",
            path,
            { ...ref, lot: lot.id },
            "Lot tüketimi ve rezervasyonu fiziksel lot miktarını aşıyor.",
          );
    }
    for (const k of ["physicalTransfers", "operationInputs"])
      for (const t of rows(s[k])) {
        const a = jobs.get(t.source),
          b = jobs.get(t.destination),
          o = orders.get(t.order),
          path = `${k}.${t.id}`,
          ref = { ...refs(t), job: t.source, destination: t.destination };
        if (
          !a ||
          !b ||
          !o ||
          a.id === b.id ||
          a.order !== t.order ||
          b.order !== t.order ||
          t.operation !== b.op ||
          (k === "physicalTransfers" ? a.op !== b.op : a.op + 1 !== b.op)
        )
          add(
            "MOVEMENT_REFERENCE",
            path,
            ref,
            "Kaynak/hedef/sipariş/operasyon bağlantısı geçersiz.",
          );
        if (
          o &&
          (t.version !== 1 ||
            t.routeKey !==
              (k === "physicalTransfers"
                ? JSON.stringify(o.route)
                : Q.route(o).key))
        )
          add(
            "MOVEMENT_ROUTE",
            path,
            ref,
            "Hareket sürümü veya kayıtlı rota geçersiz.",
          );
        const actions = rows(t.history).map((h) => h.action),
          accepts = actions.filter((a) => a === "accept").length;
        const statuses =
          k === "physicalTransfers"
            ? ["in_transit", "accepted", "reversed"]
            : ["reserved", "in_transit", "accepted", "cancelled"];
        if (
          !statuses.includes(t.status) ||
          accepts > 1 ||
          (t.status === "accepted" && accepts !== 1) ||
          (t.status === "in_transit" && accepts)
        )
          add(
            "MOVEMENT_ACCEPTANCE",
            path,
            ref,
            "Tekrarlı kabul veya durum/geçmiş uyumsuzluğu.",
          );
        const reverse = actions.filter((a) => a === "reverse").length,
          sends = actions.filter((a) => a === "send").length;
        if (
          k === "physicalTransfers"
            ? actions[0] !== "issue" ||
              actions.filter((a) => a === "issue").length !== 1 ||
              reverse > 1 ||
              (t.status === "reversed") !== (reverse === 1) ||
              (accepts &&
                actions.indexOf("accept") < actions.indexOf("issue")) ||
              (reverse &&
                accepts &&
                actions.indexOf("reverse") < actions.indexOf("accept"))
            : actions[0] !== "reserve" ||
              actions.filter((a) => a === "reserve").length !== 1 ||
              sends > 1 ||
              (accepts &&
                (!sends ||
                  actions.indexOf("accept") < actions.indexOf("send"))) ||
              (t.status === "cancelled" && (sends || accepts)) ||
              (t.status === "in_transit" && sends !== 1)
        )
          add(
            "MOVEMENT_HISTORY",
            path,
            ref,
            "Hareket durum zinciri sırasız, tekrarlı veya eksik.",
          );
        if (k === "operationInputs") {
          const released = sum(
            rows(t.history).filter((h) => h.action === "release"),
          );
          if (
            !Q.count(t.initialQty) ||
            !t.initialQty ||
            !Q.count(released) ||
            (t.status === "cancelled"
              ? released !== t.initialQty
              : t.qty + released !== t.initialQty)
          )
            add(
              "RESERVATION_HISTORY",
              path,
              ref,
              "Operasyon rezervasyonu ilk miktar ve serbest bırakılan miktarla uyuşmuyor.",
            );
        }
        if (k === "physicalTransfers") {
          if (t.outputLot !== `TRANSFER:${t.id}`)
            add(
              "TRANSFER_OUTPUT_LOT",
              path,
              ref,
              "Transfer çıktı lotu hareket kimliğiyle uyuşmuyor.",
            );
          // Reversed records still require an existing originating lot; never excuse a dangling ID.
          if (
            t.status === "reversed"
              ? !(
                  lotMap.get(t.inputLot)?.job === t.source ||
                  rows(s.physicalTransfers).some(
                    (a) =>
                      a.outputLot === t.inputLot && a.destination === t.source,
                  )
                )
              : !lotMap.has(t.inputLot) ||
                lotMap.get(t.inputLot).job !== t.source
          )
            add(
              "LOT_REFERENCE",
              path,
              ref,
              "Transfer kaynak lotu yok veya başka iş emrine ait.",
            );
        } else if (t.inputLot !== `GOOD:${t.source}`)
          add(
            "OPERATION_INPUT_LOT",
            path,
            ref,
            "Operasyon girdisi önceki işin sağlam çıktı lotuna bağlı değil.",
          );
      }
    for (const u of rows(s.physicalLotUses))
      lotRef(u.lot, u.job, "physicalLotUses", refs(u));
    for (const [id, lot] of lotMap) {
      const used = sum(rows(s.physicalLotUses).filter((u) => u.lot === id));
      const out = sum(
        rows(s.physicalTransfers).filter(
          (t) => t.inputLot === id && t.status !== "reversed",
        ),
      );
      if (!Q.count(lot.qty - used - out))
        add(
          "LOT_OVERDRAWN",
          "lots",
          { job: lot.job, order: jobs.get(lot.job)?.order, lot: id },
          "Lotun kayıtlı tüketim/çıkış toplamı mevcut miktarı aşıyor.",
        );
    }
    for (const c of rows(s.inspectionCases)) {
      const j = jobs.get(c.job),
        ref = refs(c),
        path = `inspectionCases.${c.id}`;
      if (!j || c.order !== j.order || c.operation !== j.op)
        add(
          "INSPECTION_REFERENCE",
          path,
          ref,
          "Kontrol işi/operasyonu/siparişi uyuşmuyor.",
        );
      if (
        ![c.qty, c.good, c.scrap, c.rework].every(Q.count) ||
        c.good + c.scrap + c.rework !== c.qty
      )
        add(
          "INSPECTION_QUANTITY",
          path,
          ref,
          "Kontrol sonuçları kontrol adedine eşit değil.",
        );
      for (const lot of c.inputLots) {
        lotRef(lot, c.job, path, ref);
        if (lotMap.has(lot) && lotMap.get(lot).qty <= 0)
          add(
            "INSPECTION_EMPTY_LOT",
            path,
            { ...ref, lot },
            "Kontrol kaynağı fiziksel miktarı olmayan bir lot.",
          );
      }
      if (
        j?.ux05 &&
        (c.good > j.good ||
          c.scrap > j.scrap ||
          c.qty > Q.jobBalance(j, orders.get(j.order), s).used)
      )
        add(
          "INSPECTION_BEFORE_PRODUCTION",
          path,
          ref,
          "Kontrol sonucu kayıtlı üretim miktarından fazla.",
        );
      if (c.user !== "Yönetici")
        add(
          "INSPECTION_AUTHORITY",
          path,
          ref,
          "Kayıtlı kontrol onayı yöneticiye ait değil.",
        );
    }
    for (const t of rows(s.reworkTasks)) {
      const c = inspections.get(t.inspection),
        path = `reworkTasks.${t.id}`,
        ref = refs(t);
      if (
        t.legacy === true &&
        t.inspection === "Eski kayıt — kontrol kimliği bilinmiyor" &&
        t.user === "Yönetici" &&
        t.defect?.trim() &&
        same(t.inputLots, ["Eski kaynak — lot bilinmiyor"])
      ) {
        add(
          "LEGACY_REWORK_PROVENANCE",
          path,
          ref,
          "Yönetici gerekçesiyle bağlanan eski toplu rework; geçmiş lot/kontrol kimliği bilinmiyor.",
          "warning",
        );
      } else {
        if (
          !c ||
          c.job !== t.job ||
          c.order !== t.order ||
          !same(c.inputLots, t.inputLots)
        )
          add(
            "REWORK_PROVENANCE",
            path,
            ref,
            "Rework kaynak kontrolü, işi veya lot zinciri geçersiz.",
          );
        for (const lot of t.inputLots) lotRef(lot, t.job, path, ref);
      }
      if (t.owner && !operators.includes(t.owner) && t.owner !== "Yönetici")
        add("REWORK_ASSIGNMENT", path, ref, "Rework operatörü geçersiz.");
      const resolved = rows(t.results).reduce(
        (n, r) => n + r.good + r.scrap,
        0,
      );
      if (
        resolved + t.remaining !== t.qty ||
        t.executed > t.remaining ||
        sum(rows(t.execution)) !== resolved + t.executed
      )
        add(
          "REWORK_RECONCILIATION",
          path,
          ref,
          "Rework miktarı = sonuç + kalan; işlem toplamı = sonuç + kontrol bekleyen olmalı.",
        );
      if (
        !["waiting", "inspection", "complete"].includes(t.status) ||
        (t.status === "complete") !== (t.remaining === 0)
      )
        add(
          "REWORK_STATUS",
          path,
          ref,
          "Rework durumu kalan miktarla uyuşmuyor.",
        );
    }
    for (const c of inspections.values())
      if (
        sum(rows(s.reworkTasks).filter((t) => t.inspection === c.id)) !==
        c.rework
      )
        add(
          "INSPECTION_REWORK_TOTAL",
          `inspectionCases.${c.id}`,
          refs(c),
          "Kontrolden açılan rework toplamı kontrol kararına eşit değil.",
        );
    for (const p of rows(s.qualityPolicies))
      if (p.user !== "Yönetici" || p.users.some((u) => !operators.includes(u)))
        add(
          "QUALITY_POLICY",
          "qualityPolicies",
          refs(p),
          "Kalite politikası kullanıcısı/onayı geçersiz.",
        );
    for (const o of s.orders) {
      const d = ledger(o.id),
        r = Q.route(o),
        ref = { order: o.id },
        path = `orders.${o.id}`,
        js = s.jobs.filter((j) => j.order === o.id);
      if (!r.supported)
        add(
          "UNSUPPORTED_ROUTE",
          path,
          ref,
          "Yalnız iç operasyonlar ve isteğe bağlı tek terminal fason desteklenir.",
          "warning",
          "Ara fason için yeni domain modeli gerekir; bu rotada üretim/sevk açmayın.",
        );
      if (!o.qty)
        add("ORDER_QUANTITY", path, ref, "Sipariş adedi pozitif olmalı.");
      for (let op = 0; op < r.operations.length; op++) {
        const planJobs = js.filter((j) => j.op === op),
          planned = planJobs.reduce((n, j) => n + (j.plannedQty ?? o.qty), 0);
        const limit =
          op === 0
            ? o.qty + Q.compensation(s, o.id)
            : sum(Q.productionSources(s, o, true, op - 1));
        if (planned > limit)
          add(
            "OPERATION_OVER_PLAN",
            path + `.route[${op}]`,
            ref,
            `Operasyon planı ${planned}, uygun kapasite ${limit}.`,
            planJobs.every(
              (j) =>
                j.plannedQty === undefined && j.planningVersion === undefined,
            )
              ? "warning"
              : "critical",
          );
      }
      for (const a of d.receipts) {
        if (["inputQty", "unit", "piecesPerUnit"].some((k) => k in a)) {
          const raw = a.inputQty * a.piecesPerUnit;
          if (
            !["adet", "kg", "m", "çubuk"].includes(a.unit) ||
            !Number.isFinite(raw) ||
            raw <= 0 ||
            Math.abs(raw - a.qty) > 1e-8
          )
            add(
              "MATERIAL_CONVERSION",
              path,
              refs(a, o.id),
              "Malzeme birimi/dönüşümü kayıtlı tam adedi vermiyor.",
            );
        } else
          add(
            "LEGACY_MATERIAL_UNIT",
            path,
            refs(a, o.id),
            "Eski adet kabulü: tedarikçi/birim dönüşüm ayrıntısı bilinmiyor.",
            "warning",
          );
      }
      const material = sum(d.receipts),
        allocated = Q.allocation(s, o.id);
      if (!Q.count(material - allocated))
        add(
          "MATERIAL_BALANCE",
          path,
          ref,
          "Net tahsis malzeme kabulünü aşıyor veya bakiye geçersiz.",
        );
      if (material > Q.receiptLimit(s, o))
        add(
          "MATERIAL_LIMIT",
          path,
          ref,
          "Kabul edilen malzeme sipariş + telafi + açık ek kabul iznini aşıyor.",
        );
      // Use order-scoped projections: a corrupt unrelated order cannot poison this order's audit.
      const scoped = {
        ...s,
        orders: [o],
        jobs: js,
        physicalTransfers: rows(s.physicalTransfers).filter(
          (t) =>
            t.order === o.id ||
            js.some((j) => j.id === t.source || j.id === t.destination),
        ),
        physicalLotUses: rows(s.physicalLotUses).filter((t) =>
          js.some((j) => j.id === t.job),
        ),
        operationInputs: rows(s.operationInputs).filter(
          (t) =>
            t.order === o.id ||
            js.some((j) => j.id === t.source || j.id === t.destination),
        ),
      };
      for (const explanation of Q.operationProof(scoped, o).issues)
        add("OPERATION_PROOF", path, ref, explanation);
      const sources = new Map(
        Q.productionSources(scoped, o).map((t) => [t.job, t.qty]),
      );
      const closedSources = new Map(
        Q.productionSources(scoped, o, true).map((t) => [t.job, t.qty]),
      );
      const dispatched = new Map(),
        released = new Map(),
        shipped = new Map();
      const consume = (map, id, qty, cap, code, p, f) => {
        const n = (map.get(id) || 0) + qty;
        map.set(id, n);
        if (!Q.count(qty) || !Q.count(n) || !Number.isFinite(cap) || n > cap)
          add(code, p, f, `Kaynak ${id}: kullanılan ${n}, uygun ${cap ?? 0}.`);
      };
      for (const t of d.dispatches) {
        const p = path + ".dispatches." + t.ref;
        if (
          !r.external ||
          t.version !== 1 ||
          t.routeKey !== r.key ||
          t.operation !== r.terminal ||
          !Array.isArray(t.sources) ||
          sum(rows(t.sources)) !== t.qty
        )
          add(
            "DISPATCH_PROOF",
            p,
            refs(t, o.id),
            "Fason gönderimi kaynak/rota/operasyon kanıtı geçersiz.",
          );
        for (const a of rows(t.sources))
          consume(
            dispatched,
            a.job,
            a.qty,
            sources.get(a.job),
            "DISPATCH_OVER_OUTPUT",
            p,
            { ...ref, job: a.job, record: t.ref },
          );
      }
      for (const t of d.returns) {
        chronology(
          d.dispatches.find((a) => a.ref === t.dispatch),
          t,
          path,
          refs(t, o.id),
        );
        if (!d.dispatches.some((a) => a.ref === t.dispatch))
          add(
            "SUPPLIER_RETURN_REFERENCE",
            path,
            ref,
            "Fason dönüşünün gönderim belgesi yok.",
          );
        if (
          t.rework &&
          !rows(s.supplierDispositions).some(
            (a) =>
              a.id === t.rework &&
              a.order === o.id &&
              a.dispatch === t.dispatch &&
              a.kind === "rework",
          )
        )
          add(
            "SUPPLIER_REWORK_REFERENCE",
            path,
            ref,
            "Fason rework dönüşünün kaynak işi yok.",
          );
      }
      const supplier = rows(s.supplierDispositions).filter(
        (t) => t.order === o.id,
      );
      for (const t of supplier) {
        const p = path + ".supplierDispositions." + t.id;
        if (
          !d.dispatches.some((a) => a.ref === t.dispatch) ||
          !["scrap", "lost", "rework"].includes(t.kind) ||
          t.user !== "Yönetici" ||
          !t.reason?.trim()
        )
          add(
            "SUPPLIER_DISPOSITION",
            p,
            refs(t),
            "Fason mutabakatı kaynak/karar/gerekçe/onay bilgisi geçersiz.",
          );
        const sourceDispatch = d.dispatches.find((a) => a.ref === t.dispatch);
        if (
          !t.rework &&
          (!Array.isArray(t.sources) ||
            !same(t.sources, sourceDispatch?.sources))
        )
          add(
            "SUPPLIER_SOURCE_PROVENANCE",
            p,
            refs(t),
            "Fason kararının üretim kaynakları gönderimle eşleşmiyor.",
          );
        if (t.kind === "rework") {
          const good = rows(t.results).reduce((n, a) => n + a.good, 0),
            scrap = rows(t.results).reduce((n, a) => n + a.scrap, 0);
          if (
            t.remaining + good + scrap !== t.qty ||
            sum(d.returns.filter((a) => a.rework === t.id)) !== good ||
            sum(supplier.filter((a) => a.rework === t.id)) !== scrap
          )
            add(
              "SUPPLIER_REWORK_BALANCE",
              p,
              refs(t),
              "Fason rework sonuçları kalan, sağlam dönüş ve hurda kayıtlarıyla eşleşmiyor.",
            );
        }
        if (
          t.rework &&
          !supplier.some(
            (a) =>
              a.id === t.rework &&
              a.kind === "rework" &&
              a.dispatch === t.dispatch,
          )
        )
          add(
            "SUPPLIER_REWORK_REFERENCE",
            p,
            refs(t),
            "Fason rework kökeni yok.",
          );
      }
      let supplierOpen = 0;
      for (const t of d.dispatches) {
        const resolved =
            sum(d.returns.filter((a) => a.dispatch === t.ref)) +
            supplier
              .filter((a) => a.dispatch === t.ref)
              .reduce(
                (n, a) => n + (a.kind === "rework" ? a.remaining : a.qty),
                0,
              ),
          open = t.qty - resolved;
        supplierOpen += open;
        if (!Q.count(open))
          add(
            "SUPPLIER_RECONCILIATION",
            path,
            refs(t, o.id),
            "Sağlam + hurda + rework kalan + kayıp gönderimi aşıyor.",
          );
      }
      const returns = d.customerReturns,
        dispositions = rows(s.returnDispositions).filter(
          (t) => t.order === o.id,
        ),
        returnTasks = rows(s.returnReworks).filter((t) => t.order === o.id);
      for (const t of returns) {
        const shipment = d.shipments.find((a) => a.ref === t.shipment);
        chronology(shipment, t, path, refs(t, o.id));
        if (!shipment)
          add(
            "CUSTOMER_RETURN_REFERENCE",
            path,
            refs(t, o.id),
            "İadenin kaynak müşteri sevkiyatı yok.",
          );
        if (!t.id)
          add(
            "LEGACY_CUSTOMER_RETURN",
            path,
            refs(t, o.id),
            "Kimliksiz tarihsel iade karantinada kalır; yeni iade dosyasına otomatik çevrilmez.",
            "warning",
          );
        else if (!["quarantine", "reversed"].includes(t.status))
          add(
            "CUSTOMER_RETURN_STATUS",
            path,
            refs(t, o.id),
            "İade durumu geçersiz.",
          );
        const decisions = dispositions.filter(
          (a) => a.caseId === t.id && !a.kind.startsWith("rework-"),
        );
        if (
          sum(decisions) > t.qty ||
          (t.status === "reversed" && decisions.length)
        )
          add(
            "RETURN_QUARANTINE_BALANCE",
            path,
            refs(t, o.id),
            "İade kararı karantinayı aşıyor veya ters kayıt kullanılmış.",
          );
      }
      for (const a of d.shipments)
        if (
          sum(
            returns.filter(
              (t) => t.shipment === a.ref && t.status !== "reversed",
            ),
          ) > a.qty
        )
          add(
            "CUSTOMER_RETURN_EXCESS",
            path,
            refs(a, o.id),
            "Net aktif iade kaynak sevkiyatı aşıyor.",
          );
      for (const t of dispositions) {
        const c = returns.find(
          (a) => a.id === t.caseId && a.status !== "reversed",
        );
        if (
          !c ||
          ![
            "scrap",
            "restock",
            "rework",
            "rework-restock",
            "rework-scrap",
          ].includes(t.kind) ||
          t.user !== "Yönetici" ||
          !t.reason?.trim() ||
          (t.shipment && t.shipment !== c?.shipment)
        )
          add(
            "RETURN_DISPOSITION_REFERENCE",
            path,
            refs(t),
            "İade kararı aktif dosya, sevkiyat veya yönetici onayıyla uyuşmuyor.",
          );
        if (
          t.kind.startsWith("rework-") &&
          !returnTasks.some((a) => a.id === t.rework && a.caseId === t.caseId)
        )
          add(
            "RETURN_REWORK_REFERENCE",
            path,
            refs(t),
            "İade rework sonucunun kaynak işi yok.",
          );
        if (
          t.kind === "rework" &&
          sum(returnTasks.filter((a) => a.id === `RR:${t.id}`)) !== t.qty
        )
          add(
            "RETURN_REWORK_QUANTITY",
            path,
            refs(t),
            "İade rework işi karar miktarıyla eşleşmiyor.",
          );
      }
      for (const t of returnTasks) {
        const origin = dispositions.find(
          (a) =>
            `RR:${a.id}` === t.id &&
            a.kind === "rework" &&
            a.caseId === t.caseId,
        );
        const good = rows(t.results).reduce((n, a) => n + a.good, 0),
          scrap = rows(t.results).reduce((n, a) => n + a.scrap, 0);
        if (
          !origin ||
          origin.qty !== t.qty ||
          t.remaining + good + scrap !== t.qty ||
          sum(
            dispositions.filter(
              (a) => a.rework === t.id && a.kind === "rework-restock",
            ),
          ) !== good ||
          sum(
            dispositions.filter(
              (a) => a.rework === t.id && a.kind === "rework-scrap",
            ),
          ) !== scrap
        )
          add(
            "RETURN_REWORK_BALANCE",
            path,
            refs(t),
            "İade rework kökeni, sonuçları ve kalan miktarı uyuşmuyor.",
          );
      }
      for (const t of d.releases) {
        const p = path + ".releases." + t.id;
        if (
          !t.id ||
          t.version !== 1 ||
          t.routeKey !== r.key ||
          t.operation !== r.terminal ||
          t.user !== "Yönetici" ||
          !Array.isArray(t.sources) ||
          sum(rows(t.sources)) !== t.qty
        )
          add(
            "FINAL_RELEASE_PROOF",
            p,
            refs(t, o.id),
            "Final onay kimliği, yetkisi, rota veya kaynak toplamı geçersiz.",
          );
        for (const a of rows(t.sources)) {
          const kind =
              t.kind === "return-restock"
                ? "return"
                : r.external
                  ? "dispatch"
                  : "job",
            id = a[kind];
          const cap =
            kind === "return"
              ? sum(
                  dispositions.filter(
                    (b) =>
                      b.caseId === id &&
                      ["restock", "rework-restock"].includes(b.kind),
                  ),
                )
              : kind === "dispatch"
                ? d.dispatches.some((b) => b.ref === id)
                  ? sum(d.returns.filter((b) => b.dispatch === id))
                  : undefined
                : closedSources.get(id);
          consume(
            released,
            kind + ":" + id,
            a.qty,
            cap,
            "FINAL_RELEASE_BEFORE_ELIGIBLE",
            p,
            { ...ref, job: a.job, record: t.id },
          );
        }
      }
      for (const t of d.shipments) {
        const p = path + ".shipments." + t.ref;
        if (
          t.version !== 1 ||
          t.routeKey !== r.key ||
          t.operation !== r.terminal ||
          !Array.isArray(t.approvals) ||
          sum(rows(t.approvals)) !== t.qty
        )
          add(
            "SHIPMENT_PROOF",
            p,
            refs(t, o.id),
            "Sevkiyatın final onay bağlantısı veya rota kanıtı geçersiz.",
          );
        for (const a of rows(t.approvals))
          chronology(
            d.releases.find((b) => b.id === a.release),
            t,
            p,
            refs(t, o.id),
          );
        for (const a of rows(t.approvals))
          consume(
            shipped,
            a.release,
            a.qty,
            d.releases.find((b) => b.id === a.release)?.qty,
            "SHIPMENT_OVER_APPROVED",
            p,
            refs(t, o.id),
          );
      }
      const net =
          sum(d.shipments) -
          sum(returns.filter((t) => t.status !== "reversed")),
        ready = sum(d.releases) - sum(d.shipments);
      if (!Q.count(net) || net > o.qty || !Q.count(ready))
        add(
          "SHIPMENT_BALANCE",
          path,
          ref,
          "Net sevkiyat veya onaydan kalan stok negatif/sipariş üstünde.",
        );
      const compensation = rows(s.compensations).filter(
          (t) => t.order === o.id,
        ),
        compensationUsed = new Map();
      for (const t of compensation) {
        const j = jobs.get(t.source),
          loss =
            supplier.find(
              (a) => a.id === t.source && ["scrap", "lost"].includes(a.kind),
            ) ||
            dispositions.find(
              (a) =>
                a.id === t.source && ["scrap", "rework-scrap"].includes(a.kind),
            );
        const cap =
          j?.order === o.id ? j.scrap + (j.ux05?.setup || 0) : loss?.qty;
        if (t.operation !== 0 || t.user !== "Yönetici" || !t.reason?.trim())
          add(
            "COMPENSATION_AUTHORITY",
            path,
            refs(t),
            "Telafi ilk operasyon, yönetici ve gerekçe gerektirir.",
          );
        consume(
          compensationUsed,
          t.source,
          t.qty,
          cap,
          "COMPENSATION_EXCESS",
          path,
          refs(t),
        );
      }
      const versions = rows(s.drawingVersions).filter((t) => t.order === o.id);
      duplicate(versions, "revision", "drawingVersions", o.id, true);
      if (versions.length) {
        const current = versions.at(-1);
        if (current.revision !== o.revision || current.url !== o.drawing)
          add(
            "DRAWING_CURRENT_REFERENCE",
            path,
            ref,
            "Sipariş çizimi/revizyonu son kayıtlı sürümle eşleşmiyor.",
          );
      }
      for (const [i, v] of versions.entries())
        if (
          v.legacy === true &&
          (i !== 0 ||
            v.id !== `DRAW:${o.id}:0` ||
            v.reason !== "İlk revizyon öncesi korunan mevcut çizim")
        )
          add(
            "DRAWING_LEGACY_PROVENANCE",
            path,
            refs(v),
            "Tarihsel çizim yalnız korunmuş ilk revizyon olabilir.",
          );
      for (const v of versions)
        if (
          v.legacy !== true &&
          (!v.approved ||
            v.user !== "Yönetici" ||
            !v.reason?.trim() ||
            !/^data:(application\/pdf|image\/(png|jpeg));base64,/.test(v.url))
        )
          add(
            "DRAWING_VERSION",
            path,
            refs(v),
            "Çizim revizyonunun onayı, gerekçesi veya dosya biçimi geçersiz.",
          );
      const quarantine =
        sum(returns.filter((t) => t.status !== "reversed")) -
        sum(dispositions.filter((t) => !t.kind.startsWith("rework-")));
      balances.orders.push({
        order: o.id,
        material,
        allocated,
        materialFree: material - allocated,
        supplierOpen,
        recordedApproved: sum(d.releases),
        ready,
        net,
        quarantine,
        historicalShipment: sum(
          s.shipments.filter((t) => jobs.get(t.job)?.order === o.id),
        ),
      });
      if (s.shipments.some((t) => jobs.get(t.job)?.order === o.id))
        add(
          "LEGACY_SHIPMENT",
          path,
          ref,
          "Eski üst düzey sevkiyatlar tarihsel kayıttır; net müşteri sevkiyatına eklenmez.",
          "warning",
        );
    }
    for (const t of rows(s.materialAuthorizations))
      if (t.user !== "Yönetici" || !t.reason?.trim() || !t.qty)
        add(
          "MATERIAL_AUTHORIZATION",
          "materialAuthorizations",
          refs(t),
          "Ek kabul izni yönetici, pozitif adet ve gerekçe gerektirir.",
        );
    for (const b of [...balances.orders, ...balances.jobs])
      for (const [k, v] of Object.entries(b))
        if (typeof v === "number" && !Number.isSafeInteger(v))
          add(
            "UNSAFE_BALANCE",
            "balances." + k,
            b,
            "Toplam bakiye güvenli tam sayı değil.",
          );
    return finish();
  }
  /* Order-scoped fail-closed guard. Comparing complete slices captures removed as
     well as appended records. A pre-existing invalid order stays read-only; unrelated
     valid orders and user selection remain available. No repair command is implied. */
  function guard(before, after) {
    const a = validate(before),
      b = validate(after),
      touched = new Set();
    const ids = new Set(
      [...rows(before.orders), ...rows(after.orders)].map((o) => o.id),
    );
    const slice = (s, id) => {
      const jobs = rows(s.jobs).filter((j) => j.order === id),
        jobIds = new Set(jobs.map((j) => j.id));
      const out = {
        order: rows(s.orders).filter((o) => o.id === id),
        jobs,
        ledger: s.ux06?.[id],
      };
      for (const [k, v] of Object.entries(s))
        if (Array.isArray(v) && !["orders", "jobs"].includes(k))
          out[k] = v.filter(
            (r) =>
              r.order === id ||
              jobIds.has(r.job) ||
              jobIds.has(r.source) ||
              jobIds.has(r.destination),
          );
      return out;
    };
    for (const id of ids)
      if (!same(slice(before, id), slice(after, id))) touched.add(id);
    // Unknown-order changes must not fall outside the affected-record boundary.
    for (const id of new Set([
      ...Object.keys(before.ux06 || {}),
      ...Object.keys(after.ux06 || {}),
    ]))
      if (!same(before.ux06?.[id], after.ux06?.[id])) touched.add(id);
    const unscoped = (s) =>
      Object.fromEntries(
        Object.entries(s)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [
            k,
            k === "orders" || k === "jobs"
              ? []
              : v.filter(
                  (r) =>
                    !ids.has(r.order) &&
                    !rows(s.jobs).some(
                      (j) =>
                        ids.has(j.order) &&
                        [r.job, r.source, r.destination].includes(j.id),
                    ),
                ),
          ]),
      );
    const unscopedChanged = !same(unscoped(before), unscoped(after));
    const previous = new Set(a.critical.map((f) => JSON.stringify(f)));
    const blocked = [
      ...a.critical.filter(
        (f) =>
          (touched.size || unscopedChanged) &&
          (!f.refs.order ||
            touched.has(f.refs.order) ||
            (unscopedChanged && !ids.has(f.refs.order))),
      ),
      ...b.critical.filter(
        (f) => !previous.has(JSON.stringify(f)) || touched.has(f.refs.order),
      ),
    ];
    // Historical exemptions are a read contract, never a way to invent new stock.
    for (const j of rows(after.jobs))
      if (j.ux05) {
        const old = rows(before.jobs).find((a) => a.id === j.id);
        const good = old?.ux05 ? old.ux05.legacyGood : old?.good || 0;
        const baseline = old?.ux05
          ? old.ux05.legacyBaseline
          : (old?.good || 0) + (old?.scrap || 0);
        if (j.ux05.legacyGood !== good || j.ux05.legacyBaseline !== baseline)
          blocked.push({
            code: "LEGACY_BASELINE_CHANGED",
            severity: "critical",
            path: "jobs." + j.id,
            refs: { order: j.order, job: j.id },
            explanation:
              "Yeni işlem tarihsel başlangıç miktarını değiştiremez.",
            remediation:
              "Özgün veriyi koruyun; tarihsel kayıt mutabakatı ayrı açık işlem gerektirir.",
          });
      }
    if (!same(before.shipments, after.shipments))
      blocked.push({
        code: "LEGACY_SHIPMENT_CHANGED",
        severity: "critical",
        path: "shipments",
        refs: {},
        explanation: "Tarihsel sevkiyat arşivi yeni işlemlerle değiştirilemez.",
        remediation:
          "Yeni müşteri sevkiyatını final onaya bağlı komutla kaydedin.",
      });
    // Unsupported historical routes remain readable, but new business mutations are unsafe.
    blocked.push(
      ...b.warnings.filter(
        (f) => f.code === "UNSUPPORTED_ROUTE" && touched.has(f.refs.order),
      ),
    );
    return blocked.length
      ? {
          ok: false,
          message:
            "Veri bütünlüğü nedeniyle işlem kaydedilmedi: " +
            blocked[0].explanation,
          findings: blocked,
        }
      : { ok: true };
  }
  return Object.freeze({ validate, guard });
});
