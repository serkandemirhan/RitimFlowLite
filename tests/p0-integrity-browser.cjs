const {trackPage}=require("./browser-transactions.cjs");
/* Disposable profiles only; never connects to the user's stored demo origin. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { fresh, completed } = require("./p0-fixtures.cjs"),
  { fixture } = require("./p0-transfer-fixture.cjs");
const root = path.resolve(process.env.RITIM_APP_ROOT || path.resolve(__dirname, "..")),
  out = path.resolve(
    root,
    process.env.P0_EVIDENCE_DIR || "docs/p0-06/evidence/integrity-browser",
  );
const key = "ritimFlowLite:fictional-demo:v1",
  results = [],
  applicationErrors = [];
let browser, server, base;
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.stack });
  }
  console.log(results.at(-1).status, name);
}
async function isolated(seed, width, fn) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: "tr-TR",
  });
  const raw = typeof seed === "string" ? seed : JSON.stringify(seed);
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key, raw },
  );
  const page = await context.newPage();
  await trackPage(page);
  page.on("pageerror", (e) => applicationErrors.push(e.message));
  page.setDefaultTimeout(7000);
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.RitimUX07);
    await fn(page, raw);
  } finally {
    await context.close();
  }
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
          ".html": "text/html",
          ".css": "text/css",
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
  for (const width of [1440, 390, 360])
    await run(
      `pure audit ${width}: 250/150/100, historical 60, physical 25 and planned 50`,
      () =>
        isolated(fixture(), width, async (p, raw) => {
          const result = await p.evaluate(async () => {
            const before = JSON.stringify(state),
              raw = localStorage.getItem(KEY);
            let writes = 0;
            const write = Storage.prototype.setItem;
            Storage.prototype.setItem = function () {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
              writes++;
              throw Error("audit write");
            };
            try {
              go("audit");
              render();
              const a = RitimUX07.audit();
              return {
                a,
                before,
                after: JSON.stringify(state),
                raw,
                rawAfter: localStorage.getItem(KEY),
                writes,
              };
            } finally {
              Storage.prototype.setItem = write;
            }
          });
          assert.equal(result.before, result.after);
          assert.equal(result.raw, raw);
          assert.equal(result.rawAfter, raw);
          assert.equal(result.writes, 0);
          assert.deepEqual(result.a.critical, []);
          const b = result.a.balances.jobs[0];
          assert.equal(b.physicalUnprocessed, 25);
          assert.equal(b.unstartedPlan, 50);
          assert.equal(b.historicalGood, 60);
          assert.ok(
            await p
              .locator("#page")
              .innerText()
              .then((t) => t.includes("Fiziksel İşlenmemiş")),
          );
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await p.screenshot({
            path: path.join(out, `audit-${width}.png`),
            fullPage: true,
            animations: "disabled",
          });
          await p.getByRole("button", { name: "WO-P0", exact: true }).click();
          assert.equal(await p.evaluate(() => chosenJob), "WO-P0");
        }),
    );
  await run(
    "critical overplan and missing allocation surfaced; write blocked, raw unchanged",
    () => {
      const s = completed({ qty: 250, planned: 150 });
      s.jobs[0].ux05.received = 200;
      s.jobs[0].good = 200;
      s.ux06["SIP-P0"].allocations[0].qty = 200;
      s.ux06["SIP-P0"].allocations.push({ job: "MISSING", qty: 1 });
      return isolated(s, 390, async (p, raw) => {
        await p.evaluate(() => go("audit"));
        for (const code of [
          "RECEIVED_OVER_PLAN",
          "ALLOCATION_OVER_PLAN",
          "ALLOCATION_JOB_REFERENCE",
        ])
          assert.ok(await p.locator(`[data-integrity-code="${code}"]`).count());
        const r = await p.evaluate(async () => {
          const before = JSON.stringify(state);
          const result = await commitState((d) =>
            RitimWorkforce.assign(d, { id: "WO-P0", operator: "Operatör A" }),
          );
          return { result, before, after: JSON.stringify(state) };
        });
        assert.equal(r.result.ok, false);
        assert.equal(r.before, r.after);
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
        await p.screenshot({
          path: path.join(out, "critical-390.png"),
          fullPage: true,
          animations: "disabled",
        });
        await p
          .getByRole("button", {
            name: "Veri Güvenliği / Ham Veri",
            exact: true,
          })
          .click();
        assert.equal(await p.locator("#recovery-export").isEnabled(), true);
        await p.reload();
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
      });
    },
  );
  await run(
    "invalid new mutation rejected at shared commit before setItem; no success toast",
    () =>
      isolated(completed(), 390, async (p, raw) => {
        const r = await p.evaluate(async () => {
          let writes = 0,
            after = 0;
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (...args) {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
            writes++;
            return original.apply(this, args);
          };
          const before = JSON.stringify(state);
          try {
            const result = await commitState(
              (d) => {
                d.ux06["SIP-P0"].allocations.push({ job: "NO", qty: 1 });
                return { ok: true };
              },
              { success: "FALSE-SUCCESS", after: () => after++ },
            );
            return {
              result,
              writes,
              after,
              before,
              current: JSON.stringify(state),
            };
          } finally {
            Storage.prototype.setItem = original;
          }
        });
        assert.equal(r.result.ok, false);
        assert.equal(r.writes, 0);
        assert.equal(r.after, 0);
        assert.equal(r.before, r.current);
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
        assert.equal(
          (await p.locator("body").innerText()).includes("FALSE-SUCCESS"),
          false,
        );
      }),
  );
  await run(
    "invalid affected order blocked while another valid order can commit and reload",
    () => {
      const s = completed();
      s.ux06["SIP-P0"].allocations.push({ job: "NO", qty: 1 });
      const other = fresh();
      other.orders[0].id = "OTHER";
      other.jobs[0].order = "OTHER";
      other.jobs[0].id = "OTHER-JOB";
      other.jobs[0].machine = "CNC-02";
      s.orders.push(other.orders[0]);
      s.jobs.push(other.jobs[0]);
      return isolated(s, 390, async (p) => {
        const r = await p.evaluate(() =>
          commitState((d) =>
            RitimWorkforce.assign(d, {
              id: "OTHER-JOB",
              operator: "Operatör B",
            }),
          ),
        );
        assert.equal(r.ok, true);
        await p.reload();
        assert.equal(await p.evaluate(() => state.jobs[1].owner), "Operatör B");
        assert.equal(
          await p.evaluate(() => state.ux06["SIP-P0"].allocations[1].job),
          "NO",
        );
      });
    },
  );
  for (const [name, raw] of [
    ["malformed", "{broken"],
    ["null fields", JSON.stringify({ ...fresh(), jobs: null })],
    ["unsupported version", JSON.stringify({ ...fresh(), schemaVersion: 99 })],
  ])
    await run(`P0-07 recovery preserved: ${name}`, () =>
      isolated(raw, 390, async (p) => {
        assert.equal(await p.locator("[data-recovery]").count(), 1);
        assert.equal(await p.locator("#recovery-export").isEnabled(), true);
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
        const r = await p.evaluate(() => commitState(() => ({ ok: true })));
        assert.equal(r.ok, false);
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
      }),
    );
  await run(
    "supported historical production is warning and audit never upgrades storage",
    () => {
      const s = completed();
      delete s.jobs[0].ux05;
      s.shipments = [{ job: "WO-P0", qty: 5 }];
      return isolated(s, 390, async (p, raw) => {
        await p.evaluate(() => go("audit"));
        assert.equal(await p.locator('[data-severity="critical"]').count(), 0);
        assert.equal(
          await p.locator('[data-integrity-code="LEGACY_PRODUCTION"]').count(),
          1,
        );
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
        assert.equal(
          await p.evaluate(() => state.jobs[0].ux05 === undefined),
          true,
        );
      });
    },
  );
  await run("machine reference validation blocks writes and preserves invalid stored data for read-only audit", async () => {
    await isolated(fresh(), 390, async (p, raw) => {
      const r = await p.evaluate(async () => {
        const before = JSON.stringify(state);
        let writes = 0, success = 0;
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function (...args) {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments); writes++; return write.apply(this, args); };
        try {
          const result = await commitState((d) => {
            d.jobs[0].machine = "CNC-MISSING";
            return { ok: true };
          }, { after: () => success++ });
          return { result, before, after: JSON.stringify(state), writes, success };
        } finally { Storage.prototype.setItem = write; }
      });
      assert.equal(r.result.ok, false);
      assert.ok(r.result.findings.some((f) => f.code === "ASSIGNMENT_MACHINE"));
      assert.equal(r.before, r.after);
      assert.equal(r.writes, 0);
      assert.equal(r.success, 0);
      assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
      await p.reload();
      assert.equal(await p.evaluate(() => state.jobs[0].machine), "CNC-01");
    });
    const damaged = fresh();
    damaged.jobs[0].machine = "CNC-MISSING";
    await isolated(damaged, 390, async (p, raw) => {
      await p.evaluate(() => go("audit"));
      assert.equal(await p.locator('[data-integrity-code="ASSIGNMENT_MACHINE"]').count(), 1);
      const result = await p.evaluate(() => commitState((d) => {
        d.jobs[0].owner = "Operatör A";
        return { ok: true };
      }));
      assert.equal(result.ok, false);
      assert.equal(await p.evaluate(() => state.jobs[0].machine), "CNC-MISSING");
      assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
      await p.evaluate(() => openDataSafety());
      assert.equal(await p.locator("#recovery-export").isEnabled(), true);
    });
  });
  await browser.close();
  await new Promise((r) => server.close(r));
  const report = {
    date: new Date().toISOString(),
    results,
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
