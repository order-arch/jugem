import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SP = process.env.SP;
const CACHE = `${SP}/cache`;
const errors = [];
const md5 = (s) => createHash('md5').update(s).digest('hex').slice(0, 16);

const browser = await chromium.launch({ ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

/* serve external assets from the local cache; nothing else may leave the box */
await ctx.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://127.0.0.1')) return route.continue();

  const yt = url.match(/i\.ytimg\.com\/vi\/([^/]+)\//);
  if (yt && existsSync(`${CACHE}/thumbs/${yt[1]}.jpg`)) {
    return route.fulfill({ contentType: 'image/jpeg', body: readFileSync(`${CACHE}/thumbs/${yt[1]}.jpg`) });
  }
  if (url.startsWith('https://fonts.googleapis.com/css2')) {
    return route.fulfill({ contentType: 'text/css', body: readFileSync(`${CACHE}/fonts.css`, 'utf8') });
  }
  if (url.startsWith('https://fonts.gstatic.com')) {
    const f = `${CACHE}/fonts/${md5(url)}.woff2`;
    if (existsSync(f)) return route.fulfill({ contentType: 'font/woff2', body: readFileSync(f) });
  }
  return route.abort();
});

const page = await ctx.newPage();
const isHarnessAbort = (t) => /Failed to load resource|ERR_FAILED|ERR_BLOCKED/.test(t);
page.on('console', (m) => { if (m.type() === 'error' && !isHarnessAbort(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => {
  if (r.url().startsWith('http://127.0.0.1')) errors.push('local fail: ' + r.url());
});

await page.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
await page.waitForSelector('.panel');
await page.waitForTimeout(1500);

const panels = await page.$$eval('.panel', (ps) => ps.map((p) => p.id));
console.log('panels:', panels.join(' '));
console.log('nav:', await page.$$eval('#index button', (b) => b.length),
            '| works:', await page.$$eval('.work', (w) => w.length),
            '| news:', await page.$$eval('.news-card', (n) => n.length));
console.log('track:', JSON.stringify(await page.evaluate(() => {
  const t = document.getElementById('track');
  return { scrollWidth: t.scrollWidth, clientWidth: t.clientWidth };
})));

await page.screenshot({ path: `${SP}/01-intro.png` });
for (let i = 1; i < panels.length; i++) {
  await page.evaluate((id) => {
    document.getElementById('track').scrollTo({ left: document.getElementById(id).offsetLeft, behavior: 'auto' });
  }, panels[i]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SP}/${String(i + 1).padStart(2, '0')}-${panels[i].slice(2)}.png` });
}

/* vertical wheel must move the track sideways and never scroll the document */
await page.evaluate(() => document.getElementById('track').scrollTo({ left: 0, behavior: 'auto' }));
await page.waitForTimeout(400);
await page.mouse.move(700, 450);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(600);
const w = await page.evaluate(() => ({ x: document.getElementById('track').scrollLeft, y: window.scrollY }));
console.log('wheel →', JSON.stringify(w), w.x > 300 && w.y === 0 ? 'OK' : 'FAIL');

/* keyboard */
await page.keyboard.press('End');
await page.waitForTimeout(900);
const atEnd = await page.evaluate(() => {
  const t = document.getElementById('track');
  return t.scrollLeft >= t.scrollWidth - t.clientWidth - 4;
});
console.log('End key reaches last panel:', atEnd ? 'OK' : 'FAIL');

/* mobile */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
await mctx.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://127.0.0.1')) return route.continue();
  const yt = url.match(/i\.ytimg\.com\/vi\/([^/]+)\//);
  if (yt && existsSync(`${CACHE}/thumbs/${yt[1]}.jpg`)) return route.fulfill({ contentType: 'image/jpeg', body: readFileSync(`${CACHE}/thumbs/${yt[1]}.jpg`) });
  if (url.startsWith('https://fonts.googleapis.com/css2')) return route.fulfill({ contentType: 'text/css', body: readFileSync(`${CACHE}/fonts.css`, 'utf8') });
  if (url.startsWith('https://fonts.gstatic.com')) {
    const f = `${CACHE}/fonts/${md5(url)}.woff2`;
    if (existsSync(f)) return route.fulfill({ contentType: 'font/woff2', body: readFileSync(f) });
  }
  return route.abort();
});
const m = await mctx.newPage();
await m.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
await m.waitForTimeout(1600);
await m.screenshot({ path: `${SP}/m1-intro.png` });
for (const [i, id] of ['p-now', 'p-works', 'p-contact'].entries()) {
  await m.evaluate((x) => { document.getElementById('track').scrollTo({ left: document.getElementById(x).offsetLeft, behavior: 'auto' }); }, id);
  await m.waitForTimeout(700);
  await m.screenshot({ path: `${SP}/m${i + 2}-${id.slice(2)}.png` });
}
/* a real finger swipe must move the track, never the document */
await m.evaluate(() => document.getElementById('track').scrollTo({ left: 0, behavior: 'auto' }));
await m.waitForTimeout(300);
await m.touchscreen.tap(195, 500);
const before = await m.evaluate(() => document.getElementById('track').scrollLeft);
const cdp = await mctx.newCDPSession(m);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y: 500 }] });
for (const x of [280, 220, 160, 110, 70]) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 500 }] });
  await m.waitForTimeout(30);
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await m.waitForTimeout(900);
const after = await m.evaluate(() => ({
  track: document.getElementById('track').scrollLeft,
  docX: document.scrollingElement.scrollLeft,
  docY: document.scrollingElement.scrollTop,
  bodyW: document.body.scrollWidth, vw: document.body.clientWidth,
}));
const chrome = await m.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) }; };
  return { vw: document.documentElement.clientWidth, innerW: window.innerWidth,
           index: r('#index'), hint: r('#hint'),
           catchW: r('.hero-catch').x + r('.hero-catch').w };
});
console.log('mobile chrome:', JSON.stringify(chrome),
  (chrome.index.x + chrome.index.w <= chrome.vw && chrome.catchW <= chrome.vw) ? 'OK' : 'FAIL');
console.log('swipe: track', before, '->', after.track, '| doc', after.docX, after.docY,
  '| body', after.bodyW, 'vs', after.vw,
  (after.track > before && after.docX === 0 && after.docY === 0 && after.bodyW <= after.vw + 1) ? 'OK' : 'FAIL');

/* admin */
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('admin pageerror: ' + e.message));
a.on('console', (msg) => { if (msg.type() === 'error' && !isHarnessAbort(msg.text())) errors.push('admin console: ' + msg.text()); });
await a.setViewportSize({ width: 1280, height: 1000 });
await a.goto('http://127.0.0.1:8123/admin/', { waitUntil: 'load' });
await a.waitForTimeout(1500);
await a.screenshot({ path: `${SP}/a1-setup.png`, fullPage: true });
await a.click('button[data-tab="works"]');
await a.waitForTimeout(600);
console.log('admin work rows:', await a.$$eval('.row-item', (r) => r.length));
await a.screenshot({ path: `${SP}/a2-works.png` });
await a.click('button[data-tab="settings"]');
await a.waitForTimeout(500);
await a.screenshot({ path: `${SP}/a3-settings.png`, fullPage: true });

console.log(errors.length ? '\nERRORS:\n' + [...new Set(errors)].join('\n') : '\nno console/page errors');
await browser.close();
