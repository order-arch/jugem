/* JUGEM — public site.
   Everything below is rendered from data/*.json so the owner never edits markup. */

import {
  DATA_FILES, loadJSON, escapeHTML, safeURL, formatDate,
  affiliate, hasAffiliate, hostLabel,
} from './lib.js';

const track = document.getElementById('track');
const indexNav = document.getElementById('index');
const veil = document.getElementById('veil');
const hint = document.getElementById('hint');
const progressBar = document.getElementById('progressBar');

const NEW_DAYS = 30;

boot();

async function boot() {
  const [site, news, works, voices, picks] = await Promise.all([
    loadJSON(DATA_FILES.site, { bust: true }).catch(() => ({})),
    loadJSON(DATA_FILES.news, { bust: true }).catch(() => ({ items: [] })),
    loadJSON(DATA_FILES.works, { bust: true }).catch(() => ({ items: [] })),
    loadJSON(DATA_FILES.voices, { bust: true }).catch(() => ({ items: [] })),
    loadJSON(DATA_FILES.picks, { bust: true }).catch(() => ({ items: [] })),
  ]);

  document.title = `${site.name || 'JUGEM'} — ${site.role || 'Composer / Artist'}`;
  render(site, news.items || [], works.items || [], voices.items || [], picks.items || []);
  wireNavigation();
  installAnalytics(site.analytics);

  requestAnimationFrame(() => veil.classList.add('done'));
}

/* ============================================================
   Rendering
   ============================================================ */

function render(site, news, works, voices, picks) {
  const sections = [
    { id: 'intro',   en: 'INTRO',   ja: '序',     html: heroPanel(site) },
    { id: 'now',     en: 'NOW',     ja: '最新作', html: featurePanel(site), skipIfEmpty: !(site.featured && site.featured.title) },
    { id: 'news',    en: 'NEWS',    ja: '最新',   html: newsPanel(news) },
    { id: 'works',   en: 'WORKS',   ja: '実績',   html: worksPanel(works, site) },
    { id: 'voice',   en: 'VOICE',   ja: '声',     html: voicePanel(voices, site), skipIfEmpty: !voices.length && !site.fanFormUrl },
    { id: 'picks',   en: 'PICKS',   ja: '愛用',   html: picksPanel(picks, site), skipIfEmpty: !picks.length },
    { id: 'about',   en: 'ABOUT',   ja: '経歴',   html: aboutPanel(site) },
    { id: 'contact', en: 'CONTACT', ja: '連絡',   html: contactPanel(site) },
  ].filter((s) => !s.skipIfEmpty);

  track.innerHTML = sections.map((s, i) => panel(s, i)).join('');
  indexNav.innerHTML = sections.map((s, i) => `
    <button type="button" data-goto="${s.id}">
      <span class="t">${escapeHTML(s.en)}</span>
      <span class="n">${String(i).padStart(2, '0')}</span>
    </button>`).join('');
}

function panel({ id, en, ja, html }, i) {
  const isHero = id === 'intro';
  const rail = isHero ? '' : `
    <div class="rail" aria-hidden="true">
      <div class="num">${String(i).padStart(2, '0')}</div>
      <div class="en">${escapeHTML(en)}</div>
      <div class="ja">${escapeHTML(ja)}</div>
    </div>`;
  return `<section class="panel ${isHero ? 'hero' : ''} ${id === 'contact' ? 'contact' : ''}"
            id="p-${id}" aria-labelledby="h-${id}">
    ${rail}
    <h2 class="sr-only" id="h-${id}">${escapeHTML(en)} / ${escapeHTML(ja)}</h2>
    <div class="body">${html}</div>
  </section>`;
}

/* ---------- 00 intro ---------- */

