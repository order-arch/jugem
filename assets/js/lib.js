/* JUGEM portfolio — shared helpers (no build step, ES modules). */

export const DATA_FILES = {
  site: 'data/site.json',
  news: 'data/news.json',
  works: 'data/works.json',
  voices: 'data/voices.json',
  picks: 'data/picks.json',
};

/* ---------- fetching ---------- */

export async function loadJSON(path, { bust = false } = {}) {
  const url = bust ? `${path}?t=${Date.now()}` : path;
  const res = await fetch(url, { cache: bust ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/* ---------- link parsing ---------- */

const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];

export function youtubeId(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!YT_HOSTS.includes(u.hostname)) return null;
  if (u.hostname === 'youtu.be') return clean(u.pathname.slice(1));
  if (u.pathname === '/watch') return clean(u.searchParams.get('v') || '');
  const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
  return m ? clean(m[2]) : null;

  function clean(id) { return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null; }
}

/** Guess which section a pasted link belongs to. */
export function guessKind(url) {
  if (youtubeId(url)) return 'works';
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return 'news'; }
  if (/^(x\.com|twitter\.com|instagram\.com|tiktok\.com|threads\.net)$/.test(host)) return 'voices';
  if (/(^|\.)(amazon\.|amzn\.|rakuten\.|apple\.com|soundhouse\.co\.jp)/.test(host)) return 'picks';
  return 'news';
}

export function hostLabel(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const known = {
      'youtu.be': 'YouTube', 'youtube.com': 'YouTube', 'x.com': 'X', 'twitter.com': 'X',
      'instagram.com': 'Instagram', 'tiktok.com': 'TikTok', 'note.com': 'note',
      'open.spotify.com': 'Spotify', 'music.apple.com': 'Apple Music', 'natalie.mu': '音楽ナタリー',
    };
    return known[h] || h;
  } catch { return 'LINK'; }
}

/* ---------- oEmbed lookup ---------- */

/**
 * Resolve a pasted URL into { title, author, thumb, videoId, provider }.
 * Never throws — falls back to a bare record so pasting always works.
 */
export async function resolveLink(url) {
  const base = { title: '', author: '', thumb: '', videoId: null, provider: hostLabel(url) };
  const vid = youtubeId(url);
  if (vid) {
    base.videoId = vid;
    base.thumb = `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`;
  }

  const endpoints = vid
    ? [`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://youtu.be/' + vid)}`,
       `https://noembed.com/embed?url=${encodeURIComponent(url)}`]
    : [`https://noembed.com/embed?url=${encodeURIComponent(url)}`];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      if (!res.ok) continue;
      const j = await res.json();
      if (j.error) continue;
      base.title = j.title || base.title;
      base.author = (j.author_name || '').replace(/\s*(Official|- Topic)\s*$/i, '').trim() || base.author;
      base.thumb = base.thumb || j.thumbnail_url || '';
      return base;
    } catch { /* try the next endpoint */ }
  }
  return base;
}

/**
 * YouTube titles are usually "Artist / Title" or "Title - Artist".
 * Split them so the card shows a clean title and artist.
 */
export function splitTitle(rawTitle, channelAuthor) {
  const t = (rawTitle || '').trim()
    .replace(/\s*[-–|]?\s*(Official\s+)?(Music\s+Video|Lyric\s+Video|MUSIC VIDEO|MV|Official Video|Audio)\s*[-–|]?\s*$/i, '')
    .replace(/\s*[\(\[](Official\s+)?(Music\s+Video|Lyric\s+Video|MV|Audio)[\)\]]\s*$/i, '')
    .trim();

  let m = t.match(/^(.+?)\s*\/\s*(.+)$/);
  if (m) {
    // "Novel Core / DiRTY NASTY" -> artist first when it matches the channel name
    const [, a, b] = m;
    if (channelAuthor && a.toLowerCase().includes(channelAuthor.toLowerCase().slice(0, 6))) {
      return { title: b.trim(), artist: a.trim() };
    }
    return { title: b.trim(), artist: a.trim() };
  }
  m = t.match(/^(.+?)\s+-\s+(.+)$/);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };
  return { title: t, artist: channelAuthor || '' };
}

/* ---------- affiliate ---------- */

/**
 * Append the owner's affiliate parameters to a store link.
 * Unknown hosts and empty settings pass through untouched.
 */
export function affiliate(url, cfg = {}) {
  if (!url) return url;
  let u;
  try { u = new URL(url); } catch { return url; }
  const host = u.hostname.replace(/^www\./, '');

  if (/(^|\.)amazon\./.test(host) && cfg.amazonTag) {
    u.searchParams.set('tag', cfg.amazonTag);
  } else if (host === 'music.apple.com' || host === 'itunes.apple.com') {
    if (cfg.appleToken) u.searchParams.set('at', cfg.appleToken);
  } else if (/(^|\.)rakuten\.co\.jp$/.test(host) && cfg.rakutenId) {
    u.searchParams.set('scid', cfg.rakutenId);
  }
  return u.toString();
}

export function hasAffiliate(items, cfg = {}) {
  if (!cfg.amazonTag && !cfg.appleToken && !cfg.rakutenId) return false;
  return items.some((i) => i.url && affiliate(i.url, cfg) !== i.url);
}

/* ---------- misc ---------- */

export const uid = (p = 'i') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(iso);
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Only allow links we are willing to put in an href. Blank stays blank —
    resolving '' against location would silently link a card back to the page. */
export function safeURL(url) {
  if (!url || !String(url).trim()) return '';
  try {
    const u = new URL(url, location.href);
    return (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') ? u.toString() : '';
  } catch { return ''; }
}
