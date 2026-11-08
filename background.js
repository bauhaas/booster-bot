// ---- Settings -------------------------------------------------------------
const BASE = "https://recordsmaster.com";
const BOOSTER_PATH = "/fr/boosters";
const PERIOD_MIN = 8;                   // how often to try opening a booster
const JACKPOT_RARITIES = ["legendary"]; // rarities that trigger onJackpot()
const MAX_LOG = 100;

// Where the update checker looks for a newer version.
const REPO = "bauhaas/booster-bot";
const REMOTE_MANIFEST = `https://raw.githubusercontent.com/${REPO}/main/manifest.json`;
const UPDATE_CHECK_MIN = 6 * 60;

// ---- Scheduling -----------------------------------------------------------
async function schedule() {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  await chrome.alarms.clear("open");
  if (enabled) {
    chrome.alarms.create("open", { delayInMinutes: 0.1, periodInMinutes: PERIOD_MIN });
  }
  chrome.alarms.create("update", { delayInMinutes: 0.2, periodInMinutes: UPDATE_CHECK_MIN });
}
chrome.runtime.onInstalled.addListener(async () => {
  await backfillStats();
  await schedule();
});
chrome.runtime.onStartup.addListener(schedule);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "open") run();
  if (alarm.name === "update") checkForUpdate();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "runNow") run().then(() => sendResponse(true));
  if (msg.type === "reschedule") schedule().then(() => sendResponse(true));
  if (msg.type === "checkUpdate") checkForUpdate().then(() => sendResponse(true));
  return true; // keep the channel open for the async response
});

// ---- Main loop ------------------------------------------------------------
async function run(round = 0) {
  const entry = { time: new Date().toISOString() };
  try {
    const tab = await getSiteTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: openBoosterInPage,
      args: [BOOSTER_PATH],
    });

    if (!result.ok || !result.data?.draws) {
      entry.error =
        result.status === 422
          ? "Nothing to open yet (HTTP 422)"
          : result.error || `HTTP ${result.status}`;
    } else {
      const data = result.data;
      entry.boosterUrl = BASE + data.url;
      entry.draws = data.draws.map((d) => ({
        artist: d.artist,
        title: d.title,
        version: d.version_label,
        rarity: d.rarity,
        cover: d.cover_url,
        url: BASE + d.url,
      }));
      await recordStats(entry.time, entry.draws.map((d) => d.rarity));
      const hits = data.draws.filter((d) => JACKPOT_RARITIES.includes(d.rarity));
      if (hits.length) {
        entry.jackpot = true;
        await onJackpot(hits, data);
      }
      // If more crates are waiting, open the next one right away (max 10 in a row).
      if (data.crates_left > 0 && round < 10) {
        await addLog(entry);
        await new Promise((r) => setTimeout(r, 3000));
        return run(round + 1);
      }
    }
  } catch (e) {
    entry.error = String(e?.message || e);
  }
  await addLog(entry);
}

// ---- What to do on a legendary ---------------------------------------------
async function onJackpot(hits, data) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Legendary pulled!",
    message: hits.map((d) => `${d.artist} – ${d.title}`).join("\n"),
    requireInteraction: true,
  });
  // Open the booster result so it's waiting for you in the morning.
  chrome.tabs.create({ url: BASE + data.url, active: false });
}

// ---- Runs INSIDE the recordsmaster.com tab (uses your logged-in cookies) ---
async function openBoosterInPage(path) {
  // 1. Get a fresh CSRF token (Rails puts it in <meta name="csrf-token">).
  const page = await fetch(path, { credentials: "same-origin" });
  const html = await page.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const token =
    doc.querySelector('meta[name="csrf-token"]')?.content ||
    doc.querySelector('input[name="authenticity_token"]')?.value;
  if (!token) return { ok: false, error: "No authenticity_token found (logged out?)" };

  // 2. Same POST the site makes when you click.
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "X-CSRF-Token": token,
    },
    body: new URLSearchParams({ authenticity_token: token }),
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, error: `HTTP ${res.status}: response was not JSON` };
  }
}

// ---- Update checker ---------------------------------------------------------
// Unpacked extensions can't update themselves, so we only tell the user
// a newer version exists; they `git pull` and hit "Reload" in the popup.
async function checkForUpdate() {
  try {
    const res = await fetch(REMOTE_MANIFEST, { cache: "no-store" });
    if (!res.ok) return;
    const latest = (await res.json()).version;
    const current = chrome.runtime.getManifest().version;
    const newer = isNewer(latest, current);
    await chrome.storage.local.set({ latestVersion: newer ? latest : null });
    chrome.action.setBadgeText({ text: newer ? "NEW" : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  } catch {
    // offline or GitHub unreachable: try again next time
  }
}

function isNewer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// ---- Helpers --------------------------------------------------------------
async function getSiteTab() {
  const tabs = await chrome.tabs.query({ url: BASE + "/*" });
  if (tabs.length) return tabs[0];
  const tab = await chrome.tabs.create({ url: BASE + BOOSTER_PATH, active: false, pinned: true });
  await new Promise((resolve) => {
    const timer = setTimeout(done, 30000);
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(id, info) {
      if (id === tab.id && info.status === "complete") done();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
  return tab;
}

// ---- Stats ------------------------------------------------------------------
// stats = { "2026-11-08": { boosters: 3, common: 9, uncommon: 6, rare: 3, ... }, ... }
// Kept separately from the log so counts survive after the log is trimmed.
function dayKey(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addToStats(stats, iso, rarities) {
  const day = (stats[dayKey(iso)] ??= { boosters: 0 });
  day.boosters++;
  for (const r of rarities) day[r] = (day[r] || 0) + 1;
}

async function recordStats(iso, rarities) {
  const { stats = {} } = await chrome.storage.local.get("stats");
  addToStats(stats, iso, rarities);
  await chrome.storage.local.set({ stats });
}

// First run of v1.2: rebuild stats from whatever is still in the log.
async function backfillStats() {
  const { stats, log = [] } = await chrome.storage.local.get(["stats", "log"]);
  if (stats) return;
  const fresh = {};
  for (const e of log) {
    const rarities = e.draws ? e.draws.map((d) => d.rarity) : e.rarities;
    if (!e.error && rarities?.length) addToStats(fresh, e.time, rarities);
  }
  await chrome.storage.local.set({ stats: fresh });
}

async function addLog(entry) {
  const { log = [] } = await chrome.storage.local.get("log");
  log.unshift(entry);
  await chrome.storage.local.set({ log: log.slice(0, MAX_LOG) });
}
