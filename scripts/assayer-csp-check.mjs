// Loads the sister project's pages in a real browser and fails on any console error,
// which is how a too-strict Content-Security-Policy shows up.
import { chromium } from "playwright";
const SITE = process.argv[2] ?? "https://assayer-gray.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()}: ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
for (const path of ["/", "/dashboard"]) {
  await page.goto(SITE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log(`${path}: ${(await page.title())}, ${(await page.evaluate(() => document.body.innerText.length))} chars of text`);
}
await browser.close();
console.log(errors.length ? `FAIL console errors:\n${errors.join("\n")}` : "PASS no console errors on Assayer");
process.exit(errors.length ? 1 : 0);