function heroPanel(site) {
  const meta = [site.location, site.roleJa, `WORKS FOR ${(site.clients || [])[0] || ''}`.trim()]
    .filter(Boolean).map((m) => `<span>${escapeHTML(m)}</span>`).join('');
  return `
    <div class="reveal">
      <p class="hero-role">${escapeHTML(site.role || '')}</p>
      <h1 class="hero-name">${escapeHTML(site.name || 'JUGEM')}<span class="dot">.</span></h1>
      <p class="hero-catch">${escapeHTML(site.catch || '')}</p>
      <div class="hero-meta">${meta}</div>
    </div>`;
}

/* ---------- 01 now / featured ---------- */

function featurePanel(site) {
  const f = site.featured || {};
  const href = safeURL(f.url || '');
  const notes = (f.notes || []).map((n) => `<li>${escapeHTML(n)}</li>`).join('');
  const stat = f.statNum ? `<div class="stat">
      <span class="big">${escapeHTML(f.statNum)}</span>
      ${f.statDen ? `<span class="den">/ ${escapeHTML(f.statDen)}</span>` : ''}
      <span class="lab">${escapeHTML(f.statLabel || '')}</span>
    </div>` : '';
  return `<div class="feature reveal">
    ${f.image ? `<div class="art"><img src="${escapeHTML(f.image)}" alt="" loading="lazy"></div>` : ''}
    <div class="text">
      <p class="eyebrow">${escapeHTML(f.eyebrow || 'FEATURED')}</p>
      <p class="artist">${escapeHTML(f.artist || '')}</p>
      <h3>${escapeHTML(f.title || '')}</h3>
      ${f.meta ? `<p class="meta">${escapeHTML(f.meta)}</p>` : ''}
      ${stat}
      ${notes ? `<ul>${notes}</ul>` : ''}
      ${href ? `<a class="go" href="${href}" target="_blank" rel="noopener">詳しく見る →</a>` : ''}
    </div>
  </div>`;
}

/* ---------- 02 news ---------- */

