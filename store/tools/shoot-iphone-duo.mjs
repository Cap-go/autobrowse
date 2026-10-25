import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:5179';
const output = fileURLToPath(new URL('../screenshots/iphone-duo/', import.meta.url));
const states = ['onboarding-0', 'onboarding-1', 'onboarding-2', 'onboarding-3', 'connect', 'main', 'chat', 'shopping', 'tabs', 'settings'];
const displays = [
  { name: 'closed', width: 466, height: 678, top: 0, bottom: 34, left: 0, right: 84, capture: true },
  { name: 'open', width: 951, height: 669, top: 0, bottom: 34, left: 0, right: 84, capture: true },
  { name: 'closed-landscape', width: 678, height: 466, top: 0, bottom: 21, left: 84, right: 0, capture: false },
  { name: 'open-portrait', width: 669, height: 951, top: 24, bottom: 34, left: 0, right: 0, capture: false },
];
const browser = await chromium.launch({ headless: true });
try {
  for (const display of displays) {
    const context = await browser.newContext({
      viewport: { width: display.width, height: display.height },
      deviceScaleFactor: 3,
      colorScheme: 'dark',
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    if (display.capture) mkdirSync(`${output}/${display.name}`, { recursive: true });
    for (const state of states) {
      await page.goto(`${base}/?demo=${state}`);
      await page.locator('.screen').waitFor();
      if (state === 'chat' || state === 'shopping') await page.locator('.demo-page').waitFor();
      if (state === 'settings') await page.locator('.backdrop').waitFor();
      if (state === 'tabs') await page.getByRole('heading', { name: '3 tabs', exact: true }).waitFor();
      await page.addStyleTag({ content: `:root{--safe-top:${display.top}px;--safe-bottom:${display.bottom}px;--safe-left:${display.left}px;--safe-right:${display.right}px}*{animation:none!important;transition:none!important}` });
      const layout = await page.evaluate((state) => {
        const viewport = { width: innerWidth, height: innerHeight };
        const screen = document.querySelector('.screen');
        const bounds = screen.getBoundingClientRect();
        const footer = document.querySelector('.onboarding-footer');
        const primary = footer?.querySelector('button');
        const button = primary?.getBoundingClientRect();
        const activeSlide = document.querySelectorAll('.slide')[Number(state.split('-')[1] ?? 0)];
        const heading = activeSlide?.querySelector('h1, h2')?.getBoundingClientRect();
        return {
          viewport,
          bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          button: button ? { top: button.top, bottom: button.bottom } : null,
          heading: heading ? { top: heading.top, bottom: heading.bottom } : null,
          footerTop: footer?.getBoundingClientRect().top ?? null,
          controls: [...document.querySelectorAll('.tabs-head button, .sheet-head button')].map((control) => {
            const rect = control.getBoundingClientRect();
            return { label: control.getAttribute('aria-label'), left: rect.left, right: rect.right };
          }),
        };
      }, state);
      const label = `${display.name}/${state}: ${JSON.stringify(layout)}`;
      assert.ok(layout.pageWidth <= display.width + 1, `Horizontal overflow: ${label}`);
      assert.ok(layout.pageHeight <= display.height + 1, `Vertical overflow: ${label}`);
      assert.ok(layout.bounds.left >= display.left - 1 && layout.bounds.right <= display.width - display.right + 1, `Screen outside safe area: ${label}`);
      if (layout.button) assert.ok(layout.button.top >= 0 && layout.button.bottom <= display.height, `Unreachable Continue button: ${label}`);
      if (layout.heading) assert.ok(layout.heading.top >= 0 && layout.heading.bottom <= layout.footerTop, `Clipped onboarding heading: ${label}`);
      for (const control of layout.controls) assert.ok(control.left >= display.left && control.right <= display.width - display.right, `Control underneath side safe area: ${label}`);
      if (display.capture) await page.screenshot({ path: `${output}/${display.name}/${state}.png`, animations: 'disabled' });
      console.log(`PASS ${display.name}/${state}`);
    }
    await page.goto(`${base}/?demo=chat`);
    await page.locator('.demo-page').waitFor();
    const conversation = await page.locator('.turn').textContent();
    for (const target of displays) {
      await page.setViewportSize({ width: target.width, height: target.height });
      await page.addStyleTag({ content: `:root{--safe-top:${target.top}px;--safe-bottom:${target.bottom}px;--safe-left:${target.left}px;--safe-right:${target.right}px}` });
      assert.equal(await page.locator('.turn').textContent(), conversation, 'Resizing discarded the conversation');
      await page.getByRole('button', { name: 'Tabs', exact: true }).click();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      assert.equal(await page.locator('.turn').textContent(), conversation, 'Tab switcher discarded the conversation after resizing');
    }
    console.log(`PASS ${display.name}/resize-with-conversation`);
    await context.close();
  }
} finally {
  await browser.close();
}
