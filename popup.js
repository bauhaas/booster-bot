const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderCard(d) {
  const rarity = RARITIES.includes(d.rarity) ? d.rarity : "unknown";
  const card = el("div", `card ${rarity}`);

  if (d.cover) {
    const img = el("img", "cover");
    img.src = d.cover;
    img.alt = "";
    img.onerror = () => img.replaceWith(el("div", "cover"));
    card.append(img);
  } else {
    card.append(el("div", "cover"));
  }

  const text = el("div", "text");
  const title = d.title ? d.title + (d.version ? ` (${d.version})` : "") : "—";
  text.append(el("div", "title", title));
  if (d.artist) text.append(el("div", "artist", d.artist));
  card.append(text, el("span", "badge", d.rarity || "?"));

  if (d.url) card.addEventListener("click", () => chrome.tabs.create({ url: d.url }));
  return card;
}

function renderEntry(e) {
  if (e.error) {
    const row = el("div", "error");
    row.append(el("span", "time", formatTime(e.time)), e.error);
    return row;
  }

  // Entries logged by v1.0 only stored rarities.
  const draws = e.draws || (e.rarities || []).map((rarity) => ({ rarity }));
  const box = el("div", "unpack" + (draws.some((d) => d.rarity === "legendary") ? " jackpot" : ""));

  const head = el("div", "unpack-head");
  head.append(el("span", null, formatTime(e.time)));
  if (e.boosterUrl) {
    const link = el("a", null, "open booster ↗");
    link.href = "#";
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      chrome.tabs.create({ url: e.boosterUrl });
    });
    head.append(link);
  }
  box.append(head, ...draws.map(renderCard));
  return box;
}

async function render() {
  const { enabled = true, log = [], latestVersion } =
    await chrome.storage.local.get(["enabled", "log", "latestVersion"]);

  $("enabled").checked = enabled;
  $("version").textContent = "v" + chrome.runtime.getManifest().version;

  $("update").style.display = latestVersion ? "block" : "none";
  $("latest").textContent = latestVersion || "";

  $("log").replaceChildren(
    ...(log.length ? log.map(renderEntry) : [el("div", "empty", "No boosters opened yet.")])
  );
}

$("enabled").addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: $("enabled").checked });
  await chrome.runtime.sendMessage({ type: "reschedule" });
});

$("now").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  await chrome.runtime.sendMessage({ type: "runNow" });
  ev.target.disabled = false;
});

$("check").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  ev.target.textContent = "Checking…";
  await chrome.runtime.sendMessage({ type: "checkUpdate" });
  const { latestVersion } = await chrome.storage.local.get("latestVersion");
  ev.target.textContent = latestVersion ? "Update found" : "Up to date";
  setTimeout(() => {
    ev.target.textContent = "Check for updates";
    ev.target.disabled = false;
  }, 2000);
});

// Reloads the extension from disk, picking up files changed by `git pull`.
document.querySelectorAll(".reload").forEach((b) =>
  b.addEventListener("click", () => chrome.runtime.reload())
);

chrome.storage.onChanged.addListener(render);
render();
