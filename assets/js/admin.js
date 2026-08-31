/* JUGEM — owner-only editor.
   Paste a link → it is read, filed, and previewed → press 公開する to commit. */

import {
  loadJSON, resolveLink, splitTitle, guessKind, youtubeId,
  escapeHTML, uid, todayISO, hostLabel, safeURL,
} from './lib.js';
import * as gh from './github.js';

const KINDS = ['news', 'works', 'voices', 'picks'];
const REPO_PATH = { site: 'data/site.json', news: 'data/news.json', works: 'data/works.json',
                    voices: 'data/voices.json', picks: 'data/picks.json' };
const DRAFT_KEY = 'jugem.draft';

const LABEL = { news: '最新情報', works: '実績', voices: 'ファンの声', picks: '愛用品', site: 'プロフィール' };

const $ = (id) => document.getElementById(id);
const state = { site: {}, news: [], works: [], voices: [], picks: [] };
const dirty = new Set();
let activeTab = 'news';

boot();

/* ============================================================
   Boot
   ============================================================ */

async function boot() {
  const [site, news, works, voices, picks] = await Promise.all(
    Object.values(REPO_PATH).map((p) => loadJSON('../' + p, { bust: true }).catch(() => null)),
  );
  state.site = site || {};
  state.news = (news && news.items) || [];
  state.works = (works && works.items) || [];
  state.voices = (voices && voices.items) || [];
  state.picks = (picks && picks.items) || [];

  restoreDraft();
  wire();
  showTab(gh.isConnected() ? 'news' : 'setup');
  renderAll();
}

/* ============================================================
   Draft persistence — a refresh never loses unpublished edits
   ============================================================ */

function saveDraft() {
  if (!dirty.size) { localStorage.removeItem(DRAFT_KEY); return; }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ dirty: [...dirty], state }));
  } catch { /* quota — the in-memory state is still correct */ }
}

function restoreDraft() {
  let d;
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return; }
  if (!d || !d.dirty || !d.dirty.length) return;
  for (const k of d.dirty) {
    if (d.state && d.state[k] !== undefined) { state[k] = d.state[k]; dirty.add(k); }
  }
}

function touch(key) {
  dirty.add(key);
  saveDraft();
  renderSaveBar();
}

/* ============================================================
   Wiring
   ============================================================ */

function wire() {
  $('pasteBtn').addEventListener('click', onPaste);
  $('pasteInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') onPaste(); });
  // pasting with the mouse should feel like it "just worked"
  $('pasteInput').addEventListener('paste', () => setTimeout(onPaste, 60));

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  $('tabSetup').addEventListener('click', () => showTab('setup'));

  $('publishBtn').addEventListener('click', publish);
  $('discardBtn').addEventListener('click', () => {
    if (!confirm('未公開の変更をすべて取り消します。よろしいですか？')) return;
    localStorage.removeItem(DRAFT_KEY);
    location.reload();
  });

  addEventListener('beforeunload', (e) => {
    if (dirty.size) { e.preventDefault(); e.returnValue = ''; }
  });
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.pane').forEach((p) => p.classList.add('hide'));
  const pane = $('pane-' + tab);
  if (pane) pane.classList.remove('hide');
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  renderPane(tab);
}

function renderAll() {
  KINDS.forEach((k) => { const el = document.querySelector(`[data-count="${k}"]`); if (el) el.textContent = state[k].length; });
  renderPane(activeTab);
  renderSaveBar();
}

function renderPane(tab) {
  if (KINDS.includes(tab)) renderList(tab);
  else if (tab === 'access') renderAccess();
  else if (tab === 'settings') renderSettings();
  else if (tab === 'setup') renderSetup();
}

/* ============================================================
   Paste → resolve → file
   ============================================================ */

