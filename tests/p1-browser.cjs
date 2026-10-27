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
    process.env.P0_EVIDENCE_DIR || "docs/p1/evidence/new",
  );
const key = "ritimLiteAnonymousDemoV1",
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
      if (window.top === window && localStorage && !localStorage.getItem(key))
        localStorage.setItem(key, raw);
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
  await p.screenshot({
    path: path.join(out, name + ".png"),
    fullPage: true,
    timeout: 20000,
  });
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

  for (const width of [1440, 390, 360]) {
    await run("P1 layout/navigation " + width, () =>
      isolated(fresh(), width, async (p, raw) => {
        for (const v of [
          "home",
          "orders",
          "jobs",
          "production",
          "quality",
          "more",
          "audit",
          "history",
          "stock",
          "planning",
          "transfers",
        ]) {
          await p.evaluate((v) => go(v), v);
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
            v + " overflow",
          );
          if (width < 500)
            assert.equal(
              await p.locator('.bottomnav [aria-current="page"]').count(),
              1,
              v + " active nav",
            );
        }
        assert.equal(
          await p.evaluate((k) => localStorage.getItem(k), key),
          raw,
        );
        await p.evaluate(() => go("more"));
        for (const label of [
          "Hareketler",
          "Miktar Kontrolü",
          "İade / Telafi / Stok",
        ])
          assert.equal(
            await p
              .getByRole("button", { name: label, exact: true })
              .last()
              .isVisible(),
            true,
          );
        await picture(p, "menu-" + width);
        await p.evaluate(() => go("home"));
        await picture(p, "home-" + width);
      }),
    );
  }
  await run(
    "P1-01/16 quoted unassigned job and drawing preserve context",
    () => {
      const s = fresh();
      s.jobs[0].id = 'WO-O\'Brien "A" <parça>';
      s.jobs[0].machine = "";
      return isolated(s, 390, async (p) => {
        await p.evaluate(() => openJob(state.jobs[0].id));
        await p.getByRole("button", { name: /Operatör Ekranı/ }).click();
        assert.match(await p.locator("#page").innerText(), /makine atanmamış/i);
        assert.equal(
          await p.evaluate(() =>
            document
              .querySelector("#page")
              .textContent.includes(state.jobs[0].id),
          ),
          true,
        );
        await p.evaluate(() => {
          openJob(state.jobs[0].id);
          showDrawing(state.orders[0].id);
        });
        await p
          .getByRole("button", { name: "Yakınlaştır", exact: true })
          .click();
        assert.equal(
          await p
            .locator(".tech-stage iframe")
            .evaluate((e) => e.style.transform),
          "scale(1.25)",
        );
        await p.getByRole("button", { name: "Kapat", exact: true }).click();
        assert.equal(await p.evaluate(() => chosenJob), s.jobs[0].id);
      });
    },
  );
  await run("P1-02 explicit operator ownership and my jobs", () =>
    isolated(fresh(), 390, async (p) => {
      await p.evaluate(() => {
        state.user = "Operatör A";
        RitimUX.openProduction(state.jobs[0].id);
      });
      await p
        .getByRole("button", { name: "Bu İşi Devral", exact: true })
        .click();
      assert.equal(await p.evaluate(() => state.jobs[0].owner), "Operatör A");
      await p.evaluate(() => {
        state.user = "Operatör B";
        go("myjobs");
      });
      assert.match(
        await p.locator("#page").innerText(),
        /Atanmış veya devralınabilir iş yok/,
      );
    }),
  );
  await run("P1-04 converted material receipt through UI", () =>
    isolated(fresh({ qty: 100 }), 390, async (p) => {
      await tab(p, "material");
      await p.locator("#stock-unit").selectOption("kg");
      await p.locator("#stock-rate").fill("20");
      await p.locator("#ux6-qty").fill("2.5");
      await p.locator("#ux6-ref").fill("KG-1");
      await p.locator(".ux6-form button.full").click();
      assert.equal((await get(p)).material, 50);
      await picture(p, "material-390");
    }),
  );
  await run("P1-08 return quarantine and final restock UI", () =>
    isolated(completed(), 390, async (p) => {
      await commit(p, "quality", 20);
      await commit(p, "shipping", 20, "SHIP");
      await tab(p, "customerReturn");
      await p.locator("#ux6-qty").fill("5");
      await p.locator("#ux6-reason").fill("Kontrol");
      await p.locator(".ux6-form button.full").click();
      assert.equal((await get(p)).net, 15);
      assert.equal((await get(p)).ready, 0);
      await p.evaluate(() => RitimStockUI.open(state.orders[0].id));
      await p.locator("#stock-qty").fill("5");
      await p.locator("#stock-decision-reason").fill("Yeniden kontrol uygun");
      await p
        .getByRole("button", {
          name: "Seçili Kalite Kararını Uygula",
          exact: true,
        })
        .click();
      assert.equal((await get(p)).ready, 5);
      await picture(p, "returns-390");
      await commit(p, "shipping", 5, "RESHIP");
      assert.equal((await get(p)).percent, 100);
    }),
  );
  await run("P1-09 alert counts match scoped list", () =>
    isolated(completed(), 390, async (p) => {
      await p.evaluate(() => {
        state.jobs[0].good = 18;
        state.jobs[0].scrap = 2;
        go("home");
      });
      const b = p
        .locator(".p1-alerts button")
        .filter({ hasText: "Telafi gerektiren" });
      assert.match(await b.innerText(), /1/);
      await b.click();
      assert.match(await p.locator("#page").innerText(), /1 kayıt/);
      await p.locator("#page .list-card").click();
      assert.equal(await p.evaluate(() => chosenJob), "SIP-P0");
    }),
  );
  await run("P1-11 contextual logistics and list search preserved", () =>
    isolated(fresh(), 390, async (p) => {
      await p.evaluate(() => {
        go("orders");
        search = "P0";
        filter = "waiting";
        openOrder(state.orders[0].id);
      });
      await p
        .locator(".p1-context")
        .getByRole("button", { name: "Malzeme", exact: true })
        .click();
      assert.match(await p.locator("#page").innerText(), /SIP-P0/);
      await p.evaluate(() => go("orders"));
      assert.deepEqual(await p.evaluate(() => ({ search, filter })), {
        search: "P0",
        filter: "waiting",
      });
    }),
  );

  await run(
    "P1-13 revision upload retains previous version and requires acknowledgement",
    () =>
      isolated(fresh(), 390, async (p) => {
        await p.evaluate(() => openOrder(state.orders[0].id));
        await p.locator("#drawing-revision").fill("B");
        await p.locator("#drawing-reason").fill("Yeni ölçü");
        await p
          .locator("input[type=file]")
          .setInputFiles({
            name: "rev-b.png",
            mimeType: "image/png",
            buffer: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
              "base64",
            ),
          });
        await p.waitForFunction(() => state.drawingVersions?.length === 2);
        assert.equal(
          await p.evaluate(() => state.drawingVersions[0].url),
          "teknikResim.pdf",
        );
        await p.evaluate(() => RitimUX.openProduction(state.jobs[0].id));
        assert.equal(
          await p.evaluate(() =>
            RitimDrawings.acknowledged(state, state.jobs[0]),
          ),
          false,
        );
        await p
          .getByRole("button", {
            name: "Revizyonu Okudum ve Onayladım",
            exact: true,
          })
          .click();
        assert.equal(
          await p.evaluate(() =>
            RitimDrawings.acknowledged(state, state.jobs[0]),
          ),
          true,
        );
      }),
  );
  await run(
    "P1-07 legacy rework explicitly linked, executed and inspected in UI",
    () => {
      const s = completed();
      s.jobs[0].good = 15;
      s.jobs[0].ux05.rework = 5;
      return isolated(s, 390, async (p) => {
        await p.evaluate(() => go("quality"));
        await p.locator("[id^=legacy-rw-]").fill("Eski defterde 5 parça");
        await p
          .getByRole("button", {
            name: "Eski Bakiyeyi Rework İşine Bağla",
            exact: true,
          })
          .click();
        await p
          .getByRole("button", { name: "Yeniden İşlemeyi Kaydet", exact: true })
          .click();
        await p
          .getByRole("button", { name: "Kalite Sonucunu Gir", exact: true })
          .click();
        await p.locator("#ux05-rg").fill("4");
        await p.locator("#ux05-rs").fill("1");
        await p
          .getByRole("button", {
            name: "Rework Kontrolünü Onayla",
            exact: true,
          })
          .click();
        assert.deepEqual(
          await p.evaluate(() => [
            state.jobs[0].good,
            state.jobs[0].scrap,
            state.jobs[0].ux05.rework,
          ]),
          [19, 1, 0],
        );
      });
    },
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  const applicationErrors = telemetry.filter(
    (e) =>
      e.kind === "pageerror" ||
      (e.kind === "requestfailed" &&
        !e.url.startsWith("chrome-extension://")) ||
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
