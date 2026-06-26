(function () {
  'use strict';

  const DEFAULT_SERVER = 'http://localhost:3001';
  let serverUrl = DEFAULT_SERVER;
  let scanTimer;

  try {
    chrome.storage.sync.get(['serverUrl'], ({ serverUrl: url }) => {
      serverUrl = url || DEFAULT_SERVER;
    });
  } catch (e) { /* context invalidated on hot reload */ }

  function generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // Find the editable message body inside a compose root
  function findBody(root) {
    const selectors = [
      'div[aria-label="Message Body"]',
      'div[g_editable="true"]',
      'div.Am.Al.editable',
      'div.LW-avf[contenteditable="true"]'
    ];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    // Fallback: largest contenteditable in compose area
    for (const el of root.querySelectorAll('div[contenteditable="true"]')) {
      if (el.getAttribute('aria-multiline') === 'true' || el.getAttribute('aria-label')) return el;
    }
    return null;
  }

  function getRoot(btn) {
    return btn.closest('[role="dialog"]') || btn.closest('.AD') || document;
  }

  function getSubject(root) {
    const el = root.querySelector('input[name="subjectbox"], [placeholder="Subject"]');
    return el?.value?.trim() || '(No subject)';
  }

  function getRecipients(root) {
    const emails = new Set();
    root.querySelectorAll('[data-hovercard-id], span[email]').forEach(el => {
      const val = el.getAttribute('email') || el.getAttribute('data-hovercard-id') || '';
      if (val.includes('@')) emails.add(val);
    });
    return emails.size ? [...emails].join(', ') : 'Unknown';
  }

  function injectPixel(body, id) {
    body.querySelector('[data-tracker-id]')?.remove();
    const img = document.createElement('img');
    img.src = `${serverUrl}/pixel/${id}`;
    img.setAttribute('data-tracker-id', id);
    img.setAttribute('width', '1');
    img.setAttribute('height', '1');
    img.setAttribute('border', '0');
    img.setAttribute('alt', '');
    img.style.cssText = 'width:1px!important;height:1px!important;border:0;display:block;';
    body.appendChild(img);
  }

  function saveEmail(id, subject, to) {
    try {
      chrome.storage.local.get(['trackedEmails'], ({ trackedEmails = [] }) => {
        trackedEmails.unshift({ id, subject, to, sentAt: Date.now(), status: 'sent', openedAt: null, openCount: 0 });
        chrome.storage.local.set({ trackedEmails: trackedEmails.slice(0, 200) });
      });
    } catch (e) { /* context invalidated */ }
  }

  function hookSendButton(btn) {
    if (btn._tracked) return;
    btn._tracked = true;

    // Tracking badge
    const badge = document.createElement('span');
    badge.dataset.trackerBadge = '1';
    badge.textContent = '✦ Tracking';
    if (!btn.parentElement?.querySelector('[data-tracker-badge]')) {
      btn.insertAdjacentElement('afterend', badge);
    }

    btn.addEventListener('click', () => {
      const root = getRoot(btn);
      const body = findBody(root);
      if (!body) return;

      const id = generateId();
      injectPixel(body, id);
      saveEmail(id, getSubject(root), getRecipients(root));
    }, { capture: true });
  }

  function scan() {
    document.querySelectorAll('[data-tooltip^="Send"], [aria-label^="Send "], .T-I.T-I-KE.L3').forEach(btn => {
      if (btn.offsetParent !== null) hookSendButton(btn);
    });
  }

  // --- Sent list badges ---
  let badgeTimer;

  function isInSentView() {
    const hash = window.location.hash;
    return hash.startsWith('#sent') || hash.startsWith('#label/SENT') || hash.startsWith('#label/sent');
  }

  function renderBadges(trackedEmails) {
    const bySubject = new Map(trackedEmails.map(e => [e.subject.toLowerCase().trim(), e]));
    document.querySelectorAll('tr.zA:not([data-gt-badge])').forEach(row => {
      const bogEl = row.querySelector('.bog');
      if (!bogEl) return;
      const subjectSpan = bogEl.querySelector('span');
      if (!subjectSpan) return;
      const subject = subjectSpan.textContent.trim().toLowerCase();
      const email = bySubject.get(subject);
      if (!email) return;
      row.setAttribute('data-gt-badge', '1');
      const badge = document.createElement('span');
      badge.className = `gt-list-badge ${email.status}`;
      badge.textContent = email.status === 'opened'
        ? `👁${email.openCount > 1 ? ' ×' + email.openCount : ''}`
        : '📤';
      badge.title = email.status === 'opened'
        ? `Opened${email.openCount > 1 ? ' ×' + email.openCount : ''}`
        : 'Not opened yet';
      bogEl.insertBefore(badge, subjectSpan);
    });
  }

  function refreshBadgesFromServer(trackedEmails) {
    const pending = trackedEmails.filter(e => e.status !== 'opened').map(e => e.id);
    if (!pending.length) return;
    fetch(`${serverUrl}/status/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: pending }),
      signal: AbortSignal.timeout(5000)
    }).then(r => r.json()).then(({ results }) => {
      let updated = false;
      results.forEach(r => {
        const email = trackedEmails.find(e => e.id === r.id);
        if (email && r.opened && r.firstOpenedAt > email.sentAt + 15000) {
          email.status = 'opened';
          email.openedAt = r.firstOpenedAt;
          email.openCount = r.openCount;
          updated = true;
        }
      });
      if (!updated) return;
      try { chrome.storage.local.set({ trackedEmails }); } catch (e) { return; }
      // Re-render updated rows
      document.querySelectorAll('tr.zA[data-gt-badge]').forEach(row => {
        row.removeAttribute('data-gt-badge');
        row.querySelector('.gt-list-badge')?.remove();
      });
      renderBadges(trackedEmails);
    }).catch(() => {});
  }

  function injectListBadges() {
    if (!isInSentView()) return;
    try {
      chrome.storage.local.get(['trackedEmails'], ({ trackedEmails = [] }) => {
        if (!trackedEmails.length) return;
        renderBadges(trackedEmails);
        refreshBadgesFromServer(trackedEmails);
      });
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) observer.disconnect();
    }
  }

  function safeChrome(fn) {
    try { fn(); } catch (e) {
      if (e.message?.includes('Extension context invalidated')) observer.disconnect();
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => safeChrome(scan), 300);
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(injectListBadges, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', () => setTimeout(injectListBadges, 800));

  // Retry a few times as Gmail loads
  setTimeout(scan, 1500);
  setTimeout(scan, 4000);
  setTimeout(injectListBadges, 2000);
  setTimeout(injectListBadges, 5000);
})();