async function onPaste() {
  const input = $('pasteInput');
  const status = $('pasteStatus');
  const url = input.value.trim();
  if (!url) return;
  if (!safeURL(url)) { setStatus('リンクの形式が正しくないようです。', true); return; }

  setStatus('読み取り中…');
  $('pasteBtn').disabled = true;
  try {
    const info = await resolveLink(url);
    const kind = guessKind(url);
    const item = buildItem(kind, url, info);
    state[kind].unshift(item);
    touch(kind);
    input.value = '';
    setStatus(`「${item.title || item.quote || 'リンク'}」を${LABEL[kind]}に追加しました。下で内容を直せます。`);
    showTab(kind);
    renderAll();
    requestAnimationFrame(() => {
      const first = document.querySelector(`#pane-${kind} .row-item`);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  } catch (err) {
    setStatus('読み取れませんでした：' + err.message, true);
  } finally {
    $('pasteBtn').disabled = false;
  }

  function setStatus(msg, isErr = false) {
    status.textContent = msg;
    status.classList.toggle('err', isErr);
  }
}

function buildItem(kind, url, info) {
  const now = new Date().toISOString();
  if (kind === 'works') {
    const { title, artist } = splitTitle(info.title, info.author);
    const vid = info.videoId || youtubeId(url);
    return {
      id: uid('w'), title, artist: artist || info.author || '', role: '', year: '', note: '', views: '',
      url, videoId: vid, thumb: info.thumb || (vid ? `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg` : ''),
      listenUrl: '', pinned: false, addedAt: now,
    };
  }
  if (kind === 'voices') {
    return { id: uid('v'), quote: info.title || '', who: info.author || '', url, addedAt: now };
  }
  if (kind === 'picks') {
    return { id: uid('p'), title: info.title || '', why: '', url, thumb: info.thumb || '', addedAt: now };
  }
  return { id: uid('n'), date: todayISO(), title: info.title || '', body: '', url, addedAt: now };
}

/* ============================================================
   Item lists
   ============================================================ */

function renderList(kind) {
  const pane = $('pane-' + kind);
  const items = state[kind];
  if (!items.length) {
    pane.innerHTML = `<div class="empty-note">まだ${LABEL[kind]}はありません。<br>上のボックスにリンクを貼ると、ここに追加されます。</div>`;
    return;
  }
  pane.innerHTML = `<div class="rows">${items.map((it, i) => rowHTML(kind, it, i)).join('')}</div>`;

  pane.querySelectorAll('[data-field]').forEach((el) => {
    el.addEventListener('input', () => {
      const { idx, field } = el.dataset;
      const item = state[kind][Number(idx)];
      item[field] = el.type === 'checkbox' ? el.checked : el.value;
      touch(kind);
    });
  });
  pane.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      const arr = state[kind];
      if (btn.dataset.act === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      if (btn.dataset.act === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      if (btn.dataset.act === 'del') {
        if (!confirm('この項目を削除しますか？')) return;
        arr.splice(i, 1);
      }
      touch(kind);
      renderAll();
    });
  });
}

function rowHTML(kind, it, i) {
  const acts = `<div class="acts">
      <button class="btn ghost" data-act="up" data-idx="${i}" title="上へ" aria-label="上へ">↑</button>
      <button class="btn ghost" data-act="down" data-idx="${i}" title="下へ" aria-label="下へ">↓</button>
      <button class="btn ghost" data-act="del" data-idx="${i}" title="削除" aria-label="削除">✕</button>
    </div>`;
  const f = (label, field, value, type = 'text') =>
    `<div class="f"><label>${label}</label><input type="${type}" data-field="${field}" data-idx="${i}"
      value="${escapeHTML(value ?? '')}"></div>`;
  const area = (label, field, value) =>
    `<div class="f"><label>${label}</label><textarea data-field="${field}" data-idx="${i}">${escapeHTML(value ?? '')}</textarea></div>`;

  let thumb = '', fields = '';
  if (kind === 'works') {
    thumb = `<img class="thumb" src="${escapeHTML(it.thumb || '')}" alt="" loading="lazy">`;
    fields = f('曲名', 'title', it.title) + f('アーティスト', 'artist', it.artist)
      + f('クレジット', 'role', it.role) + f('補足', 'note', it.note) + f('再生数', 'views', it.views)
      + `<div class="f"><label>ピン</label>
           <span class="pinbox"><input type="checkbox" data-field="pinned" data-idx="${i}" ${it.pinned ? 'checked' : ''}> トップに大きく出す</span>
         </div>`;
  } else if (kind === 'news') {
    fields = f('日付', 'date', it.date, 'date') + f('見出し', 'title', it.title) + area('本文', 'body', it.body)
      + f('リンク', 'url', it.url, 'url');
  } else if (kind === 'voices') {
    fields = area('コメント', 'quote', it.quote) + f('お名前', 'who', it.who) + f('リンク', 'url', it.url, 'url');
  } else {
    thumb = it.thumb ? `<img class="thumb square" src="${escapeHTML(it.thumb)}" alt="" loading="lazy">` : '';
    fields = f('商品名', 'title', it.title) + area('ひとこと', 'why', it.why) + f('リンク', 'url', it.url, 'url');
  }

  const src = it.url ? `<div class="f"><label></label><a href="${safeURL(it.url)}" target="_blank" rel="noopener"
      style="font-size:11px">${escapeHTML(hostLabel(it.url))} で開く ↗</a></div>` : '';

  return `<article class="row-item">${thumb}<div class="fields">${fields}${src}</div>${acts}</article>`;
}

