// Task #3295 — 1440px screenshot pass for the MRP client-portal states
// checklist (light-only, per handoff b912fb6). Dev-only helper.
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
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function go(path, name, wait = 2500) {
  await page.goto(BASE + path + (path.includes("?") ? "&" : "?") + "gtwl=memphis", { waitUntil: "networkidle2", timeout: 45000 }).catch((e) => console.log("NAV FAIL", name, e.message));
  await sleep(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot", name);
}
async function clickText(text, tag = "button") {
  const ok = await page.evaluate(({ text, tag }) => {
    const els = [...document.querySelectorAll(tag + ", [role=button], a, div, span")];
    const el = els.find((e) => e.childElementCount === 0 && (e.textContent || "").trim() === text) ||
               els.find((e) => (e.textContent || "").trim() === text);
    if (el) { el.scrollIntoView({ block: "center" }); el.click(); return true; }
    return false;
  }, { text, tag });
  if (!ok) console.log("CLICK MISS:", text);
  await sleep(900);
  return ok;
}
async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); console.log("shot", name); }

// 1) Estimate page — collapsed default
await go(`/e/${TOK}`, "estimate-collapsed", 3500);
// expanded: toggle the details/setup sections
await clickText("Per record");
await clickText("Setup");
await shot("estimate-expanded");
// sheets
await clickText("Ask Brandon a question"); await shot("estimate-sheet-ask"); await page.keyboard.press("Escape"); await sleep(500);
await clickText("Share"); await shot("estimate-sheet-share"); await page.keyboard.press("Escape"); await sleep(500);
await clickText("Start this project"); await shot("estimate-sheet-start"); await page.keyboard.press("Escape"); await sleep(500);

// 2) Landing
await go("/", "landing");
// 3) Next steps logged-out
await go("/next-steps", "next-steps-logged-out");
// 4) Accepted
await go(`/e/${TOK}/accepted`, "accepted");
// 5) Dashboard (logged-out state will show whatever the query returns)
await go("/dashboard", "dashboard");
await go("/dashboard/next-steps", "dashboard-next-steps");
await go("/projects", "projects");

await browser.close();
console.log("DONE");
