/* 记账模块：收支 · 分期 · 借入借出 */
const FinanceModule = {
  tab: 'txns',

  async render(root) {
    const [txns, installments, ledgers] = await Promise.all([
      DB.getAll('txns'),
      DB.getAll('installments'),
      DB.getAll('ledgers')
    ]);

    const m = DB.monthStr();
    const monthTx = txns.filter((t) => (t.date || '').startsWith(m));
    const income = DB.sumBy(monthTx.filter((t) => t.kind === 'income'), (t) => Number(t.amount) || 0);
    const expense = DB.sumBy(monthTx.filter((t) => t.kind === 'expense'), (t) => Number(t.amount) || 0);

    const openInstall = installments.filter((i) => !i.closed);
    const openLedgers = ledgers.filter((l) => !l.closed);

    root.innerHTML = `
      <div class="stat-grid">
        <div class="stat">
          <div class="label">本月收入</div>
          <div class="value amount income">¥${income.toFixed(2)}</div>
        </div>
        <div class="stat">
          <div class="label">本月支出</div>
          <div class="value amount expense">¥${expense.toFixed(2)}</div>
        </div>
      </div>

      <div class="chips" style="justify-content:space-between">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[['txns', '流水'], ['install', '分期'], ['ledger', '借贷']]
            .map(([k, label]) => `<button class="chip ${this.tab === k ? 'active' : ''}" data-ftab="${k}" type="button">${label}</button>`)
            .join('')}
        </div>
        <button class="btn sm finance" id="open-txn" type="button">记一笔</button>
      </div>

      ${this.tab === 'txns' ? this.txnsHTML(txns) : ''}
      ${this.tab === 'install' ? this.installHTML(installments, openInstall) : ''}
      ${this.tab === 'ledger' ? this.ledgerHTML(ledgers, openLedgers) : ''}
    `;

    root.querySelectorAll('[data-ftab]').forEach((btn) => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.ftab; App.render(); });
    });

    root.querySelector('#open-txn').addEventListener('click', () => this.openTxn());

    const addInstall = root.querySelector('#add-install');
    if (addInstall) addInstall.addEventListener('click', () => this.openInstall());

    const addLedger = root.querySelector('#add-ledger');
    if (addLedger) addLedger.addEventListener('click', () => this.openLedger());

    root.querySelectorAll('[data-pay-one]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = await DB.getById('installments', btn.dataset.payOne);
        if (!item || item.closed) return;
        item.paidCount = Math.min(item.totalCount, (item.paidCount || 0) + 1);
        if (item.paidCount >= item.totalCount) item.closed = true;
        await DB.put('installments', item);
        App.toast('已记 1 期');
        App.render();
      });
    });

    root.querySelectorAll('[data-repay]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = await DB.getById('ledgers', btn.dataset.repay);
        if (!item) return;
        const rest = Math.max(0, item.amount - (item.repaid || 0));
        const v = prompt(`还清金额（剩余 ¥${rest.toFixed(2)}）`, String(rest));
        if (v === null) return;
        const amount = DB.parseAmount(v);
        if (amount === null || amount < 0) return App.toast('金额无效');
        item.repaid = Math.min(item.amount, (item.repaid || 0) + amount);
        if (item.repaid >= item.amount - 0.001) item.closed = true;
        await DB.put('ledgers', item);
        App.toast('已更新还款');
        App.render();
      });
    });

    root.querySelectorAll('[data-del-finance]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('确认删除？')) return;
        await DB.del(btn.dataset.store, btn.dataset.delFinance);
        App.render();
      });
    });
  },

  txnsHTML(txns) {
    const sorted = txns.slice().sort((a, b) => {
      if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
      return String(b.date || '').localeCompare(String(a.date || ''));
    }).slice(0, 50);
    return `
      <div class="card">
        <h2>最近流水</h2>
        ${sorted.length === 0 ? '<div class="empty">还没有账目</div>' : sorted.map((t) => `
          <div class="row">
            <div class="grow">
              <div class="title">${escapeHtml(t.category || '未分类')}${t.note ? ' · ' + escapeHtml(t.note) : ''}</div>
              <div class="sub">${escapeHtml(t.date || '')}</div>
            </div>
            <div class="amount ${t.kind === 'income' ? 'income' : 'expense'}" style="margin-right:4px">${t.kind === 'income' ? '+' : '-'}¥${(Number(t.amount) || 0).toFixed(2)}</div>
            <button class="del-btn" data-del-finance="${escapeHtml(t.id)}" data-store="txns" type="button" aria-label="删除">×</button>
          </div>
        `).join('')}
      </div>
    `;
  },

  installHTML(all, open) {
    return `
      <div class="card">
        <h2>分期计划（进行中 ${open.length}）</h2>
        <button class="btn block finance" id="add-install" type="button">新增分期</button>
        <div style="margin-top:8px">
          ${all.length === 0 ? '<div class="empty">暂无分期</div>' : all.slice().reverse().map((i) => {
            const paid = (Number(i.paidCount) || 0) * (Number(i.monthlyAmount) || 0);
            const rest = Math.max(0, (Number(i.totalAmount) || 0) - paid);
            const pct = DB.progressPct(paid, i.totalAmount);
            return `
              <div class="row">
                <div class="grow">
                  <div class="title">${escapeHtml(i.title)} ${i.closed ? '<span class="badge">已结清</span>' : ''}</div>
                  <div class="sub">共 ${Number(i.totalCount) || 0} 期 · 每期 ¥${(Number(i.monthlyAmount) || 0).toFixed(2)} · 已还 ${Number(i.paidCount) || 0} 期</div>
                  <div class="sub">剩余 ¥${rest.toFixed(2)} / 总额 ¥${(Number(i.totalAmount) || 0).toFixed(2)}</div>
                  <div class="progress"><i style="width:${pct}%;background:var(--finance)"></i></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${!i.closed ? `<button class="btn sm finance" data-pay-one="${escapeHtml(i.id)}" type="button">还1期</button>` : ''}
                  <button class="del-btn" data-del-finance="${escapeHtml(i.id)}" data-store="installments" type="button" aria-label="删除">×</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  ledgerHTML(all, open) {
    const borrowOpen = open.filter((l) => l.direction === 'borrow');
    const lendOpen = open.filter((l) => l.direction === 'lend');
    const borrowSum = DB.sumBy(borrowOpen, (l) => Math.max(0, (Number(l.amount) || 0) - (Number(l.repaid) || 0)));
    const lendSum = DB.sumBy(lendOpen, (l) => Math.max(0, (Number(l.amount) || 0) - (Number(l.repaid) || 0)));
    return `
      <div class="stat-grid">
        <div class="stat">
          <div class="label">借入未还</div>
          <div class="value">¥${borrowSum.toFixed(2)}</div>
        </div>
        <div class="stat">
          <div class="label">借出未收</div>
          <div class="value">¥${lendSum.toFixed(2)}</div>
        </div>
      </div>
      <div class="card">
        <h2>借贷台账</h2>
        <button class="btn block finance" id="add-ledger" type="button">新增借入 / 借出</button>
        <div style="margin-top:8px">
          ${all.length === 0 ? '<div class="empty">暂无记录</div>' : all.slice().reverse().map((l) => {
            const rest = Math.max(0, (Number(l.amount) || 0) - (Number(l.repaid) || 0));
            return `
              <div class="row">
                <div class="grow">
                  <div class="title">${l.direction === 'borrow' ? '借入' : '借出'} · ${escapeHtml(l.party || '对方')} ${l.closed ? '<span class="badge">已结清</span>' : ''}</div>
                  <div class="sub">${escapeHtml(l.date || '')}${l.dueDate ? ' → ' + escapeHtml(l.dueDate) : ''} · 未结 ¥${rest.toFixed(2)}</div>
                  ${l.note ? `<div class="sub">${escapeHtml(l.note)}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${!l.closed ? `<button class="btn sm" data-repay="${escapeHtml(l.id)}" type="button">还款</button>` : ''}
                  <button class="del-btn" data-del-finance="${escapeHtml(l.id)}" data-store="ledgers" type="button" aria-label="删除">×</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  openTxn() {
    App.openModal(`
      <h3>记一笔</h3>
      <div class="seg" id="txn-kind">
        <button type="button" data-kind="expense" class="active">支出</button>
        <button type="button" data-kind="income">收入</button>
      </div>
      <div class="form-row"><label>金额</label><input class="field" id="t-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" /></div>
      <div class="form-row"><label>分类</label><input class="field" id="t-cat" placeholder="餐饮 / 工资 / 交通…" list="cat-list" />
        <datalist id="cat-list">
          <option>餐饮</option><option>交通</option><option>购物</option><option>居住</option>
          <option>娱乐</option><option>医疗</option><option>工资</option><option>奖金</option><option>其他</option>
        </datalist>
      </div>
      <div class="form-row"><label>备注</label><input class="field" id="t-note" placeholder="可选" /></div>
      <div class="form-row"><label>日期</label><input class="field" id="t-date" type="date" value="${DB.todayStr()}" /></div>
      <div class="form-actions">
        <button class="btn ghost" data-close type="button">取消</button>
        <button class="btn finance" id="t-save" type="button">保存</button>
      </div>
    `, (modal) => {
      let kind = 'expense';
      modal.querySelectorAll('#txn-kind button').forEach((b) => {
        b.addEventListener('click', () => {
          kind = b.dataset.kind;
          modal.querySelectorAll('#txn-kind button').forEach((x) => x.classList.toggle('active', x === b));
        });
      });
      modal.querySelector('#t-save').addEventListener('click', async () => {
        const amount = DB.parseAmount(modal.querySelector('#t-amount').value);
        const category = modal.querySelector('#t-cat').value.trim() || '其他';
        const note = modal.querySelector('#t-note').value.trim();
        const date = modal.querySelector('#t-date').value || DB.todayStr();
        if (amount === null || amount <= 0) return App.toast('请输入有效金额');
        await DB.put('txns', {
          id: DB.uid(),
          kind,
          amount,
          category,
          note,
          date,
          createdAt: Date.now()
        });
        App.closeModal();
        App.toast('已记账');
        App.render();
      });
    });
  },

  openInstall() {
    App.openModal(`
      <h3>新增分期</h3>
      <div class="form-row"><label>名称</label><input class="field" id="i-title" placeholder="如：手机分期" /></div>
      <div class="form-row"><label>总额</label><input class="field" id="i-total" type="number" inputmode="decimal" min="0" step="0.01" /></div>
      <div class="form-row"><label>期数</label><input class="field" id="i-count" type="number" inputmode="numeric" min="1" step="1" /></div>
      <div class="form-row"><label>每期金额</label><input class="field" id="i-monthly" type="number" inputmode="decimal" min="0" step="0.01" /></div>
      <div class="form-row"><label>开始日期</label><input class="field" id="i-start" type="date" value="${DB.todayStr()}" /></div>
      <div class="form-row"><label>已还期数</label><input class="field" id="i-paid" type="number" inputmode="numeric" min="0" step="1" value="0" /></div>
      <div class="form-actions">
        <button class="btn ghost" data-close type="button">取消</button>
        <button class="btn finance" id="i-save" type="button">保存</button>
      </div>
    `, (modal) => {
      modal.querySelector('#i-save').addEventListener('click', async () => {
        const title = modal.querySelector('#i-title').value.trim();
        const totalAmount = DB.parseAmount(modal.querySelector('#i-total').value);
        const totalCount = parseInt(modal.querySelector('#i-count').value, 10);
        let monthlyAmount = DB.parseAmount(modal.querySelector('#i-monthly').value);
        const startDate = modal.querySelector('#i-start').value || DB.todayStr();
        const paidCount = parseInt(modal.querySelector('#i-paid').value, 10) || 0;
        if (!title || totalAmount === null || totalAmount <= 0 || !totalCount || totalCount < 1) {
          return App.toast('请填写完整');
        }
        if (paidCount < 0) return App.toast('已还期数无效');
        if (!monthlyAmount || monthlyAmount <= 0) monthlyAmount = Math.round((totalAmount / totalCount) * 100) / 100;
        await DB.put('installments', {
          id: DB.uid(),
          title,
          totalAmount,
          paidCount: Math.min(paidCount, totalCount),
          totalCount,
          monthlyAmount,
          startDate,
          note: '',
          closed: paidCount >= totalCount
        });
        App.closeModal();
        App.toast('分期已添加');
        App.render();
      });
    });
  },

  openLedger() {
    App.openModal(`
      <h3>新增借贷</h3>
      <div class="seg" id="l-dir">
        <button type="button" data-dir="borrow" class="active">借入</button>
        <button type="button" data-dir="lend">借出</button>
      </div>
      <div class="form-row"><label>对方</label><input class="field" id="l-party" placeholder="姓名 / 平台" /></div>
      <div class="form-row"><label>金额</label><input class="field" id="l-amount" type="number" inputmode="decimal" min="0" step="0.01" /></div>
      <div class="form-row"><label>日期</label><input class="field" id="l-date" type="date" value="${DB.todayStr()}" /></div>
      <div class="form-row"><label>约定归还日（可选）</label><input class="field" id="l-due" type="date" /></div>
      <div class="form-row"><label>已还 / 已收</label><input class="field" id="l-repaid" type="number" inputmode="decimal" min="0" step="0.01" value="0" /></div>
      <div class="form-row"><label>备注</label><input class="field" id="l-note" placeholder="可选" /></div>
      <div class="form-actions">
        <button class="btn ghost" data-close type="button">取消</button>
        <button class="btn finance" id="l-save" type="button">保存</button>
      </div>
    `, (modal) => {
      let direction = 'borrow';
      modal.querySelectorAll('#l-dir button').forEach((b) => {
        b.addEventListener('click', () => {
          direction = b.dataset.dir;
          modal.querySelectorAll('#l-dir button').forEach((x) => x.classList.toggle('active', x === b));
        });
      });
      modal.querySelector('#l-save').addEventListener('click', async () => {
        const party = modal.querySelector('#l-party').value.trim();
        const amount = DB.parseAmount(modal.querySelector('#l-amount').value);
        const date = modal.querySelector('#l-date').value || DB.todayStr();
        const dueDate = modal.querySelector('#l-due').value || '';
        const repaid = DB.parseAmount(modal.querySelector('#l-repaid').value);
        const note = modal.querySelector('#l-note').value.trim();
        if (!party || amount === null || amount <= 0) return App.toast('请填写完整');
        if (repaid !== null && repaid < 0) return App.toast('已还金额无效');
        await DB.put('ledgers', {
          id: DB.uid(),
          direction,
          party,
          amount,
          date,
          dueDate,
          repaid: Math.min(repaid || 0, amount),
          note,
          closed: (repaid || 0) >= amount
        });
        App.closeModal();
        App.toast('已保存');
        App.render();
      });
    });
  }
};

window.FinanceModule = FinanceModule;
