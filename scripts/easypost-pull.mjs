// One-time EasyPost historical pull (enumerate via reports + enrich per shipment).
// Resumable. Writes /tmp/ep_ids.json and /tmp/ep_enriched.ndjson. Read-only against EasyPost.
import fs from "node:fs";

const KEY = process.env.EASYPOST_API_KEY;
if (!KEY) { console.error("NO EASYPOST_API_KEY"); process.exit(1); }
const AUTH = "Basic " + Buffer.from(KEY + ":").toString("base64");
const BASE = "https://api.easypost.com/v2";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ep(path, opts = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(BASE + path, { ...opts, headers: { Authorization: AUTH, ...(opts.headers || {}) } });
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
    return r;
  }
  return fetch(BASE + path, { ...opts, headers: { Authorization: AUTH, ...(opts.headers || {}) } });
}

// minimal RFC4180-ish CSV row parser
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /*skip*/ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function monthsRange(startYM, endYM) {
  const out = []; let [y, m] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push([`${y}-${String(m).padStart(2, "0")}-01`, `${y}-${String(m).padStart(2, "0")}-${last}`]);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

async function enumerateIds() {
  const ids = new Set();
  // seed from local exports
  try { fs.readFileSync("/tmp/ep_local_ids.txt", "utf8").split("\n").filter(Boolean).forEach((x) => ids.add(x.trim())); } catch {}
  log("seeded local ids:", ids.size);

  const months = monthsRange("2025-09", "2026-06");
  // create all reports first
  const reports = [];
  for (const [s, e] of months) {
    const r = await ep("/reports/shipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start_date: s, end_date: e }) });
    const j = await r.json();
    if (j.id) { reports.push({ id: j.id, s }); log("report created", s, j.id, j.status); }
    else log("report create FAIL", s, JSON.stringify(j).slice(0, 160));
    await sleep(300);
  }
  // poll + download
  for (const rep of reports) {
    let url = null;
    for (let i = 0; i < 60; i++) {
      const r = await ep("/reports/shipment/" + rep.id);
      const j = await r.json();
      if (j.status === "available") { url = j.url; break; }
      if (j.status === "failed") { log("report FAILED", rep.s); break; }
      await sleep(4000);
    }
    if (!url) { log("report no-url (timeout)", rep.s); continue; }
    const csv = await (await fetch(url)).text();
    const rows = parseCsv(csv);
    if (!rows.length) { log("report empty", rep.s); continue; }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    let idx = header.findIndex((h) => h === "id" || h === "shipment id" || (h.includes("shipment") && h.includes("id")));
    if (idx < 0) idx = header.findIndex((h) => h.includes("id"));
    let added = 0;
    for (let i = 1; i < rows.length; i++) {
      const v = (rows[i][idx] || "").trim();
      if (v.startsWith("shp_")) { if (!ids.has(v)) added++; ids.add(v); }
    }
    log("report", rep.s, "rows:", rows.length - 1, "new ids:", added, "total:", ids.size);
  }
  const arr = [...ids];
  fs.writeFileSync("/tmp/ep_ids.json", JSON.stringify(arr));
  log("ENUM DONE total ids:", arr.length);
  return arr;
}

function normCarrier(c) {
  if (!c) return null;
  if (c === "UPSDAP" || c.startsWith("UPS")) return "UPS";
  if (c.startsWith("FedEx")) return "FedEx";
  if (c === "DHLExpress" || c.startsWith("DHL")) return "DHL Express";
  if (c === "USPS" || c.startsWith("USPS")) return "USPS";
  return c;
}

async function enrich(ids) {
  // resume
  const done = new Set();
  try { fs.readFileSync("/tmp/ep_enriched.ndjson", "utf8").split("\n").filter(Boolean).forEach((l) => { try { done.add(JSON.parse(l).id); } catch {} }); } catch {}
  log("already enriched:", done.size);
  const todo = ids.filter((id) => !done.has(id));
  log("to enrich:", todo.length);
  const out = fs.createWriteStream("/tmp/ep_enriched.ndjson", { flags: "a" });
  const CONC = 5;
  let n = 0;
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
    const recs = await Promise.all(batch.map(async (id) => {
      const r = await ep("/shipments/" + id);
      if (!r.ok) return { id, error: r.status };
      const s = await r.json();
      const a = s.to_address || {};
      const t = s.tracker || {};
      const deliv = (t.tracking_details || []).filter((d) => d.status === "delivered");
      const delivered_at = deliv.length ? deliv[deliv.length - 1].datetime : null;
      return {
        id, tracking_code: s.tracking_code || null, status: s.status || t.status || null,
        carrier: normCarrier(s.selected_rate?.carrier || t.carrier), service: s.selected_rate?.service || null,
        to_email: a.email || null, to_name: a.name || null, to_company: a.company || null,
        to_street1: a.street1 || null, to_street2: a.street2 || null, to_city: a.city || null,
        to_state: a.state || null, to_zip: a.zip || null, to_country: a.country || null, to_phone: a.phone || null,
        public_url: t.public_url || null, est_delivery_date: t.est_delivery_date || null,
        ship_date: s.postage_label?.created_at || s.created_at || null, created_at: s.created_at || null,
        delivered_at,
      };
    }));
    for (const rec of recs) out.write(JSON.stringify(rec) + "\n");
    n += batch.length;
    if (n % 50 === 0 || n === todo.length) log("enriched", n, "/", todo.length);
    await sleep(200);
  }
  out.end();
  log("ENRICH DONE");
}

const phase = process.argv[2] || "all";
if (phase === "enum") { await enumerateIds(); }
else if (phase === "enrich") { const ids = JSON.parse(fs.readFileSync("/tmp/ep_ids.json", "utf8")); await enrich(ids); }
else { const ids = await enumerateIds(); await enrich(ids); }
log("ALL DONE");
