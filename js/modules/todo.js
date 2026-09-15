/* 待办模块 */
const TodoModule = {
  filter: 'today',

  async render(root) {
    const all = await DB.getAll('todos');
    all.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const p = { high: 0, normal: 1, low: 2 };
      if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    const today = DB.todayStr();
    let shown = all;
    if (this.filter === 'active') shown = all.filter((t) => !t.done);
    else if (this.filter === 'done') shown = all.filter((t) => t.done);
    else if (this.filter === 'today') {
      shown = all.filter((t) => {
        const createdToday = DB.todayStr(new Date(t.createdAt)) === today;
        const completedToday = t.done && t.completedAt && DB.todayStr(new Date(t.completedAt)) === today;
        return !t.done || completedToday || createdToday;
      });
    }

    const remaining = all.filter((t) => !t.done).length;

    root.innerHTML = `
      <div class="quick-add">
        <input class="field" id="todo-input" placeholder="快速记下待办…" maxlength="120" enterkeyhint="go" />
        <button class="btn todo" id="todo-add" type="button">添加</button>
      </div>
      <div class="chips" id="todo-filters">
        ${[['today', '今日'], ['all', '全部'], ['active', '未完成'], ['done', '已完成']]
          .map(([k, label]) => `<button class="chip ${this.filter === k ? 'active' : ''}" data-f="${k}" type="button">${label}</button>`)
          .join('')}
      </div>
      <div class="card">
        <h2>${remaining > 0 ? `还有 ${remaining} 项待办` : '全部搞定'}</h2>
        <div id="todo-list">
          ${shown.length === 0 ? '<div class="empty">暂无待办，先记一条吧</div>' : shown.map((t) => this.itemHTML(t)).join('')}
        </div>
      </div>
    `;

    const input = root.querySelector('#todo-input');
    const add = async () => {
      const title = input.value.trim();
      if (!title) return;
      await DB.put('todos', {
        id: DB.uid(),
        title,
        note: '',
        done: false,
        createdAt: Date.now(),
        completedAt: null,
        priority: 'normal',
        tags: []
      });
      input.value = '';
      App.toast('已添加');
      App.render();
    };
    root.querySelector('#todo-add').addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

    root.querySelectorAll('#todo-filters .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.f;
        App.render();
      });
    });

    root.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const t = await DB.getById('todos', btn.dataset.toggle);
        if (!t) return;
        t.done = !t.done;
        t.completedAt = t.done ? Date.now() : null;
        await DB.put('todos', t);
        App.render();
      });
    });

    root.querySelectorAll('[data-del-todo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('删除这条待办？')) return;
        await DB.del('todos', btn.dataset.delTodo);
        App.toast('已删除');
        App.render();
      });
    });
  },

  itemHTML(t) {
    const d = new Date(t.createdAt);
    const time = `${d.getMonth() + 1}/${d.getDate()}`;
    const id = escapeHtml(t.id);
    return `
      <div class="row ${t.done ? 'done' : ''}">
        <button class="check ${t.done ? 'on' : ''}" data-toggle="${id}" type="button" aria-label="完成">${t.done ? '✓' : ''}</button>
        <div class="grow">
          <div class="title">${escapeHtml(t.title)}</div>
          <div class="sub">${time}${t.priority === 'high' ? ' · <span class="badge high">重要</span>' : ''}${t.priority === 'low' ? ' · <span class="badge low">低</span>' : ''}</div>
        </div>
        <button class="del-btn" data-del-todo="${id}" type="button" aria-label="删除">×</button>
      </div>
    `;
  }
};

window.TodoModule = TodoModule;
