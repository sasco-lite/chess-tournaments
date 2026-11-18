(function () {
  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderIcons(root) {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
      lucide.createIcons({ root: root || document });
    }
  }

  function toast(message, type = 'info') {
    let stack = document.getElementById('toastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toastStack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    const iconName =
      type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-octagon' : 'info';
    const iconColor =
      type === 'success'
        ? 'var(--accent-lime-text)'
        : type === 'error'
        ? 'var(--status-danger)'
        : 'var(--accent-sky)';

    item.innerHTML = `
      <i data-lucide="${iconName}" style="width:18px;height:18px;color:${iconColor};flex-shrink:0;"></i>
      <span>${escapeHtml(message)}</span>
    `;
    stack.appendChild(item);
    renderIcons(item);

    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(6px)';
      item.style.transition = 'opacity 180ms ease, transform 180ms ease';
      setTimeout(() => item.remove(), 200);
    }, 3600);
  }

  function formatDate(isoStr) {
    if (!isoStr) return 'TBD';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return 'TBD';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function statusMeta(status) {
    const map = {
      Open: { cls: 'status-open', icon: 'door-open', label: 'Open' },
      Live: { cls: 'status-live', icon: 'radio', label: 'Live' },
      Completed: { cls: 'status-completed', icon: 'trophy', label: 'Completed' },
      Closed: { cls: 'status-closed', icon: 'lock', label: 'Closed' },
      Draft: { cls: 'status-draft', icon: 'file-edit', label: 'Draft' },
      Confirmed: { cls: 'status-confirmed', icon: 'check-circle-2', label: 'Confirmed' },
      Waitlisted: { cls: 'status-waitlisted', icon: 'clock', label: 'Waitlisted' },
      Pending: { cls: 'status-pending', icon: 'hourglass', label: 'Pending' },
      Rejected: { cls: 'status-rejected', icon: 'x-circle', label: 'Rejected' },
      Withdrawn: { cls: 'status-closed', icon: 'minus-circle', label: 'Withdrawn' }
    };
    return map[status] || { cls: 'muted', icon: 'circle', label: status || 'Unknown' };
  }

  function renderStatusBadge(status) {
    const m = statusMeta(status);
    return `<span class="status-inline ${m.cls}"><i data-lucide="${m.icon}" style="width:15px;height:15px;"></i><span>${escapeHtml(m.label)}</span></span>`;
  }

  let memoryAdminToken = null;

  function getAdminToken() {
    if (memoryAdminToken) return memoryAdminToken;
    try {
      return window.sessionStorage.getItem('ga_admin_token') || null;
    } catch {
      return null;
    }
  }

  function setAdminToken(token) {
    memoryAdminToken = token || null;
    try {
      if (token) {
        window.sessionStorage.setItem('ga_admin_token', token);
      } else {
        window.sessionStorage.removeItem('ga_admin_token');
      }
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }

  async function apiJson(url, options = {}) {
    const token = url.startsWith('/api/admin') ? getAdminToken() : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && url.startsWith('/api/admin') && !url.endsWith('/login')) {
        setAdminToken(null);
      }
      throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }
    return data;
  }

  function getTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    try {
      const saved = localStorage.getItem('ga_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage failure
    }
    return 'dark';
  }

  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('ga_theme', next);
    } catch {
      // Ignore storage failure
    }
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      const isLight = next === 'light';
      btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
      btn.setAttribute('title', isLight ? 'Switch to dark theme' : 'Switch to light theme');
      btn.innerHTML = `<i data-lucide="${isLight ? 'moon' : 'sun'}" style="width:17px;height:17px;"></i>`;
      renderIcons(btn);
    }
  }

  function initThemeToggle() {
    applyTheme(getTheme());
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = getTheme() === 'light' ? 'dark' : 'light';
      applyTheme(next);
    });
  }

  function initMobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const drawer = document.getElementById('mobileDrawer');
    if (!btn || !drawer) return;
    btn.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  window.ArenaUI = {
    escapeHtml,
    renderIcons,
    toast,
    formatDate,
    statusMeta,
    renderStatusBadge,
    getAdminToken,
    setAdminToken,
    getTheme,
    applyTheme,
    apiJson,
    initMobileMenu
  };

  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initMobileMenu();
    renderIcons();
  });
})();
