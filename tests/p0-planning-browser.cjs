const {trackPage}=require("./browser-transactions.cjs");
/* npm run test:browser
 * Uses an ephemeral loopback server and disposable profiles only. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { fresh, completed } = require("./p0-fixtures.cjs");
const root = path.resolve(process.env.RITIM_APP_ROOT || path.resolve(__dirname, "..")),
  out = path.resolve(
    root,
    process.env.P0_EVIDENCE_DIR || "docs/p0-05/evidence",
  );
const key = "ritimFlowLite:fictional-demo:v1",
  results = [],
  telemetry = [];
let browser, server, base, current;
async function run(name, fn) {
  current = name;
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.stack });
  }
  console.log(results.at(-1).status, name);
}
async function isolated(seed, width, fn, suffix = "") {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  const raw = JSON.stringify(seed);
  await ctx.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    },
    { key: suffix ? "ritimFlowLiteDemo" : key, raw },
  );
  const p = await ctx.newPage();
  await trackPage(p);
  p.setDefaultTimeout(7000);
  p.on("pageerror", (e) =>
    telemetry.push({ test: current, kind: "pageerror", message: e.message }),
  );
  p.on("console", (m) => {
    if (m.type() === "error")
      telemetry.push({ test: current, kind: "console", message: m.text() });
  });
  p.on("requestfailed", (r) =>
    telemetry.push({
      test: current,
      kind: "requestfailed",
      url: r.url(),
      message: r.failure()?.errorText,
    }),
  );
  p.on("response", (r) => {
    if (r.status() >= 400)
      telemetry.push({
        test: current,
        kind: "http",
        url: r.url(),
        status: r.status(),
      });
  });
  try {
    await p.goto(base + suffix);
    await p.waitForFunction(
      () => window.RitimUX06 || document.querySelector("#content"),
    );
    await fn(p, raw);
  } finally {
    await ctx.close();
  }
}
async function tab(p, t) {
  await p.evaluate((t) => {
    go("logistics");
    RitimUX06.setTab(t);
  }, t);
}
async function commit(p, t, n, ref) {
  await tab(p, t);
  await p.locator("#ux6-qty").fill(String(n));
  if (ref) await p.locator("#ux6-ref").fill(ref);
  await p.locator(".ux6-form button.full").click();
}
async function forceCommit(p, t, n, ref) {
  await tab(p, t);
  await p.locator("#ux6-qty").fill(String(n));
  if (ref) await p.locator("#ux6-ref").fill(ref);
  await p.evaluate(() => RitimUX06.commit());
}
async function result(p, type, n) {
  await p.locator("#ux05-type").selectOption(type);
  await p.locator("#ux05-qty").fill(String(n));
  await p
    .getByRole("button", { name: "Üretim Sonucunu Kaydet", exact: true })
    .click();
}
async function receive(p, n) {
  await commit(p, "material", n, "MAT-1");
  await commit(p, "allocate", n);
  await p.evaluate(() => go("production"));
  await p.locator("#ux05-receive").fill(String(n));
  await p.getByRole("button", { name: "Teslim Aldım", exact: true }).click();
  await p.getByRole("button", { name: "İşe Başla", exact: true }).click();
}
async function get(p) {
  return p.evaluate(() =>
    RitimQuantities.orderQuantities(state, state.orders[0]),
  );
}
async function picture(p, name) {
  await p.waitForTimeout(350);
  await p.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (e, b) => {
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
      res.end(b);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.AUDIT_CHROME || undefined,
  });
  async function planning(p) {
    await p.evaluate(() => newJobFor(state.orders[0].id));
  }
  async function plan(p, id, n, op = 0, machine = "") {
    await p.locator("#plan-operation").selectOption(String(op));
    await p.locator("#additionalJobId").fill(id);
    await p.locator("#additionalQty").fill(String(n));
    await p.locator("#additionalMachine").selectOption(machine);
    await p
      .getByRole("button", { name: "İş Emri Oluştur", exact: true })
      .click();
  }
  async function inputMove(p, id, action) {
    await p.locator(`[data-movement="${id}:INPUT:1"]`).click();
  }
  async function operator(p, machine) {
    await p.evaluate((m) => {
      machine = m;
      go("production");
    }, machine);
  }
  for (const width of [1440, 390, 360])
    await run(
      `P05-${width}: split 100+50 across machines, reject excess, reload and preserve history`,
      () => {
        const s = fresh({ qty: 150 });
        s.jobs = [];
        return isolated(s, width, async (p) => {
          await planning(p);
          await plan(p, "SPLIT-A", 100, 0, "CNC-01");
          await plan(p, "SPLIT-B", 50, 0, "CNC-02");
          await p.locator("#additionalJobId").fill("EXCESS");
          await p.locator("#additionalQty").fill("1");
          await p.evaluate(() => createAdditionalJob());
          assert.equal(await p.evaluate(() => state.jobs.length), 2);
          await p.reload();
          await planning(p);
          assert.deepEqual(
            await p.evaluate(() =>
              state.jobs.map((j) => [j.op, j.plannedQty, j.machine]),
            ),
            [
              [0, 100, "CNC-01"],
              [0, 50, "CNC-02"],
            ],
          );
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await picture(p, "split-" + width);
        });
      },
    );
  await run(
    "P05-next: approved source→reserve→send→accept→production→final QA→shipment",
    () =>
      isolated(
        completed({ qty: 20, route: ["İmalat", "Tesviye"] }),
        390,
        async (p) => {
          await planning(p);
          await plan(p, "SECOND", 20, 1, "CNC-02");
          assert.equal(
            await p.evaluate(
              () =>
                RitimQuantities.jobBalance(
                  state.jobs[1],
                  state.orders[0],
                  state,
                ).received,
            ),
            0,
          );
          await operator(p, "CNC-02");
          await p.locator("#ux05-receive").fill("20");
          await p.evaluate(() => RitimUX05.receive("SECOND"));
          assert.equal(await p.evaluate(() => state.jobs[1].ux05.received), 0);
          await p.evaluate(() => RitimUX05.start("SECOND"));
          assert.equal(await p.evaluate(() => state.jobs[1].state), "waiting");
          await tab(p, "allocate");
          await p.locator("#ux6-job").selectOption("SECOND");
          await p.locator("#ux6-qty").fill("1");
          await p.evaluate(() => RitimUX06.commit());
          assert.equal((await get(p)).allocated, 20);
          await planning(p);
          await inputMove(p, "SECOND", "send");
          await p.evaluate(() =>
            RitimUXPlanning.move("SECOND:INPUT:1", "send"),
          );
          assert.equal(
            await p.evaluate(() => state.operationInputs[0].status),
            "in_transit",
          );
          await p.reload();
          await planning(p);
          await inputMove(p, "SECOND", "accept");
          await p.evaluate(() =>
            RitimUXPlanning.move("SECOND:INPUT:1", "accept"),
          );
          assert.equal(
            await p.evaluate(
              () =>
                RitimQuantities.jobBalance(
                  state.jobs[1],
                  state.orders[0],
                  state,
                ).received,
            ),
            20,
          );
          await operator(p, "CNC-02");
          await p
            .getByRole("button", { name: "İşe Başla", exact: true })
            .click();
          await result(p, "pending", 20);
          await p.locator("#ux05-ig").fill("20");
          await p
            .getByRole("button", { name: /Kontrol Sonucunu Onayla/ })
            .click();
          await p
            .getByRole("button", { name: "İş Emrini Kapat", exact: true })
            .click();
          await forceCommit(p, "shipping", 20, "EARLY");
          assert.equal((await get(p)).net, 0);
          await commit(p, "quality", 20);
          await commit(p, "shipping", 20, "FINAL");
          assert.equal((await get(p)).percent, 100);
          assert.equal(
            await p.evaluate(() => state.physicalLotUses[0].lot),
            "OPINPUT:SECOND:INPUT:1",
          );
          await p.evaluate(() => go("audit"));
          assert.deepEqual(
            await p.evaluate(() => RitimUX07.audit().critical),
            [],
          );
          await picture(p, "downstream-audit");
        },
      ),
  );
  await run(
    "P05-reduce: explicit 50 plan release preserves physical 25 and frees unused material",
    () => {
      const s = completed({ qty: 250, planned: 150 });
      s.jobs[0].state = "running";
      s.jobs[0].good = 60;
      s.jobs[0].scrap = 3;
      s.jobs[0].ux05.received = 100;
      s.jobs[0].ux05.pending = 12;
      return isolated(s, 360, async (p) => {
        await planning(p);
        await p.locator('[id="reduce-WO-P0"]').fill("50");
        await p.locator('[id="reason-WO-P0"]').fill("Başlanmamış işi böl");
        await p.locator('[data-job="WO-P0"]').click();
        assert.equal((await get(p)).materialFree, 50);
        assert.equal(
          await p.evaluate(
            () =>
              RitimQuantities.jobBalance(state.jobs[0], state.orders[0], state)
                .unprocessed,
          ),
          25,
        );
        await p.reload();
        assert.equal(await p.evaluate(() => state.jobs[0].plannedQty), 100);
        assert.equal(
          await p.evaluate(() => state.allocationReleases[0].qty),
          50,
        );
      });
    },
  );
  await run(
    "P05-cancel: reserved downstream input released, full cancellation retains job history",
    () =>
      isolated(completed({ route: ["İmalat", "Tesviye"] }), 390, async (p) => {
        await planning(p);
        await plan(p, "CANCEL", 20, 1);
        await p.locator('[id="reduce-CANCEL"]').fill("20");
        await p.locator('[id="reason-CANCEL"]').fill("Plan iptal");
        await p.locator('[data-job="CANCEL"]').click();
        assert.equal(
          await p.evaluate(() => state.operationInputs[0].status),
          "cancelled",
        );
        await plan(p, "REPLACEMENT", 20, 1);
        assert.equal(await p.evaluate(() => state.jobs.length), 3);
      }),
  );
  await run(
    "P05-storage: quota failure never commits memory; read-only planning never migrates old state",
    () =>
      isolated(fresh({ qty: 100, planned: 50 }), 390, async (p, raw) => {
        await planning(p);
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
        const before = await p.evaluate(() => JSON.stringify(state));
        await p.evaluate(() => {
          Storage.prototype.setItem = function () {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
            throw new DOMException("quota", "QuotaExceededError");
          };
        });
        await plan(p, "FAILED", 50);
        assert.equal(await p.evaluate(() => JSON.stringify(state)), before);
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
      }),
  );
  await run(
    "P05-wizard: initial order creation passes shared plan validation and remains usable",
    () =>
      isolated(fresh(), 390, async (p) => {
        await p.evaluate(() => {
          openWizard();
          Object.assign(wizard, {
            id: "NEW-ORDER",
            customer: "Test Firma",
            part: "Parça",
            qty: 150,
            jobQty: 100,
            jobId: "NEW-FIRST",
            machine: "CNC-02",
            step: 3,
          });
          renderModal();
        });
        await p
          .getByRole("button", { name: "Siparişi Oluştur", exact: true })
          .click();
        assert.equal(
          await p.evaluate(
            () => state.jobs.find((j) => j.id === "NEW-FIRST").plannedQty,
          ),
          100,
        );
        await p.evaluate(() => newJobFor("NEW-ORDER"));
        await plan(p, "NEW-SECOND", 50, 0, "CNC-03");
        assert.equal(
          await p.evaluate(() =>
            state.jobs
              .filter((j) => j.order === "NEW-ORDER")
              .reduce((n, j) => n + j.plannedQty, 0),
          ),
          150,
        );
      }),
  );
  await run(
    "P05-zero-plan: fully cancelled raw plan cannot receive a new allocation through legacy logistics",
    () => {
      const seed = completed();
      seed.jobs[0].state = "waiting";
      seed.jobs[0].good = 0;
      seed.jobs[0].ux05.received = 0;
      return isolated(seed, 360, async (p) => {
        await planning(p);
        await p.locator('[id="reduce-WO-P0"]').fill("20");
        await p.locator('[id="reason-WO-P0"]').fill("Tam iptal");
        await p.locator('[data-job="WO-P0"]').click();
        assert.equal((await get(p)).materialFree, 20);
        await tab(p, "allocate");
        await p.locator("#ux6-qty").fill("1");
        await p.evaluate(() => RitimUX06.commit());
        assert.equal((await get(p)).allocated, 0);
      });
    },
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  const applicationErrors = telemetry.filter(
    (e) =>
      e.kind === "pageerror" ||
      e.kind === "requestfailed" ||
      (e.kind === "http" && !e.url.endsWith("/favicon.ico")),
  );
  const report = {
    date: new Date().toISOString(),
    browser: "Chrome via Playwright",
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
