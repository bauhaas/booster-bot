const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
// Chart marks: commons use a deeper tan than the card beige so bars stay visible on white.
const MARK = { common: "#c4993f", uncommon: "#2e7d32", rare: "#1565c0", epic: "#7b1fa2", legendary: "#c62828" };
const LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const CHART_DAYS = 14;
const SVG_NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function dot(rarity) {
  return el("span", `dot m-${rarity}`);
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---- Tabs -------------------------------------------------------------------
function showTab(name) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $("log").hidden = name !== "log";
  $("stats").hidden = name !== "stats";
  try { localStorage.setItem("tab", name); } catch {}
}
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
try { showTab(localStorage.getItem("tab") || "log"); } catch { showTab("log"); }

// ---- History ----------------------------------------------------------------
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

// ---- Stats ------------------------------------------------------------------
function dayKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayTotal(day) {
  return RARITIES.reduce((sum, r) => sum + (day?.[r] || 0), 0);
}

function niceMax(max) {
  if (max <= 4) return 4;
  for (const step of [2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (max / step <= 4) return Math.ceil(max / step) * step;
  }
  return Math.ceil(max / 1000) * 1000;
}

function renderTiles(stats) {
  const totals = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  let boosters = 0;
  for (const day of Object.values(stats)) {
    boosters += day.boosters || 0;
    for (const r of RARITIES) totals[r] += day[r] || 0;
  }
  $("boosters").textContent = `· ${boosters} booster${boosters === 1 ? "" : "s"}`;
  $("tiles").replaceChildren(
    ...RARITIES.map((r) => {
      const tile = el("div", "tile");
      const label = el("div", "l");
      label.append(dot(r), LABEL[r]);
      tile.append(el("div", "n", totals[r].toLocaleString()), label);
      return tile;
    })
  );
}

function renderLegend() {
  $("legend").replaceChildren(
    ...RARITIES.map((r) => {
      const item = el("span");
      item.append(dot(r), LABEL[r]);
      return item;
    })
  );
}

function renderChart(stats) {
  const W = 336, H = 150, padL = 26, padT = 6, padB = 16;
  const plotH = H - padT - padB;
  const baseline = padT + plotH;
  const slot = (W - padL) / CHART_DAYS;
  const barW = Math.min(16, slot - 6);

  const today = new Date();
  const days = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push({ key: dayKey(d), date: d, data: stats[dayKey(d)] || {} });
  }
  const max = niceMax(Math.max(...days.map((d) => dayTotal(d.data))));

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cards per day by rarity" });
  const defs = svg("defs");
  root.append(defs);

  // Recessive grid + y labels
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const y = baseline - (v / max) * plotH;
    root.append(svg("line", { x1: padL, x2: W, y1: y, y2: y, stroke: i === 0 ? "#ccc" : "#eee", "stroke-width": 1 }));
    const t = svg("text", { x: padL - 4, y: y + 3, "text-anchor": "end" });
    t.textContent = Math.round(v);
    root.append(t);
  }

  const chart = $("chart");
  const tip = el("div", "tip");
  tip.hidden = true;

  days.forEach((day, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const total = dayTotal(day.data);

    // X labels every other day, ending on today
    if ((CHART_DAYS - 1 - i) % 2 === 0) {
      const t = svg("text", { x: x + barW / 2, y: H - 3, "text-anchor": "middle" });
      t.textContent = day.date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
      root.append(t);
    }

    if (total) {
      // Stacked segments, commons at the bottom, 2px gaps, rounded top via clip
      let cursor = baseline;
      const g = svg("g", { "clip-path": `url(#bar${i})` });
      RARITIES.forEach((r, ri) => {
        const v = day.data[r] || 0;
        if (!v) return;
        const h = Math.max(3, (v / max) * plotH);
        const gap = cursor === baseline ? 0 : 2;
        g.append(svg("rect", { x, y: cursor - h, width: barW, height: h - gap, fill: MARK[r] }));
        cursor -= h;
      });
      const clip = svg("clipPath", { id: `bar${i}` });
      clip.append(svg("rect", { x, y: cursor, width: barW, height: baseline - cursor + 4, rx: 3 }));
      defs.append(clip);
      root.append(g);
    }

    // Hover target covers the whole column
    const hit = svg("rect", { x: padL + i * slot, y: padT, width: slot, height: plotH, fill: "transparent" });
    hit.addEventListener("mouseenter", () => {
      const rows = [el("div", null, day.date.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" }))];
      for (const r of [...RARITIES].reverse()) {
        const row = el("div");
        row.append(dot(r), LABEL[r], el("b", null, day.data[r] || 0));
        rows.push(row);
      }
      const sum = el("div");
      sum.append("Total", el("b", null, `${total} (${day.data.boosters || 0} boosters)`));
      rows.push(sum);
      tip.replaceChildren(...rows);
      tip.hidden = false;
      const left = padL + (i + 1) * slot + 4;
      tip.style.left = (left + tip.offsetWidth > W ? padL + i * slot - tip.offsetWidth - 4 : left) + "px";
      tip.style.top = "0px";
    });
    hit.addEventListener("mouseleave", () => (tip.hidden = true));
    root.append(hit);
  });

  chart.replaceChildren(root, tip);
}

function renderTable(stats) {
  const keys = Object.keys(stats).sort().reverse().slice(0, 30);
  const head = el("tr");
  head.append(el("th", null, "Day"));
  for (const r of RARITIES) {
    const th = el("th");
    th.title = LABEL[r];
    th.append(dot(r), LABEL[r].slice(0, 3));
    head.append(th);
  }
  head.append(el("th", null, "Total"));

  const rows = keys.map((k) => {
    const day = stats[k];
    const tr = el("tr");
    tr.append(el("td", null, keyToDate(k).toLocaleDateString([], { weekday: "short", day: "2-digit", month: "2-digit" })));
    for (const r of RARITIES) {
      const v = day[r] || 0;
      tr.append(el("td", v ? (r === "legendary" ? "hit" : "") : "zero", v));
    }
    tr.append(el("td", null, dayTotal(day)));
    return tr;
  });

  if (!rows.length) {
    const tr = el("tr");
    const td = el("td", "zero", "No boosters opened yet.");
    td.colSpan = 7;
    tr.append(td);
    rows.push(tr);
  }
  $("table").replaceChildren(head, ...rows);
}

// ---- Render -----------------------------------------------------------------
async function render() {
  const { enabled = true, log = [], latestVersion, stats = {} } =
    await chrome.storage.local.get(["enabled", "log", "latestVersion", "stats"]);

  $("enabled").checked = enabled;
  $("version").textContent = "v" + chrome.runtime.getManifest().version;

  $("update").style.display = latestVersion ? "block" : "none";
  $("latest").textContent = latestVersion || "";

  $("log").replaceChildren(
    ...(log.length ? log.map(renderEntry) : [el("div", "empty", "No boosters opened yet.")])
  );

  renderTiles(stats);
  renderLegend();
  renderChart(stats);
  renderTable(stats);
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
