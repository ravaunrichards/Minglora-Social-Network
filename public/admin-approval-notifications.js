/* Site-wide, owner/MFA-protected approval notifications for Minglora. */
(() => {
  'use strict';
  if (window.__mingloraAdminApprovalNotifications) return;
  window.__mingloraAdminApprovalNotifications = true;

  const REVIEW_URL = '/admin-centre.html?page=approvals';
  const INTERVAL_MS = 30000;
  let inFlight = false;
  let firstSync = true;
  let previousIds = new Set();
  let toastTimer = null;
  let root = null;

  const fetchJson = async path => {
    const response = await fetch('/api' + path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      const error = new Error('Approval notifications are unavailable.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  };

  const pendingFrom = (snapshot, queue) => {
    const approvals = Array.isArray(snapshot?.approvals) ? snapshot.approvals : [];
    const tasks = Array.isArray(queue?.tasks) ? queue.tasks : [];
    return [
      ...approvals.filter(item => item && item.id && item.status === 'pending_human_review')
        .map(item => ({ id: 'ai-action:' + item.id, title: item.actionType || 'AI action approval' })),
      ...tasks.filter(item => item && item.task_id && item.status === 'pending_approval')
        .map(item => ({ id: 'ai-task:' + item.task_id, title: item.task_title || 'AI task approval' }))
    ];
  };

  const mount = () => {
    if (root?.isConnected) return root;
    root = document.createElement('div');
    root.id = 'minglora-admin-approval-alerts';
    root.hidden = true;
    root.setAttribute('aria-live', 'polite');
    root.innerHTML =
      '<section class="minglora-admin-approval-toast" id="minglora-admin-approval-toast" role="alert" hidden>' +
      '<div class="minglora-admin-approval-toast-heading"><strong>Administrator approval required</strong>' +
      '<span class="minglora-admin-approval-toast-count" id="minglora-admin-approval-toast-count">0</span></div>' +
      '<p id="minglora-admin-approval-toast-message">New approval requests are waiting for review.</p>' +
      '<div class="minglora-admin-approval-toast-actions"><a href="' + REVIEW_URL + '">Review and approve</a>' +
      '<button type="button" id="minglora-admin-approval-dismiss">Dismiss</button></div></section>' +
      '<div class="minglora-admin-approval-pill" id="minglora-admin-approval-pill" hidden>' +
      '<strong><span id="minglora-admin-approval-pill-count">0</span> pending admin approvals</strong>' +
      '<a href="' + REVIEW_URL + '">Open Center</a></div>';
    document.body.append(root);
    root.querySelector('#minglora-admin-approval-dismiss')?.addEventListener('click', () => {
      const toast = root.querySelector('#minglora-admin-approval-toast');
      if (toast) toast.hidden = true;
    });
    return root;
  };

  const render = items => {
    const host = mount();
    const toast = host.querySelector('#minglora-admin-approval-toast');
    const pill = host.querySelector('#minglora-admin-approval-pill');
    const count = items.length;
    host.hidden = count === 0;
    toast.hidden = true;
    pill.hidden = count === 0;
    host.querySelector('#minglora-admin-approval-toast-count').textContent = String(count);
    host.querySelector('#minglora-admin-approval-pill-count').textContent = String(count);
    host.querySelector('#minglora-admin-approval-toast-message').textContent =
      count + ' request' + (count === 1 ? '' : 's') + ' need your decision.';

    const ids = new Set(items.map(item => item.id));
    const newlyPending = [...ids].filter(id => !previousIds.has(id));
    const notifyCount = firstSync ? count : newlyPending.length;
    if (notifyCount > 0 && toast) {
      toast.hidden = false;
      host.hidden = false;
      host.querySelector('#minglora-admin-approval-toast-count').textContent = String(notifyCount);
      host.querySelector('#minglora-admin-approval-toast-message').textContent =
        notifyCount + ' new request' + (notifyCount === 1 ? '' : 's') + ' need your decision.';
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { if (toast) toast.hidden = true; }, 15000);
    }
    previousIds = ids;
    firstSync = false;
  };

  const refresh = async () => {
    if (inFlight || document.visibilityState === 'hidden') return;
    inFlight = true;
    try {
      const [snapshot, queue] = await Promise.all([
        fetchJson('/ai-network'),
        fetchJson('/ai-network/tasks')
      ]);
      render(pendingFrom(snapshot, queue));
    } catch (error) {
      // Non-admin sessions receive the existing server-side 401/403 response.
      // Do not expose admin data or show an error to ordinary members.
      if (error?.status === 401 || error?.status === 403) {
        if (root) root.hidden = true;
      }
    } finally {
      inFlight = false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); refresh(); }, { once: true });
  } else {
    mount();
    refresh();
  }
  window.setInterval(refresh, INTERVAL_MS);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
})();
