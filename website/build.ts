/**
 * Static site for https://autobrowse.dev (Cloudflare Workers static assets).
 * `bun website/build.ts` writes website/dist; `bun run site:deploy` publishes.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { $ } from 'bun';

const ROOT = import.meta.dir;
const OUT = join(ROOT, 'dist');
const REPO = join(ROOT, '..');

const SITE = 'https://autobrowse.dev';
const APP_STORE = 'https://apps.apple.com/app/id6821215230';
const PLAY = 'https://play.google.com/store/apps/details?id=app.capgo.browser';
const EMAIL = 'tori@capgo.app';
const UPDATED = 'October 13, 2026';

interface Page {
  path: string;
  title: string;
  description: string;
  body: string;
  bare?: boolean;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const storeButtons = `
<div class="stores">
  <a class="store" href="${APP_STORE}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg><span><small>Download on the</small>App Store</span></a>
  <a class="store" href="${PLAY}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 2.6v18.8c0 .4.4.7.8.5l10.4-10.4L4.8 2.1c-.4-.2-.8.1-.8.5zm12.6 7.5L6.9 4.5l9.7 9.7v-4.1zm0 3.8L6.9 23.5l9.7-5.6 3.3-1.9c.9-.5.9-1.6 0-2.1l-3.3-1.9z"/></svg><span><small>Get it on</small>Google Play</span></a>
</div>`;

function layout(page: Page): string {
  const nav = page.bare
    ? ''
    : `<header class="nav"><a class="brand" href="/"><img src="/icon.png" alt="" width="32" height="32">Auto Browse</a>
<nav><a href="/deeplinks/">Deep links</a><a href="/support/">Support</a><a href="/privacy/">Privacy</a></nav></header>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${SITE}${page.path}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:url" content="${SITE}${page.path}">
<meta name="twitter:card" content="summary_large_image">
<meta name="apple-itunes-app" content="app-id=6821215230">
<meta name="theme-color" content="#0E8F6E">
<link rel="icon" href="/icon.png">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="stylesheet" href="/style.css">
</head>
<body>
${nav}
<main>${page.body}</main>
<footer class="foot">
  <p><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · <a href="/support/">Support</a> · <a href="/deeplinks/">Deep links</a></p>
  <p>© 2026 Digital shift OU · By <a href="https://capgo.app/?utm_source=autobrowse.dev">Capgo</a> and <a href="https://x.com/martindonadieu">Martin Donadieu</a> · Not affiliated with OpenAI.</p>
</footer>
</body>
</html>
`;
}

const shot = (file: string, alt: string): string =>
  `<img src="/shots/${file}.jpg" alt="${esc(alt)}" width="660" height="1434" loading="lazy">`;

const feature = (title: string, text: string): string => `<div class="feature"><h3>${title}</h3><p>${text}</p></div>`;

const home: Page = {
  path: '/',
  title: 'Auto Browse: the AI agent that browses for you',
  description:
    'Auto Browse is an iPhone and Android browser with an AI agent. Ask in plain words, watch it open pages, click, type and get things done, using your own ChatGPT account.',
  body: `
<section class="hero">
  <img class="hero-icon" src="/icon.png" alt="Auto Browse app icon" width="96" height="96">
  <p class="eyebrow">AI browsing agent</p>
  <h1>Ask it.<br>It browses for you.</h1>
  <p class="lede">A real mobile browser with an AI agent inside. Say what you need, then watch it open pages, click, scroll and type, step by step. Take over whenever you want.</p>
  ${storeButtons}
  <p class="fine">Free. Uses your own ChatGPT account. No ads, no tracking.</p>
</section>

<section class="shots" aria-label="Screenshots">
  ${shot('01-chat', 'Agent summarizing Hacker News while the page is visible above the chat')}
  ${shot('02-shopping', 'Agent comparing product prices')}
  ${shot('04-tabs', 'Several tabs, each with its own agent')}
  ${shot('03-main', 'Start page with shortcuts')}
</section>

<section class="features">
  ${feature('Watch every step', 'The page sits above the chat. You see the agent search, read, tap and type, live. Drag the divider, fold the chat into a small status pill, or take over the page.')}
  ${feature('Many tabs, many agents', 'Each tab has its own page and conversation. Compare prices in one tab and plan a trip in another while both run.')}
  ${feature('Secrets stay secret', 'Passwords and codes go into a secure card, stay in the Keychain, and are filled into the right site by the app. The AI never sees them.')}
  ${feature('It asks, you decide', 'The agent asks with simple answer cards and stops before buying, posting or changing an account. Links that try to open other apps need your OK.')}
  ${feature('Export the results', 'Ask for a table and get a CSV, JSON or Markdown file you can save or share.')}
  ${feature('Voice', 'Tap the mic and speak. Dictation runs on your device.')}
</section>

<section class="band">
  <h2>Your data, your choice</h2>
  <p>Nothing is sent to OpenAI until you allow it. The app shows exactly what is shared: your messages and the pages the agent reads. Passwords never are. Your ChatGPT sign in stays in secure device storage and there is no Auto Browse account.</p>
  <p><a href="/privacy/">Read the privacy policy</a></p>
</section>

<section class="band">
  <h2>Start tasks from anywhere</h2>
  <p>Any website, app, QR code or Shortcut can open Auto Browse with a task ready to start. The user always confirms first.</p>
  <pre><code>${SITE}/run?prompt=Summarize%20this%20page&amp;url=https%3A%2F%2Fnews.ycombinator.com</code></pre>
  <p><a href="/deeplinks/">Deep link docs</a></p>
</section>
`,
};

const privacy: Page = {
  path: '/privacy/',
  title: 'Privacy Policy · Auto Browse',
  description: 'What Auto Browse does with your data, what is shared with OpenAI and how to control it.',
  body: `<article class="doc">
<h1>Privacy Policy</h1>
<p class="muted">Last updated: ${UPDATED}</p>
<p>Auto Browse ("the app") is made by Digital shift OU, operating Capgo ("we"). This policy explains what happens to your data when you use the app on iOS or Android.</p>

<h2>Summary</h2>
<ul>
<li>No Auto Browse account, no ads, no analytics, no tracking.</li>
<li>Data is sent to OpenAI only after you allow it in the app, and only to do the tasks you ask for.</li>
<li>Passwords and secrets you type in secure cards are never sent to OpenAI or to us.</li>
<li>Your ChatGPT sign in is stored only in the iOS Keychain or Android Keystore.</li>
</ul>

<h2>Data shared with OpenAI (third-party AI)</h2>
<p>The AI agent is powered by OpenAI (ChatGPT), using your own ChatGPT account. Before anything is sent, the app shows a consent screen listing what is shared and asks for your permission. If you choose "Don't allow", nothing is sent and the agent does not run. You can turn this off at any time in Settings &gt; AI data sharing.</p>
<p>When you allow it and run a task, the app sends directly from your device to OpenAI:</p>
<ul>
<li>your messages to the agent, including text you dictate;</li>
<li>the text, links, form fields and screenshots of the web pages the agent opens or reads;</li>
<li>your answers to the agent's questions.</li>
</ul>
<p>Never sent: passwords, one-time codes, card numbers and other values you enter in secure secret cards. They are filled into the page by the app, and any known secret is removed from text before it is sent.</p>
<p>Requests are made with storage disabled (<code>store: false</code>). OpenAI processes this data to produce the agent's answers and actions, under its own terms and <a href="https://openai.com/policies/privacy-policy/">privacy policy</a>. OpenAI provides the same or equal protection for this data as described here and in its policies. We do not receive this data.</p>

<h2>Data that stays on your device</h2>
<ul>
<li><strong>ChatGPT credentials</strong> (access, refresh and ID tokens): Keychain/Keystore only. Deleted when you sign out.</li>
<li><strong>Email address</strong>: read from your ChatGPT ID token to show which account is connected.</li>
<li><strong>Browsing data</strong>: pages, cookies and cache of the in-app browser. Clear them in Settings.</li>
<li><strong>Saved secrets</strong>: only when you choose "Remember on this device", in the Keychain/Keystore, bound to one website. Delete them in Settings.</li>
<li><strong>Chats and preferences</strong>: kept on the device.</li>
</ul>

<h2>Voice input</h2>
<p>Dictation uses the speech recognition built into your phone (Apple Speech on iOS, Android speech services). Depending on your device settings, Apple or Google may process the audio under their own privacy policies. We never receive the audio.</p>

<h2>Reporting an AI answer</h2>
<p>If you tap "Report" on an answer and send the report, the app sends us the reported answer, the message that led to it, your reason, an optional comment, and the platform and app version, so we can review problems with AI output. This is sent only when you choose to send a report. It is delivered by email to our team and is not used for anything else.</p>

<h2>App updates</h2>
<p>The app downloads updates to its web code from Capgo's update service. This request contains the app version and a random device identifier used only to deliver the right update. It contains no personal data.</p>

<h2>Websites you visit</h2>
<p>Websites you open in the app may collect data under their own privacy policies, like in any browser.</p>

<h2>Children</h2>
<p>The app is not directed to children under 13 and needs a ChatGPT account, which has its own age requirements.</p>

<h2>Your choices</h2>
<ul>
<li>Use the browser without signing in. Nothing is sent to OpenAI.</li>
<li>Withdraw consent in Settings &gt; AI data sharing.</li>
<li>Sign out in Settings. This deletes all stored tokens.</li>
<li>Delete the app to remove all local data.</li>
<li>Revoke the app's access in your ChatGPT account settings.</li>
</ul>

<h2>Contact</h2>
<p><a href="mailto:${EMAIL}">${EMAIL}</a>, Digital shift OU (Capgo), Tallinn, Estonia.</p>
</article>`,
};

const terms: Page = {
  path: '/terms/',
  title: 'Terms of Use · Auto Browse',
  description: 'Terms of use for the Auto Browse app.',
  body: `<article class="doc">
<h1>Terms of Use</h1>
<p class="muted">Last updated: ${UPDATED}</p>
<p>By using Auto Browse you agree to these terms. On iOS, Apple's <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Standard End User License Agreement</a> also applies.</p>
<ol>
<li><strong>The service.</strong> Auto Browse is a web browser with an optional AI agent that acts on websites when you ask.</li>
<li><strong>Your ChatGPT account.</strong> The agent uses your own ChatGPT account and plan. Your use of OpenAI services follows OpenAI's terms and <a href="https://openai.com/policies/usage-policies/">usage policies</a>. Auto Browse is not affiliated with OpenAI.</li>
<li><strong>You are responsible for actions.</strong> The agent can make mistakes. Check results and confirm important actions (payments, purchases, messages, account changes) yourself. Do not use the agent for illegal activity, to break website terms, or to harm others.</li>
<li><strong>No warranty.</strong> The app is provided "as is" without warranty of any kind. To the extent allowed by law, Digital shift OU is not liable for damages from use of the app or from actions taken by the agent.</li>
<li><strong>Changes.</strong> We may update these terms. If you keep using the app, you accept the new terms.</li>
</ol>
<p>Contact: <a href="mailto:${EMAIL}">${EMAIL}</a></p>
</article>`,
};

const support: Page = {
  path: '/support/',
  title: 'Support · Auto Browse',
  description: 'Get help with Auto Browse.',
  body: `<article class="doc">
<h1>Support</h1>
<p>Email <a href="mailto:${EMAIL}">${EMAIL}</a>. We reply within 2 business days.</p>
<h2>FAQ</h2>
<h3>Do I need a ChatGPT account?</h3><p>Only for the AI agent. The browser works without signing in.</p>
<h3>Does it cost anything?</h3><p>No. The app is free and the agent uses your own ChatGPT plan limits.</p>
<h3>I hit a usage limit.</h3><p>Your ChatGPT plan has usage limits. Wait for them to reset or change your plan with OpenAI.</p>
<h3>What is sent to OpenAI?</h3><p>Only after you allow it: your messages, the pages the agent reads and your answers to its questions. Passwords from secure cards never are. Turn it off in Settings &gt; AI data sharing. Details in the <a href="/privacy/">privacy policy</a>.</p>
<h3>How do I delete my data?</h3><p>Settings &gt; Sign out removes your tokens. "Close all tabs and clear browsing data" removes cookies and cache. Deleting the app removes everything.</p>
<h3>An answer was wrong or harmful.</h3><p>Tap "Report" under the answer. We review every report.</p>
</article>`,
};

const deeplinks: Page = {
  path: '/deeplinks/',
  title: 'Deep links · Auto Browse',
  description: 'Open Auto Browse from any website, app, QR code or Shortcut with a task ready to start.',
  body: `<article class="doc">
<h1>Deep links</h1>
<p>Websites, apps, ChatGPT answers, emails, QR codes and Shortcuts can open Auto Browse and prepare a task. Links never start the agent on their own: the task shows in a card with <strong>Start</strong>, <strong>Edit</strong> and <strong>Dismiss</strong>.</p>
<h2>Formats</h2>
<table>
<tr><th>Link</th><th>What it does</th></tr>
<tr><td><code>${SITE}/run?prompt=…&amp;url=…</code></td><td>New tab, loads <code>url</code> (optional) and offers <code>prompt</code></td></tr>
<tr><td><code>${SITE}/open?url=…</code></td><td>New tab with <code>url</code></td></tr>
<tr><td><code>autobrowse://run?prompt=…&amp;url=…</code></td><td>Same as <code>/run</code>, app only</td></tr>
<tr><td><code>autobrowse://open?url=…</code></td><td>Same as <code>/open</code>, app only</td></tr>
</table>
<p>The <code>https://autobrowse.dev</code> links open the app when it is installed, and this website otherwise.</p>
<h2>Parameters</h2>
<ul>
<li><code>prompt</code>: URL-encoded task, up to 2000 characters.</li>
<li><code>url</code>: page to open. Only <code>https://</code> is accepted.</li>
<li><code>tab</code>: <code>new</code> (default) or <code>current</code>.</li>
</ul>
<h2>Example</h2>
<pre><code>const link = '${SITE}/run?' + new URLSearchParams({
  prompt: 'Summarize this page in 5 bullets',
  url: 'https://news.ycombinator.com',
});</code></pre>
<p><a class="button" href="/run?prompt=Summarize%20the%20top%203%20stories&amp;url=https%3A%2F%2Fnews.ycombinator.com">Try it</a></p>
</article>`,
};

const fallback = (action: 'run' | 'open'): Page => ({
  path: `/${action}/`,
  title: action === 'run' ? 'Start a task in Auto Browse' : 'Open in Auto Browse',
  description: 'Open this link in the Auto Browse app.',
  body: `<section class="hero small">
  <img class="hero-icon" src="/icon.png" alt="" width="80" height="80">
  <h1>${action === 'run' ? 'Start this task in Auto Browse' : 'Open this page in Auto Browse'}</h1>
  <div class="task" id="task" hidden><p class="muted">Task</p><p id="prompt"></p><p class="muted" id="url"></p></div>
  <p><a class="button" id="open" href="autobrowse://${action}">Open in Auto Browse</a></p>
  <p class="fine">Don't have the app?</p>
  ${storeButtons}
</section>
<script>
const q = new URLSearchParams(location.search);
const p = q.get('prompt'), u = q.get('url');
if (p || u) {
  document.getElementById('task').hidden = false;
  document.getElementById('prompt').textContent = p || '';
  document.getElementById('url').textContent = u || '';
}
document.getElementById('open').href = 'autobrowse://${action}' + location.search;
</script>`,
});

const notFound: Page = {
  path: '/404.html',
  title: 'Not found · Auto Browse',
  description: 'Page not found.',
  body: `<section class="hero small"><h1>Page not found</h1><p><a class="button" href="/">Go home</a></p></section>`,
};

const PAGES = [home, privacy, terms, support, deeplinks, fallback('run'), fallback('open'), notFound];

// ---------- write ----------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const write = (rel: string, content: string): void => {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

for (const page of PAGES) {
  write(page.path.endsWith('.html') ? page.path : join(page.path, 'index.html'), layout(page));
}

cpSync(join(ROOT, 'static'), OUT, { recursive: true });
cpSync(join(REPO, 'store/icon/AppIcon-1024.png'), join(OUT, 'icon-1024.png'));
await $`sips -Z 192 ${join(REPO, 'store/icon/AppIcon-1024.png')} --out ${join(OUT, 'icon.png')}`.quiet();
mkdirSync(join(OUT, 'shots'), { recursive: true });
for (const name of ['01-chat', '02-shopping', '03-main', '04-tabs']) {
  await $`sips -Z 1434 -s format jpeg -s formatOptions 80 ${join(REPO, `store/screenshots/iphone-6.9/${name}.png`)} --out ${join(OUT, `shots/${name}.jpg`)}`.quiet();
}
cpSync(join(REPO, 'store/android/feature-graphic.png'), join(OUT, 'og.png'));

write(
  '.well-known/apple-app-site-association',
  JSON.stringify(
    {
      applinks: {
        details: [
          {
            appIDs: ['UVTJ336J2D.app.capgo.browser'],
            components: [
              { '/': '/run*', comment: 'Start an agent task' },
              { '/': '/open*', comment: 'Open a page' },
            ],
          },
        ],
      },
    },
    null,
    2,
  ),
);
write(
  '.well-known/assetlinks.json',
  JSON.stringify(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'app.capgo.browser',
          sha256_cert_fingerprints: [
            '2D:51:F6:37:12:8F:D9:3A:A8:C6:2A:46:E4:E3:C0:0B:A5:F3:67:B3:68:E0:5E:2A:F3:82:29:3A:47:F8:C7:CF',
            '97:2F:9F:36:45:D2:16:A5:17:BA:DC:BC:06:C4:86:C7:14:1B:D7:CA:E1:E0:13:DA:2D:FA:D3:8F:41:62:10:97',
          ],
        },
      },
    ],
    null,
    2,
  ),
);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.filter((p) => !p.path.endsWith('.html')).map((p) => `<url><loc>${SITE}${p.path}</loc></url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Built ${PAGES.length} pages into ${OUT}`);
