// Compose App Store marketing screenshots from ../raw: bun frame.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const shots = [
  { raw: 'chat', kicker: 'AI BROWSING AGENT', title: 'Ask it.<br/>It browses for you.' },
  { raw: 'shopping', kicker: 'SAVE TIME', title: 'Compare prices<br/>in seconds.' },
  { raw: 'main', kicker: 'A REAL BROWSER', title: 'Browse yourself,<br/>or let it browse.' },
  { raw: 'tabs', kicker: 'MANY TABS', title: 'Several agents,<br/>side by side.' },
  { raw: 'onboarding-2', kicker: 'SAFE BY DEFAULT', title: 'It asks before<br/>anything important.' },
  { raw: 'connect', kicker: 'PRIVATE', title: 'Runs on your<br/>ChatGPT plan.' },
];

const sizes = [
  { dir: 'iphone-6.9', w: 1320, h: 2868 },
  { dir: 'iphone-6.5', w: 1284, h: 2778 },
];

const html = (img, s) => `<!doctype html><html><head><style>
  *{box-sizing:border-box;margin:0}
  html,body{width:440px;height:956px;overflow:hidden;font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;color:#fff;
    background:radial-gradient(90% 55% at 15% 0%,rgba(62,230,168,.45),transparent 60%),radial-gradient(80% 50% at 100% 100%,rgba(11,143,224,.45),transparent 60%),#07090d}
  .copy{position:absolute;top:70px;left:0;right:0;text-align:center;padding:0 28px}
  .k{font-size:13px;font-weight:700;letter-spacing:.18em;color:#3ee6a8}
  h1{font-size:38px;line-height:1.08;letter-spacing:-.025em;margin-top:12px;font-weight:800}
  .phone{position:absolute;left:50%;top:250px;transform:translateX(-50%);width:356px;height:772px;border-radius:58px;padding:11px;
    background:linear-gradient(145deg,#2c313b,#0f1217);box-shadow:0 40px 90px -30px rgba(0,0,0,.9),0 0 0 1.5px rgba(255,255,255,.12) inset}
  .screen{width:100%;height:100%;border-radius:48px;overflow:hidden;position:relative;background:#0b0d12}
  .screen img{width:100%;display:block}
  .island{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:100px;height:30px;border-radius:20px;background:#000;z-index:2}
</style></head><body>
  <div class="copy"><div class="k">${s.kicker}</div><h1>${s.title}</h1></div>
  <div class="phone"><div class="screen"><div class="island"></div><img src="data:image/png;base64,${img}"/></div></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
for (const size of sizes) {
  rmSync(`../screenshots/${size.dir}`, { recursive: true, force: true });
  mkdirSync(`../screenshots/${size.dir}`, { recursive: true });
}
let i = 1;
for (const s of shots) {
  const img = readFileSync(`../raw/${s.raw}.png`).toString('base64');
  await page.setContent(html(img, s));
  await page.waitForTimeout(200);
  const master = `../screenshots/iphone-6.9/${String(i).padStart(2, '0')}-${s.raw}.png`;
  await page.screenshot({ path: master });
  // 6.5" variant: resize + center crop, strip alpha (App Store rejects alpha).
  execFileSync('magick', [master, '-resize', '1284x2790^', '-gravity', 'center', '-extent', '1284x2778', '-alpha', 'off', master.replace('iphone-6.9', 'iphone-6.5')]);
  execFileSync('magick', [master, '-alpha', 'off', master]);
  i += 1;
}
await browser.close();
console.log('ok');
