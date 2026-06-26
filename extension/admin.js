'use strict';

const DEFAULT_SERVER = 'http://localhost:3001';
let serverUrl = DEFAULT_SERVER;
let allEmails = [];
let refreshTimer;

chrome.storage.sync.get(['serverUrl'], ({ serverUrl: url }) => {
  serverUrl = url || DEFAULT_SERVER;
  load();
});

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function fetchStatuses(emails) {
  const pending = emails.filter(e => e.status !== 'opened').map(e => e.id);
  if (!pending.length) return emails;
  try {
    const res = await fetch(`${serverUrl}/status/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: pending }),
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { results } = await res.json();
    let updated = false;
    results.forEach(r => {
      const email = emails.find(e => e.id === r.id);
      if (email && r.opened && r.firstOpenedAt > email.sentAt + 15000) {
        email.status = 'opened';
        email.openedAt = r.firstOpenedAt;
        email.openCount = r.openCount;
        updated = true;
      }
    });
    if (updated) chrome.storage.local.set({ trackedEmails: emails });
  } catch (_) {}
  return emails;
}

function updateStats(emails) {
  const total = emails.length;
  const opened = emails.filter(e => e.status === 'opened').length;
  const rate = total ? Math.round((opened / total) * 100) : 0;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-opened').textContent = opened;
  document.getElementById('stat-rate').textContent = `${rate}%`;
  document.getElementById('stat-pending').textContent = total - opened;
  document.getElementById('rate-fill').style.width = `${rate}%`;
}

function getFiltered() {
  const query = document.getElementById('search').value.toLowerCase();
  const filter = document.getElementById('filter').value;
  return allEmails.filter(e => {
    const matchFilter = filter === 'all' || e.status === filter;
    const matchSearch = !query ||
      e.subject.toLowerCase().includes(query) ||
      e.to.toLowerCase().includes(query);
    return matchFilter && matchSearch;
  });
}

function renderTable() {
  const filtered = getFiltered();
  const tbody = document.getElementById('table-body');
  document.getElementById('results-count').textContent =
    `${filtered.length} of ${allEmails.length} email${allEmails.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty">
        <div class="empty-icon">${allEmails.length ? '🔍' : '📭'}</div>
        <p>${allEmails.length ? 'No emails match your filter.' : 'No tracked emails yet.'}</p>
        <small>${allEmails.length ? '' : 'Send an email from Gmail to start tracking.'}</small>
      </div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    const isOpened = e.status === 'opened';
    const badge = isOpened
      ? `<span class="badge opened">👁 Opened</span>`
      : `<span class="badge sent">📤 Sent</span>`;
    const countEl = e.openCount > 0
      ? `<span class="open-count ${e.openCount > 1 ? 'multi' : ''}">${e.openCount}</span>`
      : `<span class="open-count">0</span>`;
    return `<tr>
      <td><div class="td-subject" title="${esc(e.subject)}">${esc(e.subject)}</div></td>
      <td><div class="td-to" title="${esc(e.to)}">${esc(e.to)}</div></td>
      <td>${badge}</td>
      <td>${countEl}</td>
      <td class="td-time" title="${formatDate(e.sentAt)}">${timeAgo(e.sentAt)}</td>
      <td class="td-time">${isOpened ? `<span title="${formatDate(e.openedAt)}">${timeAgo(e.openedAt)}</span>` : '—'}</td>
    </tr>`;
  }).join('');
}

async function load() {
  chrome.storage.local.get(['trackedEmails'], async ({ trackedEmails = [] }) => {
    allEmails = await fetchStatuses(trackedEmails);
    updateStats(allEmails);
    renderTable();
    const now = new Date();
    document.getElementById('last-refresh').textContent =
      `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  });
}

// Auto-refresh every 30s
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { load(); scheduleRefresh(); }, 30000);
}
scheduleRefresh();

document.getElementById('refresh-btn').addEventListener('click', () => {
  load();
  scheduleRefresh();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (!confirm('Clear all tracked emails? This cannot be undone.')) return;
  chrome.storage.local.set({ trackedEmails: [] }, () => {
    allEmails = [];
    updateStats([]);
    renderTable();
  });
});

document.getElementById('search').addEventListener('input', renderTable);
document.getElementById('filter').addEventListener('change', renderTable);
