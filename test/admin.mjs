import { chromium } from 'playwright';
const b = await chromium.launch({ ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}) });
const c = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const fails = [];

await c.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith('http://127.0.0.1')) return route.continue();
  if (u.startsWith('https://www.youtube.com/oembed')) {
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      title: 'Novel Core / TEST SONG -Music Video-', author_name: 'Novel Core Official',
      thumbnail_url: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' }) });
  }
  if (u.startsWith('https://noembed.com/embed')) {
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      title: 'すごく良かったです！', author_name: 'a_fan' }) });
  }
  return route.abort();
});

const p = await c.newPage();
p.on('pageerror', (e) => fails.push('pageerror: ' + e.message));
await p.goto('http://127.0.0.1:8123/admin/', { waitUntil: 'load' });
await p.waitForTimeout(900);

const check = (name, cond, extra = '') => console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

// unconnected → setup pane is shown first
check('opens on setup when not connected', await p.isVisible('#pane-setup'));

// paste a YouTube link → lands in 実績 with parsed title/artist
await p.fill('#pasteInput', 'https://youtu.be/AAAAAAAAAAA');
await p.click('#pasteBtn');
await p.waitForTimeout(900);
check('youtube link opens the 実績 tab', await p.getAttribute('#tabs button[data-tab="works"]', 'aria-selected') === 'true');
const first = await p.inputValue('#pane-works .row-item:first-child input[data-field="title"]');
const artist = await p.inputValue('#pane-works .row-item:first-child input[data-field="artist"]');
check('title parsed from oEmbed', first === 'TEST SONG', `got "${first}"`);
check('artist parsed from oEmbed', artist === 'Novel Core', `got "${artist}"`);
check('save bar appears', await p.isVisible('.savebar.show'));
check('publish blocked until connected', await p.isDisabled('#publishBtn'));

// paste an X link → lands in ファンの声
await p.fill('#pasteInput', 'https://x.com/someone/status/123');
await p.click('#pasteBtn');
await p.waitForTimeout(900);
check('x.com link opens the ファンの声 tab', await p.getAttribute('#tabs button[data-tab="voices"]', 'aria-selected') === 'true');
const quote = await p.inputValue('#pane-voices .row-item:first-child textarea[data-field="quote"]');
check('quote captured', quote === 'すごく良かったです！', `got "${quote}"`);

// paste an Amazon link → lands in 愛用品
await p.fill('#pasteInput', 'https://www.amazon.co.jp/dp/B000TEST');
await p.click('#pasteBtn');
await p.waitForTimeout(900);
check('amazon link opens the 愛用品 tab', await p.getAttribute('#tabs button[data-tab="picks"]', 'aria-selected') === 'true');

// edits persist across a reload (draft in localStorage)
await p.click('#tabs button[data-tab="works"]');
await p.waitForTimeout(300);
await p.fill('#pane-works .row-item:first-child input[data-field="views"]', '99万回再生');
await p.waitForTimeout(400);
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(1200);
await p.click('#tabs button[data-tab="works"]');
await p.waitForTimeout(400);
const kept = await p.inputValue('#pane-works .row-item:first-child input[data-field="views"]');
check('unpublished edits survive a reload', kept === '99万回再生', `got "${kept}"`);
check('save bar still shown after reload', await p.isVisible('.savebar.show'));

// delete removes the row
p.once('dialog', (d) => d.accept());
const before = await p.$$eval('#pane-works .row-item', (r) => r.length);
await p.click('#pane-works .row-item:first-child [data-act="del"]');
await p.waitForTimeout(500);
const after = await p.$$eval('#pane-works .row-item', (r) => r.length);
check('delete removes one row', after === before - 1, `${before} -> ${after}`);

// reorder
const t0 = await p.inputValue('#pane-works .row-item:nth-child(1) input[data-field="title"]');
await p.click('#pane-works .row-item:nth-child(2) [data-act="up"]');
await p.waitForTimeout(500);
const t1 = await p.inputValue('#pane-works .row-item:nth-child(2) input[data-field="title"]');
check('move-up swaps rows', t0 === t1, `"${t0}" now second`);

// settings tab writes into site state
await p.click('#tabs button[data-tab="settings"]');
await p.waitForTimeout(400);
await p.fill('input[data-site="affiliate.amazonTag"]', 'jugem-22');
await p.waitForTimeout(300);
check('プロフィール marked dirty', (await p.textContent('#saveMsg')).includes('プロフィール'));
await p.screenshot({ path: process.env.SP + '/a4-dirty.png' });

console.log(fails.length ? 'ERRORS: ' + fails.join(' | ') : 'no page errors');
await b.close();