/* ============================================================
   Access (analytics)
   ============================================================ */

function renderAccess() {
  const a = state.site.analytics || (state.site.analytics = { provider: '', id: '', dashboardUrl: '' });
  const dash = safeURL(a.dashboardUrl || '');
  $('pane-access').innerHTML = `
    <div class="card">
      <h2>どれくらい見られているか</h2>
      <p class="desc">計測サービスを1つ選んでIDを入れるだけで、公開サイトに自動で組み込まれます。おすすめは無料・無制限・Cookie不要の Cloudflare Web Analytics です。</p>
      <div class="grid2">
        <div class="f"><label>サービス</label>
          <select data-site="analytics.provider">
            ${['', 'cloudflare', 'plausible', 'umami', 'ga4'].map((p) =>
              `<option value="${p}" ${a.provider === p ? 'selected' : ''}>${p || '（使わない）'}</option>`).join('')}
          </select>
        </div>
        <div class="f"><label>ID / トークン</label>
          <input type="text" data-site="analytics.id" value="${escapeHTML(a.id || '')}" placeholder="例: 発行されたトークン"></div>
      </div>
      <div class="f" style="margin-top:10px"><label>ダッシュボードURL</label>
        <input type="url" data-site="analytics.dashboardUrl" value="${escapeHTML(a.dashboardUrl || '')}"
               placeholder="共有ダッシュボードのURLを入れるとこの下に表示されます"></div>
    </div>
    ${dash
      ? `<div class="frame-wrap"><iframe src="${dash}" title="アクセス解析" loading="lazy"
           sandbox="allow-scripts allow-same-origin allow-popups"></iframe></div>`
      : `<div class="empty-note">ダッシュボードURLを入れると、ここに数字がそのまま表示されます。<br>
           （Cloudflare / Plausible / Umami は共有リンクを発行できます）</div>`}`;
  bindSiteFields('pane-access');
}

/* ============================================================
   Profile & affiliate settings
   ============================================================ */

