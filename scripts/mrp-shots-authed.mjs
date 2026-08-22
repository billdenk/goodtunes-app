// Task #3295 — logged-in MRP portal states at 1440px.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = "http://127.0.0.1:5000";
const TOK = "gt-dev-mrp-estimate-071526-02-tok";
const OUT = "screenshots/mrp";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); console.log("shot", name); }
async function go(path, name, wait = 3000) {
  await page.goto(`${BASE}${path}${path.includes("?") ? "&" : "?"}gtwl=memphis`, { waitUntil: "networkidle2", timeout: 45000 });
  await sleep(wait);
  if (name) await shot(name);
}

// Create the client account + start the project via the real endpoint
// (session cookie lands on this browser context).
await go(`/e/${TOK}`, null, 2500);
const started = await page.evaluate(async (tok) => {
  const r = await fetch(`/api/estimate-link/${tok}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: "Niina Soleil", email: "niina@example-client.test", password: "dev-password-1" }),
  });
  let j = await r.json().catch(() => ({}));
  if (r.status === 409) {
    const lr = await fetch(`/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email: "niina@example-client.test", username: "niina@example-client.test", password: "dev-password-1", kind: "customer" }) });
    j = await lr.json().catch(() => ({}));
  }
  if (j.token) localStorage.setItem("goodtunes_auth_token", j.token);
  return { status: r.status, j: { ok: j.ok, hasToken: !!j.token } };
}, TOK);
console.log("start:", JSON.stringify(started).slice(0, 200));

await go(`/e/${TOK}/accepted`, "accepted-logged-in");
await go("/next-steps", "next-steps-logged-in");
await go("/dashboard", "dashboard-logged-in", 4000);
// chart ranges
for (const label of ["Today", "7d", "90d", "All"]) {
  const ok = await page.evaluate((label) => {
    const el = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === label);
    if (el) { el.click(); return true; } return false;
  }, label);
  await sleep(1500);
  console.log("range", label, ok);
  await shot(`dashboard-range-${label.toLowerCase()}`);
}
// strip collapse toggle
const collapsed = await page.evaluate(() => {
  const el = [...document.querySelectorAll("button")].find((b) => /Collapse|Expand/.test(b.textContent || ""));
  if (el) { el.click(); return true; } return false;
});
await sleep(800); console.log("strip toggle", collapsed);
await shot("dashboard-strip-collapsed");
await go("/dashboard/next-steps", "dashboard-next-steps-logged-in", 4000);
await go("/projects", "projects-logged-in", 4000);
await browser.close();
console.log("DONE");
