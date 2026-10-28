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
  out = path.resolve(root, process.env.P0_EVIDENCE_DIR || "docs/p0/evidence");
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
  await p.screenshot({ path: path.join(out, name + ".png"), fullPage: true, timeout: 20000 });
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
    await run(
      `B01-${width}: persisted legacy data survives loading and read-only navigation`,
      () => {
        const s = completed();
        s.orders[0].id = "DEMO-SIP-005";
        s.jobs[0].order = s.orders[0].id;
        s.ux06[s.orders[0].id] = s.ux06["SIP-P0"];
        delete s.ux06["SIP-P0"];
        s.shipments = [{ job: "WO-P0", qty: 7, time: "2026-10-01" }];
        s.ux06[s.orders[0].id].releases = [{ qty: 9, date: "old" }];
        return isolated(s, width, async (p, raw) => {
          for (const v of [
            "orders",
            "shipping",
            "audit",
            "logistics",
            "home",
          ]) {
            await p.evaluate((v) => go(v), v);
            assert.equal(
              await p.evaluate((key) => localStorage.getItem(key), key),
              raw,
            );
          }
          assert.equal((await get(p)).ready, 0);
          await p.evaluate(() => openOrder(state.orders[0].id));
          await p.locator("#page details summary").click();
          assert.match(
            await p.locator("#page").innerText(),
            /Örnek aşama dağılımı/,
          );
          assert.equal(
            await p.evaluate(() => shipmentSummary(state.orders[0]).percent),
            0,
          );
          await picture(p, `history-${width}`);
        });
      },
    );
    await run(
      `B02-${width}: production→close→QA→partial shipment→return keeps every screen consistent`,
      () =>
        isolated(fresh(), width, async (p) => {
          await receive(p, 20);
          await result(p, "good", 20);
          await forceCommit(p, "quality", 20);
          assert.equal((await get(p)).approved, 0);
          await p.evaluate(() => go("production"));
          await p
            .getByRole("button", { name: "İş Emrini Kapat", exact: true })
            .click();
          await commit(p, "quality", 8);
          await commit(p, "shipping", 5, "SHIP-A");
          await forceCommit(p, "shipping", 1, "SHIP-A");
          assert.equal((await get(p)).shipped, 5);
          await commit(p, "quality", 12);
          await commit(p, "shipping", 15, "SHIP-B");
          assert.equal((await get(p)).net, 20);
          await p.evaluate(() => go("orders"));
          assert.equal(await p.locator(".oc-percent").innerText(), "%100");
          assert.equal(await p.locator(".oc-status").innerText(), "Tamamlandı");
          await p.evaluate(() => go("home"));
          assert.match(
            await p.locator(".ux-kpi-link").first().innerText(),
            /0/,
          );
          assert.equal(await p.locator(".ux-flow-order").count(), 0);
          await tab(p, "customerReturn");
          await p.locator("#ux6-shipment").selectOption("SHIP-B");
          await p.locator("#ux6-qty").fill("5");
          await p.locator("#ux6-reason").fill("Kurgusal test iadesi");
          await p.locator(".ux6-form button.full").click();
          const x = await get(p);
          assert.equal(x.net, 15);
          assert.equal(x.ready, 0);
          assert.equal(x.complete, false);
          await p.evaluate(() => go("orders"));
          assert.equal(await p.locator(".oc-percent").innerText(), "%75");
          assert.equal(await p.locator(".oc-status").innerText(), "Kısmi Sevk");
          await picture(p, `net-return-${width}`);
          await p.evaluate(() => openOrder("SIP-P0"));
          assert.match(await p.locator(".ux-stage-overview").innerText(), /15/);
          await p.evaluate(() => go("shipping"));
          assert.match(await p.locator("#page").innerText(), /15 \/ 20/);
          await p.evaluate(() => go("audit"));
          assert.equal(
            (await p.locator('[data-audit-order="SIP-P0"] [data-metric="net"]').innerText()).trim(),
            "15",
          );
          await p.evaluate(() => go("home"));
          assert.match(await p.locator(".ux-flow-order").innerText(), /%75/);
          assert.deepEqual(await p.evaluate(() => state.shipments), []);
        }),
    );
  }
  await run(
    "B03: unsupported routes and preexisting final approvals cannot bypass terminal operation",
    async () => {
      for (const route of [
        ["İmalat", "Tesviye"],
        ["İmalat", "Tesviye", "Kaplama"],
        ["İmalat", "Kaplama", "Montaj"],
      ])
        await isolated(completed({ route }), 1440, async (p) => {
          await forceCommit(p, "quality", 10);
          assert.equal((await get(p)).recordedApproved, 0);
          await p.evaluate(() => {
            chosenJob = "WO-P0";
            const q = document.createElement("input");
            q.id = "shipQty";
            q.value = "10";
            document.body.append(q);
            const ref = document.createElement("input");
            ref.id = "shipRef";
            ref.value = "BYPASS";
            document.body.append(ref);
            saveShipment();
          });
          assert.equal((await get(p)).shipped, 0);
          assert.deepEqual(await p.evaluate(() => state.shipments), []);
        });
    },
  );
  await run(
    "B04: old openShip routes to guarded form; old saveShipment uses canonical command",
    () =>
      isolated(completed(), 1440, async (p) => {
        await p.evaluate(() => openShip("WO-P0"));
        assert.equal(await p.locator("#ux6-order").inputValue(), "SIP-P0");
        assert.equal(
          await p.locator(".ux6-form button.full").isDisabled(),
          true,
        );
        await p.evaluate(() => {
          chosenJob = "WO-P0";
          for (const [id, value] of [
            ["shipQty", "5"],
            ["shipRef", "LEGACY-ENTRY"],
          ]) {
            const e = document.createElement("input");
            e.id = id;
            e.value = value;
            document.body.append(e);
          }
          saveShipment();
        });
        assert.equal((await get(p)).shipped, 0);
        await commit(p, "quality", 20);
        await p.evaluate(() => {
          chosenJob = "WO-P0";
          document.getElementById("shipQty")?.remove();
          document.getElementById("shipRef")?.remove();
          const e = document.createElement("input");
          e.id = "shipQty";
          e.value = "5";
          document.body.append(e);
          saveShipment();
        });
        assert.equal((await get(p)).shipped, 0);
        await p.evaluate(() => {
          const e = document.createElement("input");
          e.id = "shipRef";
          e.value = "LEGACY-ENTRY";
          document.body.append(e);
          saveShipment();
        });
        assert.equal((await get(p)).shipped, 5);
        assert.deepEqual(await p.evaluate(() => state.shipments), []);
      }),
  );
  await run(
    "B05: partial supplier movements retain caps, documents and good→QA→shipping chain",
    () => {
      const s = completed({
        qty: 250,
        planned: 150,
        route: ["İmalat", "Kaplama"],
      });
      Object.assign(s.jobs[0], { state: "running", good: 60, scrap: 3 });
      Object.assign(s.jobs[0].ux05, { received: 100, pending: 12 });
      s.ux06["SIP-P0"].receipts[0].qty = 100;
      s.ux06["SIP-P0"].allocations[0].qty = 100;
      return isolated(s, 390, async (p) => {
        await commit(p, "external", 40, "EXT-A");
        await forceCommit(p, "external", 1, "EXT-A");
        assert.equal((await get(p)).dispatched, 40);
        await commit(p, "external", 20, "EXT-B");
        await forceCommit(p, "return", 41);
        assert.equal((await get(p)).returned, 0);
        await commit(p, "return", 30);
        assert.equal((await get(p)).net, 0);
        await commit(p, "quality", 20);
        await commit(p, "shipping", 15, "CUSTOMER-A");
        const x = await get(p);
        assert.deepEqual(
          [x.dispatched, x.returned, x.supplierOpen, x.ready, x.net],
          [60, 30, 30, 5, 15],
        );
        await picture(p, "external-partial-390");
      });
    },
  );
  await run(
    "B06: UX05 250/150/100 equation and closure/overproduction guards remain intact",
    () =>
      isolated(fresh({ qty: 250, planned: 150 }), 360, async (p) => {
        await p.evaluate(() => go("production"));
        await p.locator("#ux05-receive").fill("1");
        await p
          .getByRole("button", { name: "Teslim Aldım", exact: true })
          .click();
        assert.equal(await p.evaluate(() => state.jobs[0].ux05?.received||0), 0);
        await receive(p, 100);
        await result(p, "good", 60);
        await result(p, "scrap", 3);
        await result(p, "pending", 12);
        await result(p, "pending", 26);
        const b = await p.evaluate(() =>
          RitimQuantities.jobBalance(state.jobs[0], state.orders[0]),
        );
        assert.deepEqual(
          [b.received, b.good, b.scrap, b.pending, b.unprocessed, b.unstarted],
          [100, 60, 3, 12, 25, 50],
        );
        await p
          .getByRole("button", { name: "İş Emrini Kapat", exact: true })
          .click();
        assert.equal(await p.evaluate(() => state.jobs[0].state), "running");
        await picture(p, "acceptance-250-150-100");
      }),
  );
  await run(
    "B07: UX05 inspection, rework and handover preserve quantities",
    () =>
      isolated(fresh(), 390, async (p) => {
        await receive(p, 20);
        await result(p, "pending", 20);
        for (const [id, n] of [
          ["ux05-ig", 12],
          ["ux05-is", 3],
          ["ux05-ir", 5],
        ])
          await p.locator("#" + id).fill(String(n));
        await p
          .getByRole("button", { name: /^Kontrol Sonucunu Onayla/ })
          .click();
        // P1 rework now requires an explicit execution record before reinspection.
        await p.evaluate(()=>go('quality'));
        await p.getByRole('button',{name:'Yeniden İşlemeyi Kaydet',exact:true}).click();
        await p.getByRole('button',{name:'Kalite Sonucunu Gir',exact:true}).click();
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
          [16, 4, 0],
        );
        await p.locator("#ux05-handover-note").fill("Kurgusal vardiya notu");
        await p
          .getByRole("button", { name: "Vardiya Devret", exact: true })
          .click();
        await p
          .getByRole("button", { name: "İşi Devral", exact: true })
          .click();
        assert.equal(
          await p.evaluate(() => !!state.jobs[0].ux05.handover),
          true,
        );
        await p
          .getByRole("combobox", { name: "Aktif kullanıcı" })
          .selectOption("Operatör B");
        await p
          .getByRole("button", { name: "İşi Devral", exact: true })
          .click();
        assert.equal(await p.evaluate(() => state.jobs[0].state), "paused");
        assert.equal(await p.evaluate(()=>state.jobs[0].ux05.handover),null);
        assert.equal(await p.evaluate(()=>state.jobs[0].owner),"Operatör B");
      }),
  );
  await run(
    "B08: independent sales page cannot ship through UI, openShipment or ship",
    () => {
      const seed = {
        user: "Yönetici",
        jobs: [
          {
            id: "WO-OLD",
            po: "OLD-ORDER",
            customer: "Kurgusal Eski Firma",
            part: "Eski Test",
            target: 20,
            good: 20,
            scrap: 0,
            state: "complete",
            machine: "",
            operations: ["İmalat"],
            op: 0,
          },
        ],
        shipments: [],
        events: [],
        orderRoutes: { "OLD-ORDER": ["İmalat"] },
      };
      return isolated(
        seed,
        390,
        async (p, raw) => {
          assert.deepEqual(await p.evaluate(()=>[typeof ship,typeof openShipment,typeof saveEdit,typeof createJob,typeof resetDemo]),Array(5).fill('undefined'));
          assert.equal(await p.evaluate(()=>localStorage.getItem('ritimFlowLiteDemo')),raw);
          assert.match(await p.locator('#content').innerText(),/Salt Okunur/);
          assert.equal(
            await p
              .getByRole("link", {
                name: "Final kalite kontrollü ana uygulamayı aç",
              })
              .getAttribute("href"),
            "index.html",
          );
        },
        "ritim_flow_lite_sales_polished.html",
      );
    },
  );
  await run(
    "B09: read-only old approvals/dispatches stay visible but cannot release new inventory",
    () => {
      const s = completed({ route: ["İmalat", "Kaplama"] });
      const d = s.ux06["SIP-P0"];
      d.dispatches = [{ qty: 20, ref: "OLD" }];
      d.returns = [{ qty: 20, dispatch: "OLD" }];
      d.releases = [{ qty: 20 }];
      return isolated(s, 1440, async (p, raw) => {
        await forceCommit(p, "shipping", 1, "BYPASS");
        assert.equal((await get(p)).ready, 0);
        assert.equal((await get(p)).shipped, 0);
        assert.equal(
          await p.evaluate((key) => localStorage.getItem(key), key),
          raw,
        );
        assert.match(await p.locator("#page").innerText(), /Önceki final/);
      });
    },
  );
  await run(
    "B10: new model/service assets load on every route without app errors",
    () =>
      isolated(fresh(), 1440, async (p) => {
        for (const route of [
          "home",
          "orders",
          "jobs",
          "production",
          "shipping",
          "history",
          "logistics",
          "audit",
        ]) {
          await p.evaluate((route) => go(route), route);
          assert.notEqual(await p.locator("#page").innerText(), "");
        }
        assert.equal(
          await p.evaluate(() => typeof RitimShipping.ship),
          "function",
        );
      }),
  );
  await run(
    "B11: partial material receipts/allocations preserve free balance and reject excess",
    () =>
      isolated(fresh({ qty: 100 }), 390, async (p) => {
        await commit(p, "material", 40, "MAT-A");
        await commit(p, "material", 60, "MAT-B");
        await forceCommit(p, "material", 1, "EXCESS");
        await commit(p, "allocate", 60);
        await commit(p, "allocate", 40);
        await forceCommit(p, "allocate", 1);
        const x = await get(p);
        assert.deepEqual(
          [x.material, x.allocated, x.materialFree],
          [100, 100, 0],
        );
        assert.equal(x.d.receipts.length, 2);
        assert.equal(x.d.allocations.length, 2);
      }),
  );
  await run(
    "B12: manager restriction and legacy direct commit both revalidate final QA",
    () =>
      isolated(completed(), 360, async (p) => {
        await p
          .getByRole("combobox", { name: "Aktif kullanıcı" })
          .selectOption("Operatör A");
        await forceCommit(p, "quality", 20);
        assert.equal((await get(p)).recordedApproved, 0);
        await forceCommit(p, "shipping", 1, "NO-QA");
        assert.equal((await get(p)).shipped, 0);
        await p
          .getByRole("combobox", { name: "Aktif kullanıcı" })
          .selectOption("Yönetici");
        await commit(p, "quality", 20);
        await tab(p, "shipping");
        await p.locator("#ux6-qty").fill("1");
        await p.locator("#ux6-ref").fill("STALE");
        await p.evaluate(async () => {
          // Corrupt the persisted fixture: the command must validate latest disk, not this tab's memory.
          const latest = JSON.parse(localStorage.getItem(KEY));
          latest.jobs[0].state = "running";
          localStorage.setItem(KEY,JSON.stringify(latest));
          await RitimUX06.commit();
        });
        assert.equal((await get(p)).shipped, 0);
      }),
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