function renderSettings() {
  const s = state.site;
  const af = s.affiliate || (s.affiliate = {});
  const fe = s.featured || (s.featured = {});
  $('pane-settings').innerHTML = `
    <div class="card">
      <h2>プロフィール</h2>
      <div class="f"><label>キャッチ</label><input type="text" data-site="catch" value="${escapeHTML(s.catch || '')}"></div>
      <div class="f"><label>メール</label><input type="email" data-site="email" value="${escapeHTML(s.email || '')}"></div>
      <div class="f"><label>紹介文</label><textarea data-site="about[]" style="min-height:130px">${escapeHTML((s.about || []).join('\n\n'))}</textarea></div>
      <p class="desc" style="margin:8px 0 0">空行で区切ると段落が分かれます。</p>
    </div>

    <div class="card">
      <h2>いま一番見せたい作品</h2>
      <p class="desc">トップの次に大きく出ます。ここを差し替えるだけで、サイトの第一印象が変わります。</p>
      <div class="grid2">
        <div class="f"><label>アーティスト</label><input type="text" data-site="featured.artist" value="${escapeHTML(fe.artist || '')}"></div>
        <div class="f"><label>作品名</label><input type="text" data-site="featured.title" value="${escapeHTML(fe.title || '')}"></div>
        <div class="f"><label>情報</label><input type="text" data-site="featured.meta" value="${escapeHTML(fe.meta || '')}"></div>
        <div class="f"><label>画像URL</label><input type="url" data-site="featured.image" value="${escapeHTML(fe.image || '')}"></div>
        <div class="f"><label>数字</label><input type="text" data-site="featured.statNum" value="${escapeHTML(fe.statNum || '')}"></div>
        <div class="f"><label>分母</label><input type="text" data-site="featured.statDen" value="${escapeHTML(fe.statDen || '')}"></div>
      </div>
      <div class="f"><label>数字の説明</label><input type="text" data-site="featured.statLabel" value="${escapeHTML(fe.statLabel || '')}"></div>
      <div class="f"><label>トピック</label><textarea data-site="featured.notes[]">${escapeHTML((fe.notes || []).join('\n'))}</textarea></div>
      <p class="desc" style="margin:8px 0 0">トピックは1行に1つ書いてください。</p>
    </div>

    <div class="card">
      <h2>ファンからのメッセージ窓口</h2>
      <p class="desc">Googleフォームなどの受付URLを入れると、「ファンの声」に投稿ボタンが出ます。</p>
      <div class="f"><label>フォームURL</label><input type="url" data-site="fanFormUrl" value="${escapeHTML(s.fanFormUrl || '')}"></div>
    </div>

    <div class="card">
      <h2>アフィリエイト</h2>
      <p class="desc">IDを入れると「愛用品」のリンクに自動で付与されます。景表法（ステマ規制）対応のため、設定されている間は広告表記が自動で表示されます。</p>
      <div class="grid2">
        <div class="f"><label>Amazon</label><input type="text" data-site="affiliate.amazonTag" value="${escapeHTML(af.amazonTag || '')}" placeholder="◯◯◯-22"></div>
        <div class="f"><label>Apple</label><input type="text" data-site="affiliate.appleToken" value="${escapeHTML(af.appleToken || '')}" placeholder="1000l◯◯◯"></div>
        <div class="f"><label>楽天</label><input type="text" data-site="affiliate.rakutenId" value="${escapeHTML(af.rakutenId || '')}"></div>
        <div class="f"><label>表記</label><input type="text" data-site="affiliate.disclosure" value="${escapeHTML(af.disclosure || '')}"></div>
      </div>
    </div>`;
  bindSiteFields('pane-settings');
}

/** Bind [data-site="a.b"] / [data-site="a[]"] inputs onto state.site. */
function bindSiteFields(paneId) {
  $(paneId).querySelectorAll('[data-site]').forEach((el) => {
    el.addEventListener('input', () => {
      const path = el.dataset.site;
      const isList = path.endsWith('[]');
      const keys = (isList ? path.slice(0, -2) : path).split('.');
      let node = state.site;
      for (const k of keys.slice(0, -1)) node = node[k] || (node[k] = {});
      const last = keys[keys.length - 1];
      if (isList) {
        const sep = last === 'about' ? /\n\s*\n/ : /\n/;
        node[last] = el.value.split(sep).map((t) => t.trim()).filter(Boolean);
      } else {
        node[last] = el.value;
      }
      touch('site');
    });
  });
}

/* ============================================================
   Setup — connect once, then never again on this device
   ============================================================ */

