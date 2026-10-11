// Capture raw app states from the Vite dev server (bun run dev): bun shoot-raw.mjs [outDir]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '../raw';
const base = process.env.BASE ?? 'http://localhost:5179';
const states = ['onboarding-0', 'onboarding-1', 'onboarding-2', 'onboarding-3', 'connect', 'main', 'chat', 'shopping', 'settings', 'tabs'];
const statusBar = `
<div style="position:fixed;top:0;left:0;right:0;height:54px;display:flex;align-items:center;justify-content:space-between;padding:6px 32px 0 44px;font:600 17px -apple-system,system-ui;color:#fff;z-index:99;pointer-events:none">
  <span>9:41</span>
  <span style="display:flex;gap:6px;align-items:center">
    <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#fff"/><rect x="5" y="5" width="3" height="7" rx="1" fill="#fff"/><rect x="10" y="2.5" width="3" height="9.5" rx="1" fill="#fff"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#fff"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0L11.1 8.3a4.4 4.4 0 0 0-6.2 0zM1.3 4.7a9.5 9.5 0 0 1 13.4 0l-1.4 1.4a7.5 7.5 0 0 0-10.6 0z" fill="#fff"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#fff" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="#fff"/><rect x="25" y="4.5" width="1.5" height="4" rx=".75" fill="#fff" opacity=".4"/></svg>
  </span>
</div>`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, colorScheme: 'dark', hasTouch: true, isMobile: true });
for (const s of states) {
  const page = await ctx.newPage();
  await page.goto(`${base}/?demo=${s}`);
  await page.waitForTimeout(700);
  await page.evaluate((bar) => {
    const st = document.createElement('style');
    st.textContent = ':root{--safe-top:54px !important;--safe-bottom:30px !important}';
    document.head.append(st);
    document.body.insertAdjacentHTML('beforeend', bar);
  }, statusBar);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${s}.png` });
  await page.close();
}
await browser.close();
console.log('ok');
