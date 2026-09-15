/* App 壳层：路由 / Toast / Modal / SW */
const App = {
  route: 'todo',
  main: null,

  titles: {
    todo: '待办',
    fitness: '运动',
    finance: '账本',
    settings: '设置'
  },

  async init() {
    this.main = document.getElementById('main');
    await DB.openDB();
    this.wrapDBWrites();

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => this.navigate(tab.dataset.route));
    });

    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.navigate('settings'));

    window.addEventListener('hashchange', () => this.readHash());
    this.readHash();
    this.registerSW();
  },

  /* 存储失败统一 Toast，避免静默失败（规格 S2 错误行为） */
  wrapDBWrites() {
    ['put', 'putMany', 'del', 'clearStore', 'wipeAll'].forEach((name) => {
      const orig = DB[name].bind(DB);
      DB[name] = async (...args) => {
        try {
          return await orig(...args);
        } catch (e) {
          console.error(e);
          this.toast('保存失败');
          throw e;
        }
      };
    });
  },

  readHash() {
    const h = (location.hash || '#/todo').replace(/^#\/?/, '') || 'todo';
    const route = ['todo', 'fitness', 'finance', 'settings'].includes(h) ? h : 'todo';
    this.navigate(route, true);
  },

  navigate(route, skipHash) {
    this.route = route;
    if (!skipHash) {
      const next = `#/${route}`;
      if (location.hash !== next) {
        history.replaceState(null, '', next);
      }
    }
    document.getElementById('page-title').textContent = this.titles[route] || '工作台';
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.route === route);
    });
    this.render();
  },

  async render() {
    if (!this.main) return;
    try {
      if (this.route === 'todo') await TodoModule.render(this.main);
      else if (this.route === 'fitness') await FitnessModule.render(this.main);
      else if (this.route === 'finance') await FinanceModule.render(this.main);
      else if (this.route === 'settings') await SettingsModule.render(this.main);
    } catch (e) {
      console.error(e);
      this.main.innerHTML = `<div class="empty">加载失败，请刷新重试</div>`;
    }
  },

  toast(msg, ms = 1800) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  },

  openModal(html, onReady) {
    this.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.closeModal();
    });
    backdrop.querySelectorAll('[data-close]').forEach((b) => {
      b.addEventListener('click', () => this.closeModal());
    });
    const modal = backdrop.querySelector('.modal');
    if (onReady) onReady(modal);
  },

  closeModal() {
    const el = document.getElementById('modal-backdrop');
    if (el) el.remove();
  },

  registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // file:// 或非安全上下文不注册
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW register failed', err);
    });
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
