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
    process.env.P0_EVIDENCE_DIR || "docs/p0-07/evidence/persistence-browser",
  );
const key = "ritimFlowLite:fictional-demo:v1",
  results = [],
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

  async function blocked(p, action) {
    const before = await p.evaluate(
      (k) => ({ state: JSON.stringify(state), raw: localStorage.getItem(k) }),
      key,
    );
    await p.evaluate(() => {
      window.originalWrite = Storage.prototype.setItem;
      window.writeAttempts = 0;
      Storage.prototype.setItem = function () {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
        writeAttempts++;
        window.memoryDuringWrite = JSON.stringify(state);
        throw new DOMException("full", "QuotaExceededError");
      };
    });
    await action();
    assert.equal(
      await p.evaluate(() => writeAttempts),
      1,
      "must reach writer: " + (await p.locator(".toast").innerText()),
    );
    assert.equal(
      await p.evaluate(() => memoryDuringWrite),
      before.state,
      "live memory remains old during write",
    );
    assert.deepEqual(
      await p.evaluate(
        (k) => ({ state: JSON.stringify(state), raw: localStorage.getItem(k) }),
        key,
      ),
      before,
    );
    assert.match(await p.locator(".toast").innerText(), /kaydedilmedi/);
    await p.evaluate(() => {
      Storage.prototype.setItem = originalWrite;
    });
    await action();
    const persisted = await p.evaluate(
      (k) => ({ state: JSON.stringify(state), raw: localStorage.getItem(k) }),
      key,
    );
    assert.notEqual(persisted.raw, before.raw);
    assert.equal(persisted.state, persisted.raw);
    await p.reload();
    assert.equal(await p.evaluate(() => JSON.stringify(state)), persisted.raw);
  }
  async function operator(p, fields = {}) {
    await p.evaluate(() => RitimUX.openProduction("WO-P0"));
    for (const [id, v] of Object.entries(fields))
      await p.locator("#" + id).fill(String(v));
  }
  const C = require("../assets/js/quality-service.js"),
    S = require("../assets/js/shipment-service.js");
  const receiving = completed();
  receiving.jobs[0].state = "waiting";
  receiving.jobs[0].good = 0;
  receiving.jobs[0].ux05.received = 0;
  const producing = completed();
  producing.jobs[0].state = "running";
  producing.jobs[0].good = 0;
  const inspecting = structuredClone(producing);
  inspecting.jobs[0].ux05.pending = 20;
  const reworking = structuredClone(inspecting);
  C.inspect(reworking, { job: "WO-P0", good: 10, scrap: 5, rework: 5 });
  C.execute(reworking, { id: reworking.reworkTasks[0].id, qty: 5 });
  for (const [name, seed, fields, method] of [
    ["physical receive", receiving, { "ux05-receive": 5 }, "receive"],
    ["production", producing, { "ux05-qty": 5 }, "production"],
    [
      "inspection",
      inspecting,
      { "ux05-ig": 10, "ux05-is": 5, "ux05-ir": 5 },
      "inspect",
    ],
    ["rework", reworking, { "ux05-rg": 4, "ux05-rs": 1 }, "rework"],
    ["pause", producing, {}, "pause"],
    ["close", completed(), {}, "close"],
  ])
    await run("quota atomic legacy " + name, () => {
      const seedCopy = structuredClone(seed);
      if (method === "close") seedCopy.jobs[0].state = "running";
      return isolated(seedCopy, 390, async (p) => {
        await operator(p, fields);
        await blocked(p, () =>
          p.evaluate((method) => RitimUX05[method]("WO-P0"), method),
        );
      });
    });
  const allocated = fresh();
  allocated.ux06 = { "SIP-P0": { receipts: [{ qty: 20, ref: "MAT" }] } };
  const external = completed({ route: ["İmalat", "Kaplama"] });
  S.dispatch(external, "SIP-P0", { qty: 20, ref: "EXT" });
  const released = completed();
  S.release(released, "SIP-P0", { qty: 20 });
  const shipped = structuredClone(released);
  S.ship(shipped, "SIP-P0", { qty: 20, ref: "SHIP" });
  for (const [name, seed, t, ref] of [
    ["material", fresh(), "material", "MAT"],
    ["allocation", allocated, "allocate"],
    [
      "dispatch",
      completed({ route: ["İmalat", "Kaplama"] }),
      "external",
      "EXT",
    ],
    ["external return", external, "return"],
    ["final release", completed(), "quality"],
    ["shipment", released, "shipping", "NEW-SHIP"],
    ["customer return", shipped, "customerReturn"],
  ])
    await run("quota atomic logistics " + name, () =>
      isolated(seed, 390, async (p) => {
        await tab(p, t);
        await p.locator("#ux6-qty").fill("5");
        if (ref) await p.locator("#ux6-ref").fill(ref);
        if (t === "customerReturn") await p.locator("#ux6-reason").fill("Test");
        await blocked(p, () => p.evaluate(() => RitimUX06.commit()));
      }),
    );
  await run("quota legacy saveShipment is atomic", () =>
    isolated(released, 390, async (p) => {
      await p.evaluate(() => {
        chosenJob = "WO-P0";
        const host = document.createElement("div");
        host.innerHTML =
          '<input id="shipQty" value="5"><input id="shipRef" value="LEGACY">';
        document.body.append(host);
      });
      await blocked(p, () => p.evaluate(() => saveShipment()));
    }),
  );
  await run("quota compensation UI", () =>
    isolated(reworking, 390, async (p) => {
      await p.evaluate(() => RitimStockUI.open("SIP-P0"));
      await p.locator("#stock-qty").fill("2");
      await p.locator("#stock-decision-reason").fill("Hurda");
      await blocked(p, () => p.evaluate(() => RitimStockUI.compensate()));
    }),
  );
  await run("quota new drawing revision retains old file", () =>
    isolated(fresh(), 390, async (p) => {
      await p.evaluate(() => openOrder("SIP-P0"));
      await p.locator("#drawing-revision").fill("B");
      await p.locator("#drawing-reason").fill("Yeni ölçü");
      const before = await p.evaluate(() => JSON.stringify(state));
      await p.evaluate(() => {
        window.originalWrite = Storage.prototype.setItem;
        window.writeAttempts = 0;
        Storage.prototype.setItem = function () {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
          writeAttempts++;
          throw new DOMException("full", "QuotaExceededError");
        };
      });
      const upload = () =>
        p.locator("input[type=file]").setInputFiles({
          name: "b.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      await upload();
      await p.waitForFunction(() => writeAttempts === 1);
      assert.equal(await p.evaluate(() => JSON.stringify(state)), before);
      assert.match(await p.locator(".toast").innerText(), /kaydedilmedi/);
      await p.evaluate(() => (Storage.prototype.setItem = originalWrite));
      await p.locator("input[type=file]").setInputFiles([]);
      await upload();
      await p.waitForFunction(() => state.drawingVersions?.length === 2);
      await p.reload();
      assert.equal(await p.evaluate(() => state.drawingVersions.length), 2);
    }),
  );
  async function rawContext(raw, fn, deny = false) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 1000 },
      }),
      p = await ctx.newPage();
    await trackPage(p);
    p.on("pageerror", (e) =>
      telemetry.push({ test: current, kind: "pageerror", message: e.message }),
    );
    await ctx.addInitScript(
      ({ raw, key, deny }) => {
        if (window.top !== window) return;
        if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
        if (deny)
          Object.defineProperty(window, "localStorage", {
            get() {
              throw new DOMException("denied", "SecurityError");
            },
          });
      },
      { raw, key, deny },
    );
    try {
      await p.goto(base);
      await p.waitForSelector("[data-recovery]");
      await fn(p);
    } finally {
      await ctx.close();
    }
  }
  const legacy = fresh();
  delete legacy.schema;
  delete legacy.schemaVersion;
  for (const [name, raw] of [
    ["malformed", "{broken"],
    ["null", "null"],
    ["jobs null", JSON.stringify({ ...fresh(), jobs: null })],
    ["future", JSON.stringify({ ...fresh(), schemaVersion: 99 })],
    ["unknown", JSON.stringify({ ...fresh(), foreignData: [] })],
  ])
    await run("recovery preserves " + name, () =>
      rawContext(raw, async (p) => {
        assert.equal(
          await p.evaluate((k) => localStorage.getItem(k), key),
          raw,
        );
        const r = await p.evaluate(() =>
          commitState((d) => {
            d.events.push({ qty: 1 });
            return { ok: true };
          }),
        );
        assert.equal(r.ok, false);
        const downloadPromise = p.waitForEvent("download");
        await p.locator("#recovery-export").click();
        const download = await downloadPromise;
        const text = fs.readFileSync(await download.path(), "utf8");
        assert.equal(text, raw);
        await p.reload();
        await p.waitForSelector("[data-recovery]");
        assert.equal(
          await p.evaluate((k) => localStorage.getItem(k), key),
          raw,
        );
      }),
    );
  await run(
    "legacy migration explicit separate copy and rollback address",
    () =>
      rawContext(JSON.stringify(legacy), async (p) => {
        const raw = JSON.stringify(legacy);
        await p.locator("#recovery-migrate").click();
        await p.waitForURL(/dataKey=/);
        await p.waitForSelector(".header");
        assert.equal(
          await p.evaluate((k) => localStorage.getItem(k), key),
          raw,
        );
        const copied = await p.evaluate(() => ({ key: KEY, state }));
        assert.notEqual(copied.key, key);
        assert.equal(copied.state.schemaVersion, 1);
        delete copied.state.schema;
        delete copied.state.schemaVersion;
        assert.deepEqual(copied.state, legacy);
        await p.goto(base);
        await p.waitForSelector("#recovery-migrate");
        assert.equal(
          await p.evaluate((k) => localStorage.getItem(k), key),
          raw,
        );
      }),
  );
  await run("fresh separate demo never overwrites damaged source", () =>
    rawContext("{broken", async (p) => {
      await p.locator("#recovery-fresh").click();
      await p.waitForURL(/dataKey=/);
      await p.waitForSelector(".header");
      assert.equal(
        await p.evaluate((k) => localStorage.getItem(k), key),
        "{broken",
      );
      assert.equal(await p.evaluate(() => state.schemaVersion), 1);
    }),
  );
  await run(
    "validated import explicit, invalid and future imports rejected",
    () =>
      rawContext("{broken", async (p) => {
        for (const data of [null, { ...fresh(), schemaVersion: 8 }]) {
          await p.locator("#recovery-file").setInputFiles({
            name: "bad.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(data)),
          });
          await p.waitForFunction(() =>
            document
              .querySelector("#recovery-preview")
              .textContent.includes("kapalı"),
          );
          assert.equal(await p.locator("#recovery-import").isDisabled(), true);
        }
        await p.locator("#recovery-file").setInputFiles({
          name: "good.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(fresh())),
        });
        await p.waitForFunction(
          () => !document.querySelector("#recovery-import").disabled,
        );
        await p.locator("#recovery-import").click();
        await p.waitForURL(/dataKey=/);
        await p.waitForSelector(".header");
        assert.equal(
          await p.evaluate((k) => localStorage.getItem(k), key),
          "{broken",
        );
        assert.equal(await p.evaluate(() => state.orders[0].id), "SIP-P0");
      }),
  );
  await run(
    "storage getter failure renders recovery without writable fallback",
    () =>
      rawContext(
        JSON.stringify(fresh()),
        async (p) => {
          assert.equal(
            await p.evaluate(() => dataSession.status),
            "unavailable",
          );
          assert.equal(await p.locator("#recovery-export").isDisabled(), true);
          await p.locator("#recovery-fresh").click();
          assert.equal(new URL(p.url()).search, "");
          assert.match(await p.locator(".toast").innerText(), /erişilemiyor/);
        },
        true,
      ),
  );
  await run(
    "interrupted write blocks repeat until persisted state reload",
    () =>
      isolated(released, 390, async (p) => {
        await tab(p, "shipping");
        await p.locator("#ux6-qty").fill("5");
        await p.locator("#ux6-ref").fill("INTERRUPTED");
        const before = await p.evaluate(() => JSON.stringify(state));
        await p.evaluate(() => {
          window.originalWrite = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
            originalWrite.call(this, k, v);
            throw Error("interrupted after write");
          };
        });
        await p.evaluate(() => RitimUX06.commit());
        assert.equal(await p.evaluate(() => JSON.stringify(state)), before);
        assert.equal(await p.evaluate(() => dataSession.status), "uncertain");
        assert.equal(await p.locator("[data-recovery]").count(), 1);
        await p.evaluate(() => (Storage.prototype.setItem = originalWrite));
        await p.locator("#recovery-retry").click();
        assert.equal((await get(p)).net, 5);
        assert.equal(
          await p.evaluate(() => state.ux06["SIP-P0"].shipments.length),
          1,
        );
        await p.reload();
        assert.equal((await get(p)).net, 5);
      }),
  );

  for (const [label, seed, fields, method] of [
    ["start", Object.assign(structuredClone(producing), {}), {}, "start"],
    ["resume", structuredClone(producing), {}, "resume"],
    [
      "handover",
      structuredClone(producing),
      { "ux05-handover-note": "Vardiya sonu" },
      "handover",
    ],
    ["takeover", structuredClone(producing), {}, "takeOver"],
  ])
    await run("quota atomic operator " + label, () => {
      if (method === "start") seed.jobs[0].state = "waiting";
      if (method === "resume") seed.jobs[0].state = "paused";
      if (method === "takeOver") {
        seed.jobs[0].state = "paused";
        seed.jobs[0].ux05.handover = {
          from: "Operatör A",
          note: "Test",
          time: "2026-10-27T10:00:00Z",
        };
      }
      return isolated(seed, 390, async (p) => {
        await operator(p, fields);
        await blocked(p, () =>
          p.evaluate((method) => RitimUX05[method]("WO-P0"), method),
        );
      });
    });
  await run("quota first order creation commits neither order nor job", () =>
    isolated(fresh(), 390, async (p) => {
      await p.evaluate(() => {
        openWizard();
        Object.assign(wizard, {
          id: "NEW-ORDER",
          customer: "Test Firma",
          part: "Test Parçası",
          qty: 20,
          jobQty: 20,
          jobId: "NEW-FIRST",
          machine: "CNC-02",
          step: 3,
        });
        renderModal();
      });
      await blocked(p, () => p.evaluate(() => createOrder()));
    }),
  );
  await run("failed role selection restores displayed role", () =>
    isolated(fresh(), 390, async (p) => {
      const before = await p.evaluate(() => JSON.stringify(state));
      await p.evaluate(() => {
        Storage.prototype.setItem = function () {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
          throw new DOMException("denied", "SecurityError");
        };
      });
      await p.locator(".user-select").selectOption("Operatör A");
      assert.equal(await p.locator(".user-select").inputValue(), "Yönetici");
      assert.equal(await p.evaluate(() => JSON.stringify(state)), before);
      assert.match(await p.locator(".toast").innerText(), /kaydedilmedi/);
    }),
  );
  await run(
    "storage read failure during command leaves live state untouched",
    () =>
      isolated(released, 390, async (p) => {
        await tab(p, "shipping");
        await p.locator("#ux6-qty").fill("5");
        await p.locator("#ux6-ref").fill("READ-FAIL");
        const before = await p.evaluate(() => JSON.stringify(state));
        await p.evaluate(() => {
          window.originalRead = Storage.prototype.getItem;
          Storage.prototype.getItem = function () {
          if(this===sessionStorage)return window.ritimSessionRead(this,arguments);
            throw new DOMException("denied", "SecurityError");
          };
        });
        const r = await p.evaluate(() => RitimUX06.commit());
        assert.equal(r.ok, false);
        assert.equal(await p.evaluate(() => JSON.stringify(state)), before);
        await p.evaluate(() => (Storage.prototype.getItem = originalRead));
        assert.equal(
          await p.evaluate(
            (k) =>
              JSON.parse(localStorage.getItem(k)).ux06["SIP-P0"].shipments
                .length,
            key,
          ),
          0,
        );
      }),
  );
  await run("quota recovery copy never navigates or overwrites original", () =>
    rawContext("{broken", async (p) => {
      await p.evaluate(() => {
        Storage.prototype.setItem = function () {
          if(this===sessionStorage)return window.ritimSessionWrite(this,arguments);
          throw new DOMException("full", "QuotaExceededError");
        };
      });
      await p.locator("#recovery-fresh").click();
      // Recovery copy awaits Web Locks independently of the normal command idle hook.
      // Wait for the actual refusal before checking URL and storage invariants.
      await p.waitForFunction(() =>
        document.querySelector("#recovery-preview")?.textContent.includes("kaydedilmedi"),
      );
      assert.equal(new URL(p.url()).search, "");
      assert.equal(
        await p.evaluate((k) => localStorage.getItem(k), key),
        "{broken",
      );
      assert.equal(
        await p.evaluate((k) => Object.keys(localStorage).filter(x => x.startsWith(k + ":copy:")).length, key),
        0,
      );
      assert.match(
        await p.locator("#recovery-preview").innerText(),
        /kaydedilmedi/,
      );
      await picture(p, "recovery-quota-390");
    }),
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
