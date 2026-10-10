// Headless visual smoke test. Needs a Chromium binary (CHROME_PATH) and, on
// Linux, CHROME_LIB_DIR pointing at libnss3/libnspr4 if the system lacks them.
// Usage: CHROME_PATH=/path/to/chromium node scripts/visual-smoke.mjs [url] [out.png]
import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'visual-smoke.png';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  env: { ...process.env, ...(process.env.CHROME_LIB_DIR ? { LD_LIBRARY_PATH: process.env.CHROME_LIB_DIR } : {}) },
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message.slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 300)}`); });
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(25000);
await page.screenshot({ path: out, timeout: 120000 });
console.log(`screenshot: ${out}`);
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no console errors');
await browser.close();