function renderSetup() {
  const c = gh.getConfig() || { owner: '', repo: '', branch: 'main', token: '' };
  const connected = gh.isConnected();
  $('pane-setup').innerHTML = `
    <div class="card">
      <h2><span class="dot ${connected ? 'on' : ''}"></span>${connected ? '接続済み' : 'はじめに1回だけ接続'}</h2>
      <p class="desc">この設定はこの端末のブラウザにだけ保存されます。公開サイトには一切含まれません。</p>
      <ol>
        <li>GitHub の <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained トークン作成ページ</a> を開く</li>
        <li>Repository access でこのサイトのリポジトリだけを選ぶ</li>
        <li>Permissions → Repository permissions → <b>Contents</b> を <b>Read and write</b> にする</li>
        <li>発行されたトークン（<code>github_pat_…</code>）を下に貼り付ける</li>
      </ol>
      <div class="grid2">
        <div class="f"><label>オーナー</label><input type="text" id="cfgOwner" value="${escapeHTML(c.owner)}" placeholder="order-arch"></div>
        <div class="f"><label>リポジトリ</label><input type="text" id="cfgRepo" value="${escapeHTML(c.repo)}" placeholder="ai-agent"></div>
        <div class="f"><label>ブランチ</label><input type="text" id="cfgBranch" value="${escapeHTML(c.branch || 'main')}"></div>
        <div class="f"><label>トークン</label><input type="password" id="cfgToken" value="${escapeHTML(c.token)}" placeholder="github_pat_..." autocomplete="off"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn primary" id="cfgSave" type="button">接続する</button>
        ${connected ? '<button class="btn" id="cfgClear" type="button">この端末から削除</button>' : ''}
      </div>
      <p class="desc" id="cfgMsg" style="margin:14px 0 0"></p>
    </div>

    <div class="card">
      <h2>接続しないで使うこともできます</h2>
      <p class="desc">編集内容はこのブラウザに残ります。書き出したファイルを GitHub の <code>data/</code> にドラッグ&ドロップしても更新できます。</p>
      <button class="btn" id="dlBtn" type="button">変更したファイルを書き出す</button>
    </div>`;

  $('cfgSave').addEventListener('click', async () => {
    const cfg = {
      owner: $('cfgOwner').value.trim(),
      repo: $('cfgRepo').value.trim(),
      branch: $('cfgBranch').value.trim() || 'main',
      token: $('cfgToken').value.trim(),
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) { $('cfgMsg').textContent = 'すべて入力してください。'; return; }
    gh.setConfig(cfg);
    $('cfgMsg').textContent = '確認中…';
    try {
      const name = await gh.verify();
      $('cfgMsg').textContent = `${name} に接続しました。以降この端末では自動で繋がります。`;
      toast('接続しました', 'ok');
      renderSetup();
      renderSaveBar();
    } catch (e) {
      gh.clearConfig();
      $('cfgMsg').textContent = '接続できませんでした：' + e.message;
    }
  });
  const clear = $('cfgClear');
  if (clear) clear.addEventListener('click', () => { gh.clearConfig(); renderSetup(); renderSaveBar(); });
  $('dlBtn').addEventListener('click', downloadChanged);
}

function downloadChanged() {
  const keys = dirty.size ? [...dirty] : ['site', ...KINDS];
  for (const k of keys) {
    const blob = new Blob([JSON.stringify(payload(k), null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = REPO_PATH[k].split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  toast(`${keys.length}件を書き出しました`, 'ok');
}

/* ============================================================
   Publish
   ============================================================ */

function payload(key) {
  if (key === 'site') return state.site;
  return { updatedAt: new Date().toISOString(), items: state[key] };
}

function renderSaveBar() {
  const bar = $('savebar');
  bar.classList.toggle('show', dirty.size > 0);
  $('saveBadge').textContent = String(dirty.size);
  const names = [...dirty].map((k) => LABEL[k] || k).join('・');
  $('saveMsg').innerHTML = dirty.size
    ? `<b>${names}</b> に未公開の変更があります。${gh.isConnected() ? '' : '　※ 先に「接続設定」を済ませてください。'}`
    : '';
  $('publishBtn').disabled = !gh.isConnected();
}

async function publish() {
  if (!dirty.size) return;
  if (!gh.isConnected()) { showTab('setup'); return; }
  const btn = $('publishBtn');
  btn.disabled = true;
  btn.textContent = '公開中…';
  try {
    const files = {};
    for (const k of dirty) files[REPO_PATH[k]] = payload(k);
    await gh.publish(files, `content: update ${[...dirty].join(', ')}`);
    dirty.clear();
    localStorage.removeItem(DRAFT_KEY);
    toast('公開しました。1〜2分でサイトに反映されます。', 'ok');
    renderAll();
  } catch (e) {
    toast('公開できませんでした：' + e.message, 'err');
  } finally {
    btn.textContent = '公開する';
    btn.appendChild(Object.assign(document.createElement('span'), { className: 'badge', id: 'saveBadge' }));
    renderSaveBar();
  }
}

let toastTimer;
function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}
