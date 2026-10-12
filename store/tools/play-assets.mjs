// Flat Google Play feature graphic and opaque icon: bun play-assets.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

mkdirSync('../android', { recursive: true });
// Retain the source icon silhouette; flatten its silver shading to white.
execFileSync('magick', ['../icon/AppIcon-1024.png', '-channel', 'R', '-separate', '-threshold', '45%', '-colorspace', 'sRGB', '-fill', '#0e8f6e', '-opaque', 'black', '-fill', 'white', '-opaque', 'white', '-resize', '512x512', '-alpha', 'off', '../android/icon-512.png']);
const icon = readFileSync('../android/icon-512.png').toString('base64');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
*{box-sizing:border-box;margin:0}html,body{width:1024px;height:500px;background:#0e8f6e;color:white;font-family:system-ui,sans-serif}
body{display:flex;align-items:center;gap:44px;padding:76px}
img{width:224px;height:224px}
h1{font-size:64px;font-weight:800;letter-spacing:-2px;line-height:1.1}
p{font-size:30px;font-weight:500;line-height:1.35;margin-top:22px;max-width:560px}
</style></head><body><img src="data:image/png;base64,${icon}" alt=""/><div><h1>Auto Browse</h1><p>AI agent that browses for you</p></div></body></html>`);
await page.screenshot({ path: '../android/feature-graphic.png' });
execFileSync('magick', ['../android/feature-graphic.png', '-alpha', 'off', '../android/feature-graphic.png']);
await browser.close();
