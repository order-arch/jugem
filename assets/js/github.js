/* Minimal GitHub Contents API client used by the owner-only admin page.
   The token lives only in this browser's localStorage — it is never part of
   the public site and never sent anywhere except api.github.com. */

const KEY = 'jugem.gh';
const API = 'https://api.github.com';

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function setConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(KEY);
}

export function isConnected() {
  const c = getConfig();
  return !!(c && c.owner && c.repo && c.branch && c.token);
}

async function api(path, { method = 'GET', body } = {}) {
  const cfg = getConfig();
  if (!cfg) throw new Error('未接続です');
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* body may be empty */ }
    throw new Error(`GitHub ${res.status}${detail ? ': ' + detail : ''}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Verify the saved credentials can actually write to the repo. */
export async function verify() {
  const { owner, repo, branch } = getConfig();
  const info = await api(`/repos/${owner}/${repo}`);
  if (!info.permissions || !info.permissions.push) {
    throw new Error('このトークンにはリポジトリへの書き込み権限がありません');
  }
  await api(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
  return info.full_name;
}

function encodeUTF8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function shaOf(path) {
  const { owner, repo, branch } = getConfig();
  try {
    const j = await api(`/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    return j.sha;
  } catch (e) {
    if (String(e.message).includes('404')) return null; // new file
    throw e;
  }
}

/** Commit one JSON file. Returns the commit URL. */
export async function putJSON(path, data, message) {
  const { owner, repo, branch } = getConfig();
  const sha = await shaOf(path);
  const res = await api(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: {
      message,
      content: encodeUTF8(JSON.stringify(data, null, 2) + '\n'),
      branch,
      ...(sha ? { sha } : {}),
    },
  });
  return res.commit && res.commit.html_url;
}

/** Commit several JSON files in sequence, so one failure cannot half-write a file. */
export async function publish(files, message) {
  const urls = [];
  for (const [path, data] of Object.entries(files)) {
    urls.push(await putJSON(path, data, message));
  }
  return urls;
}
