/* Actual Web Locks; two independent pages in one disposable browser context. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { fresh, completed } = require("./p0-fixtures.cjs"),
  { fixture } = require("./p0-transfer-fixture.cjs");
const S = require("../assets/js/shipment-service.js"),
  K = require("../assets/js/stock-service.js"),
  X = require("../assets/js/transfer-service.js");
const root = path.resolve(process.env.RITIM_APP_ROOT || path.resolve(__dirname, "..")),
  out = path.resolve(
    root,
    process.env.P0_EVIDENCE_DIR || "docs/p0-08/evidence/concurrency-browser",
  ),
  key = "ritimLiteAnonymousDemoV1";
const results = [],
  telemetry = [];
let browser, server, base, current;
async function run(name, fn) {
  if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER))
    return;
  current = name;
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.stack });
  }
  console.log(results.at(-1).status, name);
}
async function pair(seed, fn) {
  const context = await browser.newContext({
      viewport: { width: 390, height: 1000 },
      locale: "tr-TR",
    }),
    raw = JSON.stringify(seed);
  await context.addInitScript(
    ({ raw, key }) => {
      if (window.top === window && localStorage.getItem(key) === null)
        localStorage.setItem(key, raw);
    },
    { raw, key },
  );
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(8000);
    p.on("pageerror", (e) =>
      telemetry.push({ test: current, kind: "pageerror", message: e.message }),
    );
    p.on("requestfailed", (r) =>
      telemetry.push({
        test: current,
        kind: "requestfailed",
        url: r.url(),
        message: r.failure()?.errorText,
      }),
    );
    p.on("response", (r) => {
      if (r.status() >= 400 && !r.url().endsWith("/favicon.ico"))
        telemetry.push({
          test: current,
          kind: "http",
          url: r.url(),
          status: r.status(),
        });
    });
    await p.goto(base);
    await p.waitForFunction(() => window.RitimCommands && window.RitimStock);
    return p;
  };
  try {
    const a = await page(),
      b = await page();
    assert.equal(
      await a.evaluate(() => typeof navigator.locks?.request),
      "function",
    );
    await fn({ a, b, page, context, raw });
  } finally {
    await context.close();
  }
}
const submit = (p, kind, args, id) =>
  p.evaluate(({ kind, args, id }) => RitimCommands.submit(kind, args, { id }), {
    kind,
    args,
    id,
  });
const ready = () => {
  const s = completed();
  assert.equal(S.release(s, "SIP-P0", { qty: 20 }).ok, true);
  return s;
};
const ship = (p, n, ref, id) =>
  submit(p, "shipping.ship", { order: "SIP-P0", qty: n, ref }, id);
async function snapshot(p) {
  return p.evaluate(() => JSON.parse(localStorage.getItem(KEY)));
}
async function consistent(a, b) {
  const stored = await snapshot(a);
  await Promise.all([a.reload(), b.reload()]);
  for (const p of [a, b]) {
    assert.deepEqual(await p.evaluate(() => state), stored);
    const audit = await p.evaluate(() => RitimIntegrity.validate(state));
    assert.deepEqual(audit.critical, []);
  }
  if (stored.transactionState) {
    assert.deepEqual(
      stored.transactionState.commands.map((c) => c.revision),
      Array.from({ length: stored.transactionState.revision }, (_, i) => i + 1),
    );
    assert.equal(
      new Set(stored.transactionState.commands.map((c) => c.id)).size,
      stored.transactionState.commands.length,
    );
  }
  return stored;
}
async function race(a, b, kind, argsA, argsB) {
  const [ra, rb] = await Promise.all([
    submit(a, kind, argsA, "A"),
    submit(b, kind, argsB, "B"),
  ]);
  assert.equal([ra, rb].filter((r) => r.ok).length, 1);
  const loser = ra.ok ? b : a,
    args = ra.ok ? argsB : argsA;
  const retry = await submit(loser, kind, args, ra.ok ? "B" : "A");
  assert.equal(retry.ok, false);
  return { ra, rb };
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  server = http.createServer((req, res) => {
    const name = new URL(req.url, "http://localhost").pathname,
      file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (e, data) => {
      if (e) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader(
        "Content-Type",
        {
          ".js": "text/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".pdf": "application/pdf",
        }[path.extname(file)] || "application/octet-stream",
      );
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.AUDIT_CHROME || undefined,
  });
  await run("20 approved: stale Tab A ships 15, Tab B cannot ship 15", () =>
    pair(ready(), async ({ a, b }) => {
      assert.equal((await ship(a, 15, "SHIP-A", "A")).ok, true);
      assert.equal(await b.evaluate(() => dataSession.revision), 0);
      const rejected = await ship(b, 15, "SHIP-B", "B");
      assert.equal(rejected.ok, false);
      assert.notEqual(rejected.code, "LOCK_BUSY");
      const s = await consistent(a, b);
      assert.equal(s.ux06["SIP-P0"].shipments.length, 1);
      assert.equal(s.transactionState.revision, 1);
      assert.equal(s.ux06["SIP-P0"].shipments[0].qty, 15);
    }),
  );
  await run(
    "simultaneous shipment attempts preserve one complete history and no overspend",
    () =>
      pair(ready(), async ({ a, b }) => {
        await race(
          a,
          b,
          "shipping.ship",
          { order: "SIP-P0", qty: 15, ref: "SHIP-A" },
          { order: "SIP-P0", qty: 15, ref: "SHIP-B" },
        );
        const s = await consistent(a, b);
        assert.equal(s.ux06["SIP-P0"].shipments.length, 1);
        assert.equal(s.transactionState.commands.length, 1);
      }),
  );
  await run(
    "two simultaneous operation reservations cannot reserve the same approved 20",
    () =>
      pair(completed({ route: ["İmalat", "Tesviye"] }), async ({ a, b }) => {
        await race(
          a,
          b,
          "planning.create",
          { order: "SIP-P0", id: "NEXT-A", operation: 1, qty: 15 },
          { order: "SIP-P0", id: "NEXT-B", operation: 1, qty: 15 },
        );
        const s = await consistent(a, b);
        assert.equal(s.operationInputs.length, 1);
        assert.equal(s.operationInputs[0].qty, 15);
      }),
  );
  await run(
    "same durable id is acknowledged once across pages and conflicts reject changed payload",
    () =>
      pair(ready(), async ({ a, b }) => {
        const [ra, rb] = await Promise.all([
          ship(a, 5, "SAME", "stable-id"),
          ship(b, 5, "SAME", "stable-id"),
        ]);
        assert.ok(ra.ok || rb.ok);
        const duplicate = await ship(b, 5, "SAME", "stable-id");
        assert.equal(duplicate.ok, true);
        assert.equal(duplicate.duplicate, true);
        assert.equal(
          (await ship(a, 6, "CHANGED", "stable-id")).code,
          "IDEMPOTENCY_CONFLICT",
        );
        const s = await consistent(a, b);
        assert.equal(s.ux06["SIP-P0"].shipments.length, 1);
        assert.equal(s.transactionState.revision, 1);
      }),
  );
  await run(
    "two transfer acceptances produce one accepted lot and one acceptance event",
    () => {
      const s = fixture();
      assert.equal(
        X.issue(s, {
          id: "MOVE",
          source: "WO-P0",
          destination: "TARGET",
          inputLot: "INPUT:WO-P0",
          qty: 25,
          reason: "split",
        }).ok,
        true,
      );
      return pair(s, async ({ a, b }) => {
        await race(a, b, "transfers.accept", { id: "MOVE" }, { id: "MOVE" });
        const s = await consistent(a, b);
        assert.equal(
          s.physicalTransfers[0].history.filter((e) => e.action === "accept")
            .length,
          1,
        );
        assert.equal(
          await a.evaluate(
            () =>
              RitimQuantities.jobBalance(state.jobs[1], state.orders[0], state)
                .received,
          ),
          25,
        );
      });
    },
  );
  await run("concurrent final releases cannot approve 15+15 from 20", () =>
    pair(completed(), async ({ a, b }) => {
      await race(
        a,
        b,
        "shipping.release",
        { order: "SIP-P0", qty: 15 },
        { order: "SIP-P0", qty: 15 },
      );
      const s = await consistent(a, b);
      assert.equal(s.ux06["SIP-P0"].releases.length, 1);
      assert.equal(s.ux06["SIP-P0"].releases[0].qty, 15);
    }),
  );
  await run(
    "customer returns and restocking each spend their source only once",
    () => {
      const s = ready();
      S.ship(s, "SIP-P0", { qty: 20, ref: "SHIP" });
      return pair(s, async ({ a, b }) => {
        const args = {
          order: "SIP-P0",
          shipment: "SHIP",
          qty: 15,
          reason: "Hasar",
        };
        await race(a, b, "stock.customerReturn", args, args);
        let stored = await snapshot(a);
        assert.equal(stored.ux06["SIP-P0"].customerReturns.length, 1);
        const id = stored.ux06["SIP-P0"].customerReturns[0].id,
          decision = {
            order: "SIP-P0",
            caseId: id,
            qty: 15,
            kind: "restock",
            reason: "Kontrol",
          };
        const [ra, rb] = await Promise.all([
          submit(a, "stock.disposeReturn", decision, "C"),
          submit(b, "stock.disposeReturn", decision, "D"),
        ]);
        assert.equal([ra, rb].filter((r) => r.ok).length, 1);
        assert.equal(
          (
            await submit(
              ra.ok ? b : a,
              "stock.disposeReturn",
              decision,
              ra.ok ? "D" : "C",
            )
          ).ok,
          false,
        );
        stored = await consistent(a, b);
        assert.equal(stored.returnDispositions.length, 1);
        assert.equal(
          stored.ux06["SIP-P0"].releases.filter(
            (r) => r.kind === "return-restock",
          ).length,
          1,
        );
        assert.equal(stored.transactionState.revision, 2);
      });
    },
  );
  await run(
    "interrupted write acknowledgement then close/reopen retries durable receipt without replay",
    () =>
      pair(ready(), async ({ a, b, page }) => {
        await a.evaluate(() => {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
            const r = original.call(this, k, v);
            if (this === localStorage) throw Error("lost acknowledgement");
            return r;
          };
        });
        const r = await ship(a, 5, "SHIP", "interrupted");
        assert.equal(r.ok, false);
        assert.equal(r.uncertain, true);
        const download = a.waitForEvent("download");
        await a.locator("#concurrency-draft-export").click();
        const saved = JSON.parse(
          fs.readFileSync(await (await download).path(), "utf8"),
        );
        assert.equal(saved.commandId, "interrupted");
        await a.close();
        const c = await page();
        const retry = await ship(c, 5, "SHIP", saved.commandId);
        assert.equal(retry.duplicate, true);
        const s = await consistent(c, b);
        assert.equal(s.transactionState.revision, 1);
        assert.equal(s.ux06["SIP-P0"].shipments.length, 1);
      }),
  );
  await run(
    "actual lock contention fails closed and closing lock owner permits safe retry",
    () =>
      pair(ready(), async ({ a, b }) => {
        await a.evaluate(() => {
          window.lockHeld = false;
          window.hold = navigator.locks
            .request(
              RitimTransactions.lockName(KEY),
              { mode: "exclusive" },
              async () => {
                window.lockHeld = true;
                await new Promise(() => {});
              },
            )
            .catch(() => {});
        });
        await a.waitForFunction(() => window.lockHeld);
        const before = await b.evaluate(() => localStorage.getItem(KEY));
        assert.equal((await ship(b, 5, "SHIP", "busy")).code, "LOCK_BUSY");
        assert.equal(await b.evaluate(() => localStorage.getItem(KEY)), before);
        await a.close();
        assert.equal((await ship(b, 5, "SHIP", "busy")).ok, true);
        const s = await snapshot(b);
        assert.equal(s.transactionState.revision, 1);
      }),
  );
  await run(
    "unsupported Web Locks never writes and keeps audit/export usable",
    () =>
      pair(ready(), async ({ a, b }) => {
        await b.addInitScript(() =>
          Object.defineProperty(navigator, "locks", {
            configurable: true,
            value: undefined,
          }),
        );
        await b.reload();
        const before = await b.evaluate(() => localStorage.getItem(KEY));
        const r = await ship(b, 5, "SHIP", "unsupported");
        assert.equal(r.code, "LOCK_UNSUPPORTED");
        assert.equal(await b.evaluate(() => localStorage.getItem(KEY)), before);
        await b.evaluate(() => go("audit"));
        assert.equal(await b.locator(".ux07-wrap").count(), 1);
        await b.evaluate(() => openDataSafety());
        assert.equal(await b.locator("#recovery-export").isEnabled(), true);
        assert.match(
          await b.locator("#concurrency-notice").innerText(),
          /kapalı/,
        );
      }),
  );
  await run(
    "quota during locked transaction preserves memory/history; same id retries once",
    () =>
      pair(ready(), async ({ a, b }) => {
        const before = await a.evaluate(() => ({
          memory: JSON.stringify(state),
          raw: localStorage.getItem(KEY),
        }));
        await a.evaluate(() => {
          window.nativeWrite = Storage.prototype.setItem;
          Storage.prototype.setItem = function (...args) {
            if (this === localStorage)
              throw new DOMException("full", "QuotaExceededError");
            return nativeWrite.apply(this, args);
          };
        });
        const r = await ship(a, 5, "SHIP", "quota");
        assert.equal(r.ok, false);
        assert.deepEqual(
          await a.evaluate(() => ({
            memory: JSON.stringify(state),
            raw: localStorage.getItem(KEY),
          })),
          before,
        );
        assert.match(await a.locator(".toast").innerText(), /kaydedilmedi/);
        await a.evaluate(() => (Storage.prototype.setItem = nativeWrite));
        assert.equal((await ship(a, 5, "SHIP", "quota")).ok, true);
        assert.equal((await ship(a, 5, "SHIP", "quota")).duplicate, true);
        const s = await consistent(a, b);
        assert.equal(s.transactionState.revision, 1);
      }),
  );
  await run(
    "storage event invalidates old revision without losing unsaved form inputs",
    () =>
      pair(ready(), async ({ a, b }) => {
        await b.evaluate(() => RitimUX06.openShipping("SIP-P0"));
        await b.locator("#ux6-qty").fill("7");
        await b.locator("#ux6-ref").fill("UNSAVED-B");
        await ship(a, 5, "SHIP-A", "A");
        await b.waitForFunction(() =>
          document
            .querySelector("#concurrency-notice")
            ?.textContent.includes("görünüm eski"),
        );
        assert.equal(await b.locator("#ux6-ref").inputValue(), "UNSAVED-B");
        assert.equal(await b.evaluate(() => dataSession.revision), 0);
        await b.locator("#concurrency-notice button").click();
        await b.waitForFunction(() => dataSession.revision === 1);
        assert.equal(await b.locator("#ux6-qty").inputValue(), "7");
        assert.equal(await b.locator("#ux6-ref").inputValue(), "UNSAVED-B");
        await b.screenshot({
          path: path.join(out, "stale-form-preserved-390.png"),
          fullPage: true,
          animations: "disabled",
        });
        assert.equal((await b.evaluate(() => RitimUX06.commit())).ok, true);
        const s = await consistent(a, b);
        assert.deepEqual(
          s.ux06["SIP-P0"].shipments.map((r) => r.qty),
          [5, 7],
        );
      }),
  );
  await run(
    "submit captures operator quantity before async lock and preserves newer edits",
    () => {
      const s = completed();
      s.jobs[0].good = 0;
      s.jobs[0].state = "running";
      return pair(s, async ({ a, b }) => {
        await a.evaluate(() => RitimUX.openProduction("WO-P0"));
        await a.locator("#ux05-qty").fill("5");
        const r = await a.evaluate(() => {
          const pending = RitimUX05.production("WO-P0");
          const input = document.getElementById("ux05-qty");
          input.value = "9";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return pending;
        });
        assert.equal(r.ok, true);
        assert.equal(await a.locator("#ux05-qty").inputValue(), "9");
        assert.equal((await snapshot(a)).jobs[0].ux05.pending, 5);
        await consistent(a, b);
      });
    },
  );
  await run(
    "double submission of the same UI production command has one physical effect",
    () => {
      const s = completed();
      s.jobs[0].good = 0;
      s.jobs[0].state = "running";
      return pair(s, async ({ a, b }) => {
        await a.evaluate(() => RitimUX.openProduction("WO-P0"));
        await a.locator("#ux05-qty").fill("5");
        const r = await a.evaluate(() =>
          Promise.all([
            RitimUX05.production("WO-P0"),
            RitimUX05.production("WO-P0"),
          ]),
        );
        assert.equal(r[0].ok, true);
        assert.equal(r[1].duplicate, true);
        const s = await consistent(a, b);
        assert.equal(s.jobs[0].ux05.pending, 5);
        assert.equal(s.transactionState.revision, 1);
      });
    },
  );
  await run(
    "legacy saveShipment entry also revalidates latest disk under the shared lock",
    () =>
      pair(ready(), async ({ a, b }) => {
        await b.evaluate(() => {
          chosenJob = "WO-P0";
          modal = "ship";
          renderModal();
        });
        await b.locator("#shipQty").fill("15");
        await ship(a, 15, "SHIP-A", "A");
        assert.equal((await b.evaluate(() => saveShipment())).ok, false);
        const s = await consistent(a, b);
        assert.equal(s.ux06["SIP-P0"].shipments.length, 1);
      }),
  );
  await run(
    "simultaneous supplier partial returns preserve dispatch reconciliation",
    () => {
      const s = completed({ route: ["İmalat", "Kaplama"] });
      S.dispatch(s, "SIP-P0", {
        qty: 20,
        ref: "EXT",
        supplier: "Demo",
        due: "2026-12-01",
      });
      return pair(s, async ({ a, b }) => {
        const args = {
          order: "SIP-P0",
          dispatch: "EXT",
          qty: 15,
          kind: "good",
        };
        await race(a, b, "stock.supplierReturn", args, args);
        const stored = await consistent(a, b);
        assert.equal(stored.ux06["SIP-P0"].returns.length, 1);
        assert.equal(stored.ux06["SIP-P0"].returns[0].qty, 15);
      });
    },
  );
  await run("stale planning reductions revalidate latest remaining plan", () =>
    pair(fresh(), async ({ a, b }) => {
      const args = { job: "WO-P0", qty: 15, reason: "split" };
      await race(a, b, "planning.reduce", args, args);
      const s = await consistent(a, b);
      assert.equal(s.jobs[0].plannedQty, 5);
      assert.equal(s.planningEvents.length, 1);
    }),
  );
  await run(
    "stale refresh preserves wizard draft and physical return confirmation",
    () => {
      const seed = fixture();
      X.issue(seed, {
        id: "MOVE",
        source: "WO-P0",
        destination: "TARGET",
        inputLot: "INPUT:WO-P0",
        qty: 25,
        reason: "split",
      });
      return pair(seed, async ({ a, b }) => {
        await b.evaluate(() => RitimUX.openProduction("WO-P0"));
        await b.locator('[data-return-confirm="MOVE"]').check();
        await b.locator("#transfer-reason").fill("Unsaved return reason");
        await submit(
          a,
          "workforce.assign",
          { id: "TARGET", operator: "Operatör A" },
          "owner",
        );
        await b.waitForFunction(() =>
          document
            .querySelector("#concurrency-notice")
            ?.textContent.includes("görünüm eski"),
        );
        await b.evaluate(() => RitimConcurrencyUI.refresh());
        assert.equal(
          await b.locator('[data-return-confirm="MOVE"]').isChecked(),
          true,
        );
        assert.equal(
          await b.locator("#transfer-reason").inputValue(),
          "Unsaved return reason",
        );
        await b.evaluate(() => openWizard());
        await b.locator('[data-wiz="customer"]').fill("Unsaved customer");
        await submit(
          a,
          "workforce.assign",
          { id: "TARGET", operator: "Operatör B" },
          "owner-2",
        );
        await b.waitForFunction(() =>
          document
            .querySelector("#concurrency-notice")
            ?.textContent.includes("görünüm eski"),
        );
        await b.evaluate(() => RitimConcurrencyUI.refresh());
        assert.equal(
          await b.locator('[data-wiz="customer"]').inputValue(),
          "Unsaved customer",
        );
      });
    },
  );
  await run(
    "corrupt remote snapshot never overwrites data and keeps unsaved fields exportable",
    () =>
      pair(ready(), async ({ a, b }) => {
        await b.evaluate(() => RitimUX06.openShipping("SIP-P0"));
        await b.locator("#ux6-ref").fill("Unsaved document");
        await a.evaluate(() =>
          localStorage.setItem(KEY, "{broken by external fixture"),
        );
        assert.equal((await b.evaluate(() => RitimUX06.commit())).ok, false);
        assert.equal(
          await b.evaluate(() => localStorage.getItem(KEY)),
          "{broken by external fixture",
        );
        assert.equal(await b.locator("#recovery-export").isEnabled(), true);
        const downloaded = b.waitForEvent("download");
        await b.locator("#concurrency-draft-export").click();
        const file = await downloaded,
          draft = JSON.parse(fs.readFileSync(await file.path(), "utf8"));
        assert.ok(
          draft.fields.some(
            (f) => f.selector === "#ux6-ref" && f.value === "Unsaved document",
          ),
        );
      }),
  );
  await run(
    "Web Locks getter access denial keeps read-only recovery usable",
    () =>
      pair(ready(), async ({ a, b }) => {
        await b.addInitScript(() =>
          Object.defineProperty(navigator, "locks", {
            configurable: true,
            get() {
              throw new DOMException("denied", "SecurityError");
            },
          }),
        );
        await b.reload();
        const before = await b.evaluate(() => localStorage.getItem(KEY));
        assert.equal(
          (await ship(b, 5, "SHIP", "locks-denied")).code,
          "LOCK_FAILURE",
        );
        assert.equal(await b.evaluate(() => localStorage.getItem(KEY)), before);
        assert.match(
          await b.locator("#concurrency-notice").innerText(),
          /kapalı/,
        );
        await b.evaluate(() => openDataSafety());
        assert.equal(await b.locator("#recovery-export").isEnabled(), true);
      }),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
  const applicationErrors = telemetry.filter(
    (e) => !e.url?.startsWith("chrome-extension://"),
  );
  const report = {
    date: new Date().toISOString(),
    browser: "Chrome with native navigator.locks",
    results,
    telemetry,
    applicationErrors,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
  };
  fs.writeFileSync(
    path.join(out, "browser-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      failed: report.failed,
      applicationErrors: applicationErrors.length,
    }),
  );
  if (report.failed || applicationErrors.length) process.exitCode = 1;
})().catch(async (e) => {
  console.error(e);
  if (browser) await browser.close();
  if (server) server.close();
  process.exitCode = 1;
});
