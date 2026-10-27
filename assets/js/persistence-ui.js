/* Application state is replaced only after the common store confirms its write. */
let recoveryVisible = false;
async function commitState(
  mutate,
  { success = "", after = () => render(), command, commandId } = {},
) {
  return RitimConcurrencyUI.submit(mutate, {
    success,
    after,
    command,
    commandId,
  });
}
function renderRecovery() {
  const root = document.getElementById("app");
  if (!root) return;
  const raw = dataSession.raw,
    decoded = RitimPersistence.decode(raw);
  root.innerHTML =
    '<main class="main"><section class="card pad" data-recovery><h1>Veri Güvenliği ve Kurtarma</h1><p>Mevcut kayıt silinmez veya üzerine demo verisi yazılmaz. Yeni demo ve içe aktarma ayrı bir anahtarda açılır.</p><p id="recovery-reason"></p><p id="recovery-key"></p><button class="btn full" id="recovery-export">Özgün Ham Veriyi İndir</button><button class="btn full" id="recovery-retry">Depodaki Kaydı Yeniden Aç</button><div id="recovery-actions"></div><label class="formfield">Doğrulanacak JSON yedeği<input type="file" id="recovery-file" accept="application/json,.json"></label><p id="recovery-preview"></p><button class="btn full" id="recovery-import" disabled>Doğrulanan Yedeği Ayrı Kopya Olarak Aç</button><button class="btn full" id="recovery-fresh">Mevcut Veriyi Koruyarak Ayrı Yeni Demo Başlat</button><p class="tiny">Yeni kopyanın adresini yer imlerine ekleyin. Önceki adrese dönmek özgün veriye geri döner; otomatik geri dönüş veya birleştirme yapılmaz.</p><a class="btn" href="index.html">Özgün Anahtarın Adresine Dön</a></section></main>';
  document.getElementById("overlay").innerHTML = "";
  document.getElementById("recovery-reason").textContent =
    dataSession.reason ||
    (dataSession.status === "legacy"
      ? "Sürümsüz kayıt tanındı. Kullanmak için aşağıdaki açık sürüm dönüşümünü onaylayın."
      : "Kayıt durumu: " + dataSession.status);
  document.getElementById("recovery-key").textContent = "Etkin anahtar: " + KEY;
  const download = (text, name) => {
    const blob = new Blob([text], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportButton = document.getElementById("recovery-export");
  exportButton.disabled = raw === null;
  exportButton.onclick = () => download(raw, "ritim-original-raw.json");
  document.getElementById("recovery-retry").onclick = () => {
    dataSession.reload();
    if (dataSession.ready) {
      state = dataSession.snapshot();
      recoveryVisible = false;
      render();
      window.RitimConcurrencyUI?.restoreRecovered();
    } else renderRecovery();
  };
  const openCopy = async (value, legacy = false) => {
    const key = RitimPersistence.BASE_KEY + ":copy:" + crypto.randomUUID();
    const r = await RitimTransactions.copy({
      storage: () => localStorage,
      key,
      value,
      legacy,
    });
    if (!r.ok) {
      const preview = document.getElementById("recovery-preview");
      preview.textContent = r.message;
      if (r.uncertain) {
        const url = new URL(location.href);
        url.searchParams.set("dataKey", r.key);
        const link = document.createElement("a");
        link.href = url.href;
        link.textContent = " Sonucu yeni adreste incele (tekrar yazmadan)";
        preview.append(link);
      }
      toast(r.message);
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("dataKey", key);
    location.assign(url.href);
  };
  if (decoded.kind === "legacy") {
    const b = document.createElement("button");
    b.className = "btn full";
    b.id = "recovery-migrate";
    b.textContent = "Sürüm 1 Kopyasını Oluşturmayı Onayla (Özgün Veri Korunur)";
    b.onclick = () => openCopy(decoded.value, true);
    document.getElementById("recovery-actions").append(b);
  }
  if (dataSession.ready) {
    const b = document.createElement("button");
    b.className = "btn full";
    b.textContent = "Uygulamaya Dön";
    b.onclick = () => {
      recoveryVisible = false;
      render();
    };
    document.getElementById("recovery-actions").append(b);
  }
  let imported = null;
  document.getElementById("recovery-file").onchange = async (e) => {
    imported = null;
    document.getElementById("recovery-import").disabled = true;
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const d = RitimPersistence.decode(await f.text());
      if (!["ready", "legacy"].includes(d.kind))
        throw Error(d.message || "Yedek tanınmadı");
      imported = d;
      document.getElementById("recovery-preview").textContent =
        d.kind === "legacy"
          ? "Sürümsüz yedek doğrulandı. İçe aktarma onayı sürüm 1 ayrı kopyasını oluşturur."
          : "Sürüm 1 yedek doğrulandı. Ayrı kopya oluşturulacak.";
      document.getElementById("recovery-import").disabled = false;
    } catch (e) {
      document.getElementById("recovery-preview").textContent =
        "İçe aktarma kapalı: " + e.message;
    }
  };
  document.getElementById("recovery-import").onclick = () => {
    if (imported) openCopy(imported.value, imported.kind === "legacy");
  };
  document.getElementById("recovery-fresh").onclick = () => openCopy(initial);
  window.RitimConcurrencyUI?.attachRecoveryDraft();
}
function openDataSafety() {
  recoveryVisible = true;
  renderRecovery();
}
async function changeUser(user) {
  const r = await commitState(
    (d) => {
      d.user = user;
      return { ok: true };
    },
    { command: { kind: "session.user", args: { user } } },
  );
  if (!r.ok) {
    const select = document.querySelector(".user-select");
    if (select) select.value = state.user;
  }
  return r;
}