function newsPanel(items) {
  if (!items.length) {
    return `<div class="stack"><div class="empty reveal">
      まもなく最新情報を掲載します。<br>Latest updates coming soon.
    </div></div>`;
  }
  const sorted = [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const cards = sorted.map((n) => {
    const href = safeURL(n.url || '');
    const tag = href ? 'a' : 'div';
    const attrs = href ? ` href="${href}" target="_blank" rel="noopener"` : '';
    return `<${tag} class="news-card"${attrs}>
      <div>
        <div class="date">${escapeHTML(formatDate(n.date))} ${isNew(n.date) ? '<span class="chip new">NEW</span>' : ''}</div>
        <h3>${escapeHTML(n.title || '')}</h3>
        ${n.body ? `<p>${escapeHTML(n.body)}</p>` : ''}
      </div>
      ${href ? `<div class="go">${escapeHTML(hostLabel(n.url))} →</div>` : ''}
    </${tag}>`;
  }).join('');
  return `<div class="hlist reveal">${cards}</div>`;
}

function isNew(date) {
  if (!date) return false;
  const t = Date.parse(date);
  return Number.isFinite(t) && (Date.now() - t) < NEW_DAYS * 864e5;
}

/* ---------- 02 works ---------- */

function worksPanel(items, site) {
  if (!items.length) return `<div class="empty reveal">実績を準備中です。</div>`;
  const cfg = site.affiliate || {};
  const cards = items.map((w) => {
    const href = safeURL(w.url || '');
    const listen = w.listenUrl ? safeURL(affiliate(w.listenUrl, cfg)) : '';
    const sub = [w.role, w.note, w.year].filter(Boolean).join('　/　');
    return `<a class="work" href="${href}" target="_blank" rel="noopener"
              aria-label="${escapeHTML(`${w.artist} ${w.title}`)}">
      <div class="frame">
        ${w.pinned ? '<span class="pin">PICK UP</span>' : ''}
        <img src="${escapeHTML(w.thumb || '')}" alt="" loading="lazy" decoding="async"
             onerror="this.src='https://i.ytimg.com/vi/${escapeHTML(w.videoId || '')}/hqdefault.jpg'">
        <span class="play"><span>▶</span></span>
      </div>
      <div class="meta">
        <div class="artist">${escapeHTML(w.artist || '')}</div>
        <h3>${escapeHTML(w.title || '')}</h3>
        ${sub ? `<p class="sub">${escapeHTML(sub)}</p>` : ''}
        ${w.views ? `<p class="sub">▶ ${escapeHTML(w.views)}</p>` : ''}
      </div>
    </a>${listen ? `<span class="sr-only"><a href="${listen}">配信で聴く</a></span>` : ''}`;
  }).join('');
  return `<div class="hlist rows-2 reveal">${cards}</div>`;
}

/* ---------- 03 voice ---------- */

function voicePanel(items, site) {
  const cards = items.map((v) => {
    const href = safeURL(v.url || '');
    return `<figure class="voice">
      <blockquote class="quote">${escapeHTML(v.quote || v.title || '')}</blockquote>
      <figcaption class="from">
        <span class="who">${escapeHTML(v.who || '')}</span>
        ${href ? `<a class="src" href="${href}" target="_blank" rel="noopener">${escapeHTML(hostLabel(v.url))} →</a>` : ''}
      </figcaption>
    </figure>`;
  }).join('');

  const form = safeURL(site.fanFormUrl || '');
  const cta = form ? `<div class="voice-cta">
      <h3>あなたの声も</h3>
      <p>聴いてくれた感想、待ってます。</p>
      <a href="${form}" target="_blank" rel="noopener">メッセージを送る →</a>
    </div>` : '';

  if (!cards && !cta) return `<div class="empty reveal">感想を掲載予定です。</div>`;
  return `<div class="hlist reveal">${cards}${cta}</div>`;
}

/* ---------- 04 picks (affiliate) ---------- */

function picksPanel(items, site) {
  const cfg = site.affiliate || {};
  const cards = items.map((p) => {
    const href = safeURL(affiliate(p.url || '', cfg));
    return `<a class="pick" href="${href}" target="_blank" rel="sponsored noopener">
      ${p.thumb ? `<div class="shot"><img src="${escapeHTML(p.thumb)}" alt="" loading="lazy"></div>` : ''}
      <h3>${escapeHTML(p.title || '')}</h3>
      ${p.why ? `<p class="why">${escapeHTML(p.why)}</p>` : ''}
      <span class="buy">${escapeHTML(hostLabel(p.url))} で見る →</span>
    </a>`;
  }).join('');

  const note = hasAffiliate(items, cfg)
    ? `<p class="disclosure">※ ${escapeHTML(cfg.disclosure || 'アフィリエイトリンクを含みます。')}</p>` : '';
  return `<div class="reveal"><p class="lede">制作で実際に使っている機材とツール。</p>
    <div class="hlist" style="margin-top:22px">${cards}</div>${note}</div>`;
}

/* ---------- 05 about ---------- */

function aboutPanel(site) {
  const paras = (site.about || []).map((p) => `<p>${escapeHTML(p)}</p>`).join('');
  const services = (site.services || []).map((s) => `<li>${escapeHTML(s)}</li>`).join('');
  const clients = (site.clients || []).map((c) => `<li>${escapeHTML(c)}</li>`).join('');
  return `<div class="about-grid reveal">
    <div class="about-body">${paras}</div>
    ${services ? `<div class="about-side"><h4>WORK</h4><ul>${services}</ul></div>` : ''}
    ${clients ? `<div class="about-side"><h4>ARTISTS</h4><ul>${clients}</ul></div>` : ''}
  </div>`;
}

/* ---------- 06 contact ---------- */

function contactPanel(site) {
  const mail = site.email ? safeURL('mailto:' + site.email) : '';
  const links = (site.links || [])
    .filter((l) => safeURL(l.url))
    .map((l) => `<a href="${safeURL(l.url)}" target="_blank" rel="noopener">${escapeHTML(l.label)} →</a>`)
    .join('');
  return `<div class="reveal">
    <h2>楽曲制作の<br>ご依頼はこちらから。</h2>
    ${mail ? `<a class="mail" href="${mail}">${escapeHTML(site.email)}</a>` : ''}
    <div class="socials">${links}</div>
    <p class="colophon">© ${new Date().getFullYear()} ${escapeHTML(site.name || 'JUGEM')}　—　
      <a href="admin/">UPDATE</a></p>
  </div>`;
}

/* ============================================================
   Horizontal navigation: wheel, drag, keys, index, progress
   ============================================================ */

function wireNavigation() {
  const panels = [...track.querySelectorAll('.panel')];
  const buttons = [...indexNav.querySelectorAll('button')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* vertical wheel / trackpad → horizontal travel */
  track.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;                              // let the browser zoom
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!delta) return;
    e.preventDefault();
    track.scrollLeft += delta;
  }, { passive: false });

  /* click-and-drag, and touch is handled natively by overflow-x */
  let dragging = false, startX = 0, startScroll = 0, moved = 0;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    dragging = true; moved = 0;
    startX = e.clientX; startScroll = track.scrollLeft;
    track.classList.add('dragging');
  });
  track.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    track.scrollLeft = startScroll - dx;
    if (moved > 6) track.setPointerCapture(e.pointerId);
  });
  const endDrag = () => { dragging = false; track.classList.remove('dragging'); };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  /* a drag should not follow the link underneath it */
  track.addEventListener('click', (e) => { if (moved > 6) { e.preventDefault(); moved = 0; } }, true);

  /* keyboard */
  track.addEventListener('keydown', (e) => {
    const step = track.clientWidth * 0.8;
    const map = {
      ArrowRight: () => scrollTo(track.scrollLeft + step),
      ArrowLeft: () => scrollTo(track.scrollLeft - step),
      PageDown: () => goto(current() + 1),
      PageUp: () => goto(current() - 1),
      Home: () => goto(0),
      End: () => goto(panels.length - 1),
      ' ': () => goto(current() + 1),
    };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  });

  indexNav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-goto]');
    if (b) goto(buttons.indexOf(b));
  });

  function scrollTo(left) {
    track.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
  }
  function goto(i) {
    const p = panels[Math.max(0, Math.min(panels.length - 1, i))];
    if (p) scrollTo(p.offsetLeft);
  }
  function current() {
    const x = track.scrollLeft + track.clientWidth * 0.35;
    let idx = 0;
    panels.forEach((p, i) => { if (p.offsetLeft <= x) idx = i; });
    return idx;
  }

  /* progress bar + active index + reveal */
  /* threshold must stay 0: a wide panel (WORKS is many screens across) never
     reaches a fractional threshold on a narrow viewport, and would never reveal. */
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add('seen'); }),
    { root: track, threshold: 0 },
  );
  panels.forEach((p) => io.observe(p));

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = track.scrollWidth - track.clientWidth;
      progressBar.style.width = `${max > 0 ? (track.scrollLeft / max) * 100 : 0}%`;
      const c = current();
      buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === c)));
      hint.classList.toggle('gone', track.scrollLeft > 80);
      ticking = false;
    });
  };
  track.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* deep link: index.html#works */
  const target = buttons.findIndex((b) => `p-${b.dataset.goto}` === `p-${location.hash.slice(1)}`);
  if (target > 0) goto(target);

  track.focus({ preventScroll: true });
}

/* ============================================================
   Analytics — one setting in data/site.json turns this on
   ============================================================ */

function installAnalytics(cfg = {}) {
  const { provider, id } = cfg;
  if (!provider || !id) return;
  const s = document.createElement('script');
  s.defer = true;

  if (provider === 'cloudflare') {
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: id }));
  } else if (provider === 'plausible') {
    s.src = 'https://plausible.io/js/script.js';
    s.setAttribute('data-domain', id);
  } else if (provider === 'umami') {
    s.src = 'https://cloud.umami.is/script.js';
    s.setAttribute('data-website-id', id);
  } else if (provider === 'ga4') {
    const g = document.createElement('script');
    g.async = true;
    g.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
    return;
  } else {
    return;
  }
  document.head.appendChild(s);
}
