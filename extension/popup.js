'use strict';

const DEFAULT_SERVER = 'http://localhost:3001';
let serverUrl = DEFAULT_SERVER;

const statusBar = document.getElementById('status-bar');
const emailList = document.getElementById('email-list');

function showStatus(msg, type = '') {
  statusBar.textContent = msg;
  statusBar.className = `status-bar ${type}`;
  if (msg) setTimeout(() => { statusBar.textContent = ''; statusBar.className = 'status-bar'; }, 3000);
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function fetchStatuses(emails) {
  const pending = emails.filter(e => e.status !== 'opened').map(e => e.id);
  if (!pending.length) return emails;
  try {
    const res = await fetch(`${serverUrl}/status/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: pending }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { results } = await res.json();
    let updated = false;
    results.forEach(r => {
      const email = emails.find(e => e.id === r.id);
      if (email && r.opened && r.lastOpenedAt > email.sentAt + 15000) {
        email.status = 'opened';
        email.openedAt = r.firstOpenedAt;
        email.openCount = r.openCount;
        updated = true;
      }
    });
    if (updated) chrome.storage.local.set({ trackedEmails: emails });
  } catch (err) {
    showStatus('⚠ Server unreachable', 'error');
  }
  return emails;
}

function render(emails) {
  if (!emails.length) {
    emailList.innerHTML = `
      <div class="placeholder">
        No tracked emails yet.
        <small>Send an email from Gmail to start.</small>
      </div>`;
    return;
  }

  emailList.innerHTML = emails.map(e => {
    const isOpened = e.status === 'opened';
    const label = isOpened
      ? `👁 Opened${e.openCount > 1 ? ` ×${e.openCount}` : ''}`
      : '📤 Sent';
    const ts = isOpened ? e.openedAt : e.sentAt;
    return `
      <div class="email-item">
        <div class="subject">${esc(e.subject)}</div>
        <div class="to">→ ${esc(e.to)}</div>
        <div class="footer">
          <span class="badge ${e.status}">${label}</span>
          <span class="time">${timeAgo(ts)}</span>
        </div>
      </div>`;
  }).join('');
}

async function loadAndRender() {
  emailList.innerHTML = '<div class="placeholder">Checking…</div>';
  chrome.storage.local.get(['trackedEmails'], async ({ trackedEmails = [] }) => {
    const updated = await fetchStatuses(trackedEmails);
    render(updated);
  });
}

// Init: load server URL then fetch
chrome.storage.sync.get(['serverUrl'], ({ serverUrl: url }) => {
  serverUrl = url || DEFAULT_SERVER;
  document.getElementById('serverUrl').value = serverUrl;
  const warn = document.getElementById('localhost-warn');
  if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
    warn.style.display = 'block';
  }
  loadAndRender();
});

document.getElementById('refresh').addEventListener('click', loadAndRender);

document.getElementById('admin-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

document.getElementById('saveUrl').addEventListener('click', () => {
  const url = document.getElementById('serverUrl').value.trim().replace(/\/$/, '');
  if (!url) return;
  serverUrl = url;
  const warn = document.getElementById('localhost-warn');
  warn.style.display = (url.includes('localhost') || url.includes('127.0.0.1')) ? 'block' : 'none';
  chrome.storage.sync.set({ serverUrl: url }, () => showStatus('✓ Saved'));
});
