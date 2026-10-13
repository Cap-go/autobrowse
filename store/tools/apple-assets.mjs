// Apple creative assets: start Vite on 5179, then bun apple-assets.mjs.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const out = '../creative/apple';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 740, height: 1000 }, deviceScaleFactor: 3 });
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto('http://127.0.0.1:5179/?demo=chat');
await page.waitForSelector('.demo-page');
await page.locator('.turn').screenshot({ path: `${out}/source-chat.png` });

const icon = readFileSync('../android/icon-512.png').toString('base64');
const chat = readFileSync(`${out}/source-chat.png`).toString('base64');
const decoration = `<svg class="decoration" viewBox="0 0 1280 854" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#62c8a8" stroke-width="3">
    <rect x="100" y="120" width="160" height="214" rx="20"/>
    <path d="M100 158h160M125 188h110M125 207h74M125 242h110M125 261h96M125 296h66"/>
    <rect x="1040" y="150" width="140" height="126" rx="20"/>
    <path d="M1065 182h85M1065 202h64M1065 222h77"/>
    <path d="M289 219h43m-13-13 13 13-13 13M990 219h-43m13-13-13 13 13 13"/>
    <circle cx="1090" cy="675" r="59"/>
    <path d="m1063 675 19 19 36-40M152 622l20 20m-20 0 20-20"/>
    <rect x="110" y="698" width="110" height="74" rx="16"/>
    <path d="M130 720h70M130 740h40"/>
  </g>
</svg>`;

for (const asset of [
  { file: 'product-page-header-3840x1646.png', width: 3840, height: 1646, kind: 'header' },
  { file: 'search-results-3840x2560.png', width: 3840, height: 2560, kind: 'search' },
]) {
  await page.setViewportSize({ width: asset.width, height: asset.height });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box;margin:0}
    html,body{width:${asset.width}px;height:${asset.height}px;overflow:hidden;background:#0e8f6e}
    .canvas{width:1280px;height:${asset.height / 3}px;position:relative;transform:scale(3);transform-origin:0 0;color:#fff;font-family:system-ui,sans-serif}
    .decoration{position:absolute;inset:0;width:1280px;height:854px}
    .brand{display:flex;align-items:center;gap:24px}
    .brand img{width:84px;height:84px;flex:none}
    h1{font-size:56px;line-height:1.1;letter-spacing:-2px;font-weight:800}
    p{font-size:27px;line-height:1.25;margin-top:12px;letter-spacing:-.5px}
    .header .brand{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap}
    .search .content{position:absolute;left:295px;top:256px;width:690px}
    .search .brand{justify-content:center}
    .search h1{font-size:48px}
    .search p{font-size:24px;margin-top:8px}
    .interface{margin:22px auto 0;width:670px;height:220px;overflow:hidden;border-radius:20px;border:2px solid #075641;background:#262626}
    .interface img{width:100%;height:100%;object-fit:contain;display:block}
  </style></head><body><div class="canvas ${asset.kind}">${decoration}
    <div class="${asset.kind === 'search' ? 'content' : ''}">
      <div class="brand"><img src="data:image/png;base64,${icon}" alt=""/><div><h1>Auto Browse</h1><p>Ask it. It browses for you.</p></div></div>
      ${asset.kind === 'search' ? `<div class="interface"><img src="data:image/png;base64,${chat}" alt=""/></div>` : ''}
    </div>
  </div></body></html>`);
  await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode())));
  const path = `${out}/${asset.file}`;
  // Capture at 1x: the composition itself scales 3x to exact Apple dimensions.
  await page.screenshot({ path, scale: 'css' });
  execFileSync('magick', [path, '-alpha', 'off', '-strip', path]);
  execFileSync('magick', [path, '-resize', '1280x', '-quality', '85', path.replace('.png', '.webp')]);
}
await browser.close();
