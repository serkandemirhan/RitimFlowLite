const {trackPage}=require("./browser-transactions.cjs");
/* npm run test:browser
 * Uses an ephemeral loopback server and disposable profiles only. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { fixture } = require("./p0-transfer-fixture.cjs");
const { fresh, completed } = require("./p0-fixtures.cjs");
const root = path.resolve(process.env.RITIM_APP_ROOT || path.resolve(__dirname, "..")),
  out = path.resolve(root, process.env.P0_EVIDENCE_DIR || "docs/p0-04/evidence");
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
  async function operator(p, target = false) {
    await p.evaluate((target) => {
      machine = target ? "CNC-02" : "CNC-01";
      go("production");
    }, target);
  }
  async function send(p, id = "TR-UI", qty = 25) {
    await p.locator("#transfer-id").fill(id);
    await p.locator("#transfer-qty").fill(String(qty));
    await p.locator("#transfer-reason").fill("Makine değişimi");
    await p
      .getByRole("button", { name: "Fiziksel Transferi Gönder", exact: true })
      .click();
  }
  async function balances(p) {
    return p.evaluate(() =>
      state.jobs.map((j) =>
        RitimQuantities.jobBalance(j, state.orders[0], state),
      ),
    );
  }
  for (const width of [1440, 390, 360])
    await run(
      `T01-${width}: issue, reload, accept, duplicate guards and 25/50 conservation`,
      () =>
        isolated(fixture(), width, async (p) => {
          await operator(p);
          await send(p);
          let b = await balances(p);
          assert.equal(b[0].unprocessed, 0);
          assert.equal(b[0].unstarted, 50);
          assert.equal(b[1].unprocessed, 0);
          await p.reload();
          await operator(p, true);
          await p
            .getByRole("button", {
              name: "Fiziksel Teslimi Kabul Et",
              exact: true,
            })
            .click();
          await p.evaluate(() => RitimUXTransfers.accept("TR-UI"));
          b = await balances(p);
          assert.equal(b[1].unprocessed, 25);
          assert.equal(b[0].unprocessed, 0);
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await picture(p, "accepted-" + width);
          await p.reload();
          await operator(p);
          b = await balances(p);
          assert.equal(b[0].unstarted, 50);
          await p.locator("#ux05-qty").fill("1");
          await p.evaluate(() => RitimUX05.production("WO-P0"));
          assert.equal((await balances(p))[0].used, 75);
          await p.evaluate(() => go("audit"));
          assert.deepEqual(
            await p.evaluate(() => RitimUX07.audit().critical),
            [],
          );
        }),
    );
  await run(
    "T02: 75 physical transfer rejected, pending transfer reserves destination capacity from direct receipt",
    () =>
      isolated(
        (() => {
          const s = fixture();
          s.ux06[s.orders[0].id].receipts.push({ qty: 25, ref: "TARGET-RAW" });
          s.ux06[s.orders[0].id].allocations.push({ qty: 25, job: "TARGET" });
          return s;
        })(),
        390,
        async (p) => {
          await operator(p);
          await send(p, "TOO-MUCH", 75);
          assert.equal(
            await p.evaluate(() => state.physicalTransfers?.length || 0),
            0,
          );
          await send(p);
          await operator(p, true);
          await p.locator("#ux05-receive").fill("1");
          await p
            .getByRole("button", { name: "Teslim Aldım", exact: true })
            .click();
          assert.equal((await balances(p))[1].received, 0);
        },
      ),
  );
  await run(
    "T03: accepted physical return restores source and leaves plan unchanged, reload retains reversal reason",
    () =>
      isolated(fixture(), 360, async (p) => {
        await operator(p);
        await send(p);
        await operator(p, true);
        await p
          .getByRole("button", {
            name: "Fiziksel Teslimi Kabul Et",
            exact: true,
          })
          .click();
        await operator(p);
        await p
          .locator("#transfer-reason")
          .fill("Hatalı hedef; parçalar geri geldi");
        await p
          .getByRole("button", { name: "Kaynağa Dönüşü Onayla", exact: true })
          .click();
        assert.equal((await balances(p))[0].unprocessed, 0);
        await p.locator("[data-return-confirm]").check();
        await p
          .getByRole("button", { name: "Kaynağa Dönüşü Onayla", exact: true })
          .click();
        await p.reload();
        let b = await balances(p);
        assert.equal(b[0].unprocessed, 25);
        assert.equal(b[0].unstarted, 50);
        assert.equal(b[1].unprocessed, 0);
        assert.deepEqual(
          await p.evaluate(() =>
            state.physicalTransfers[0].history.map((e) => e.action),
          ),
          ["issue", "accept", "reverse"],
        );
      }),
  );
  await run(
    "T04: transferred input production, inspection, closure, QA and shipment preserve lineage and totals",
    () =>
      isolated(fixture(), 390, async (p) => {
        await operator(p);
        await send(p);
        await operator(p, true);
        await p
          .getByRole("button", {
            name: "Fiziksel Teslimi Kabul Et",
            exact: true,
          })
          .click();
        await p.getByRole("button", { name: "İşe Başla", exact: true }).click();
        await result(p, "pending", 25);
        assert.equal(
          await p.evaluate(() => state.physicalLotUses[0].lot),
          "TRANSFER:TR-UI",
        );
        await p.locator("#ux05-ig").fill("25");
        await p
          .getByRole("button", { name: /Kontrol Sonucunu Onayla/ })
          .click();
        await p
          .getByRole("button", { name: "İş Emrini Kapat", exact: true })
          .click();
        assert.equal(await p.evaluate(() => state.jobs[1].state), "complete");
        await forceCommit(p, "shipping", 25, "BEFORE-QA");
        assert.equal((await get(p)).net, 0);
        await commit(p, "quality", 25);
        await commit(p, "shipping", 25, "AFTER-QA");
        assert.equal((await get(p)).net, 25);
        assert.equal((await get(p)).verified, 85);
        await p.evaluate(() => go("audit"));
        assert.deepEqual(
          await p.evaluate(() => RitimUX07.audit().critical),
          [],
        );
        await operator(p);
        await p.locator("#transfer-reason").fill("Tüketilmiş lot");
        await p.locator("[data-return-confirm]").check();
        await p
          .getByRole("button", { name: "Kaynağa Dönüşü Onayla", exact: true })
          .click();
        assert.equal(
          await p.evaluate(() => state.physicalTransfers[0].status),
          "accepted",
        );
      }),
  );
  await run(
    "T05: failed storage write leaves both persisted and in-memory transfer untouched",
    () =>
      isolated(fixture(), 390, async (p) => {
        await operator(p);
        const before = await p.evaluate(() => ({
          live: JSON.stringify(state),
          saved: localStorage.getItem(KEY),
        }));
        await p.evaluate(() => {
          Storage.prototype.setItem = function () {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
            throw new DOMException("Test quota", "QuotaExceededError");
          };
        });
        await send(p);
        assert.deepEqual(
          await p.evaluate(() => ({
            live: JSON.stringify(state),
            saved: localStorage.getItem(KEY),
          })),
          before,
        );
        assert.equal(
          await p
            .getByText(
              "Depolama kotası dolu. İşlem kaydedilmedi.",
              { exact: true },
            )
            .count(),
          1,
        );
      }),
  );
  await run(
    "T06: old localStorage data survives read-only transfer UI without migration",
    () =>
      isolated(fixture(), 390, async (p, raw) => {
        await operator(p);
        await operator(p, true);
        await p.evaluate(() => go("audit"));
        assert.equal(await p.evaluate(() => localStorage.getItem(KEY)), raw);
        assert.equal(
          await p.evaluate(() => state.physicalTransfers === undefined),
          true,
        );
      }),
  );
  await run(
    "T07: transfer page accepts unassigned target without opening another machine job",
    () => {
      const seed = fixture();
      seed.jobs[1].machine = "";
      return isolated(seed, 360, async (p) => {
        await operator(p);
        await send(p);
        await p
          .getByRole("button", {
            name: "Tüm İş Emirlerinin Transferleri",
            exact: true,
          })
          .click();
        await p
          .getByRole("combobox", { name: "Transfer iş emri", exact: true })
          .selectOption("TARGET");
        await p
          .getByRole("button", {
            name: "Fiziksel Teslimi Kabul Et",
            exact: true,
          })
          .click();
        assert.equal((await balances(p))[1].unprocessed, 25);
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await picture(p, "unassigned-target-360");
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
