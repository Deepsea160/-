/* 运动模块 */
const FitnessModule = {
  async render(root) {
    const [logs, goals] = await Promise.all([
      DB.getAll('fitnessLogs'),
      DB.getAll('fitnessGoals')
    ]);
    const today = DB.todayStr();
    const todayLogs = logs.filter((l) => l.date === today);

    const dailyGoals = goals.filter((g) => g.scope === 'daily');
    const longGoals = goals.filter((g) => g.scope === 'longterm');

    const sumFor = (name, unit, type, scopeLogs) =>
      DB.sumBy(scopeLogs.filter((l) => l.name === name && l.unit === unit && l.type === type), (l) => l.value);

    const todaySteps = DB.sumBy(todayLogs.filter((l) => l.type === 'steps'), (l) => l.value);
    const allSteps = DB.sumBy(logs.filter((l) => l.type === 'steps'), (l) => l.value);
    const stepsGoal = dailyGoals.find((g) => g.type === 'steps');
    const stepsLong = longGoals.find((g) => g.type === 'steps');

    const repsToday = todayLogs.filter((l) => l.type === 'reps');
    const grouped = {};
    for (const l of repsToday) {
      const key = `${l.name}|${l.unit}`;
      if (!grouped[key]) grouped[key] = { name: l.name, unit: l.unit, value: 0 };
      grouped[key].value += Number(l.value) || 0;
    }
    const repsGroups = Object.values(grouped);

    root.innerHTML = `
      <div class="stat-grid">
        <div class="stat">
          <div class="label">今日步数</div>
          <div class="value">${todaySteps.toLocaleString()}</div>
          <div class="hint">${stepsGoal ? `目标 ${Number(stepsGoal.target).toLocaleString()} · ${DB.progressPct(todaySteps, stepsGoal.target)}%` : '未设今日目标'}</div>
          <div class="progress"><i style="width:${stepsGoal ? DB.progressPct(todaySteps, stepsGoal.target) : 0}%"></i></div>
        </div>
        <div class="stat">
          <div class="label">步数累计</div>
          <div class="value">${allSteps.toLocaleString()}</div>
          <div class="hint">${stepsLong ? `长期目标 ${Number(stepsLong.target).toLocaleString()} · ${DB.progressPct(allSteps, stepsLong.target)}%` : '未设长期目标'}</div>
          <div class="progress"><i style="width:${stepsLong ? DB.progressPct(allSteps, stepsLong.target) : 0}%"></i></div>
        </div>
      </div>

      <div class="card">
        <h2>今日动作</h2>
        ${repsGroups.length === 0 ? '<div class="empty">今天还没有动作记录</div>' : ''}
        ${repsGroups.map((g) => {
          const goal = dailyGoals.find((x) => x.name === g.name && x.unit === g.unit && x.type === 'reps');
          const long = longGoals.find((x) => x.name === g.name && x.unit === g.unit && x.type === 'reps');
          const allFor = sumFor(g.name, g.unit, 'reps', logs);
          const pct = goal ? DB.progressPct(g.value, goal.target) : null;
          const longPct = long ? DB.progressPct(allFor, long.target) : null;
          return `
            <div class="row">
              <div class="grow">
                <div class="title">${escapeHtml(g.name)} ${g.value} ${escapeHtml(g.unit)}</div>
                ${goal ? `<div class="sub">目标 ${goal.target} · ${pct}%</div><div class="progress"><i style="width:${pct}%"></i></div>` : '<div class="sub">无目标</div>'}
                ${long ? `<div class="sub">长期 ${allFor} / ${long.target} · ${longPct}%</div><div class="progress"><i style="width:${longPct}%;opacity:.75"></i></div>` : ''}
              </div>
              <button class="btn sm fitness" data-quick="${escapeHtml(g.name)}" data-unit="${escapeHtml(g.unit)}" type="button">+10</button>
            </div>
          `;
        }).join('')}
      </div>

      <div class="card">
        <h2>快速记录</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn fitness" data-preset="深蹲|20|次" type="button">深蹲 +20</button>
          <button class="btn fitness" data-preset="俯卧撑|10|个" type="button">俯卧撑 +10</button>
          <button class="btn fitness" data-preset="卷腹|15|个" type="button">卷腹 +15</button>
          <button class="btn ghost" id="open-custom" type="button">自定义…</button>
        </div>
        <div style="display:flex;gap:8px">
          <input class="field" id="steps-input" type="number" inputmode="numeric" min="0" step="1" placeholder="今日步数" />
          <button class="btn fitness" id="save-steps" type="button">记步数</button>
        </div>
      </div>

      <div class="card">
        <h2>今日明细</h2>
        ${todayLogs.length === 0 ? '<div class="empty">暂无</div>' : todayLogs.slice().reverse().map((l) => `
          <div class="row">
            <div class="grow">
              <div class="title">${escapeHtml(l.name)} · ${Number(l.value) || 0} ${escapeHtml(l.unit)}</div>
              <div class="sub">${new Date(l.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}${l.note ? ' · ' + escapeHtml(l.note) : ''}</div>
            </div>
            <button class="del-btn" data-del-log="${escapeHtml(l.id)}" type="button" aria-label="删除">×</button>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <h2>目标管理</h2>
        <button class="btn block" id="open-goal" type="button">添加 / 调整目标</button>
        <div style="margin-top:8px">
          ${goals.length === 0 ? '<div class="empty">尚未设置目标</div>' : goals.map((g) => `
            <div class="row">
              <div class="grow">
                <div class="title">${escapeHtml(g.name)} · ${Number(g.target).toLocaleString()} ${escapeHtml(g.unit)}</div>
                <div class="sub">${g.scope === 'daily' ? '今日目标' : '长期目标'}</div>
              </div>
              <button class="del-btn" data-del-goal="${escapeHtml(g.id)}" type="button" aria-label="删除">×</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    root.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const [name, value, unit] = btn.dataset.preset.split('|');
        await this.addLog(name, Number(value), unit, 'reps');
        App.toast(`已记 ${name} +${value}`);
        App.render();
      });
    });

    root.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.addLog(btn.dataset.quick, 10, btn.dataset.unit, 'reps');
        App.toast('已 +10');
        App.render();
      });
    });

    root.querySelector('#save-steps').addEventListener('click', async () => {
      const v = DB.parseAmount(root.querySelector('#steps-input').value);
      if (v === null || v < 0) return App.toast('请输入有效步数');
      const existing = (await DB.getAll('fitnessLogs')).filter((l) => l.type === 'steps' && l.date === DB.todayStr());
      for (const e of existing) await DB.del('fitnessLogs', e.id);
      await this.addLog('步数', v, '步', 'steps');
      App.toast('步数已保存');
      App.render();
    });

    root.querySelector('#open-custom').addEventListener('click', () => this.openCustom());
    root.querySelector('#open-goal').addEventListener('click', () => this.openGoal());

    root.querySelectorAll('[data-del-log]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await DB.del('fitnessLogs', btn.dataset.delLog);
        App.render();
      });
    });

    root.querySelectorAll('[data-del-goal]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('删除该目标？')) return;
        await DB.del('fitnessGoals', btn.dataset.delGoal);
        App.render();
      });
    });

    // 回填今日步数输入
    const stepsToday = todayLogs.filter((l) => l.type === 'steps');
    if (stepsToday.length) {
      root.querySelector('#steps-input').value = DB.sumBy(stepsToday, (l) => l.value);
    }
  },

  async addLog(name, value, unit, type, note = '') {
    await DB.put('fitnessLogs', {
      id: DB.uid(),
      type,
      name,
      value,
      unit,
      date: DB.todayStr(),
      createdAt: Date.now(),
      note
    });
  },

  openCustom() {
    App.openModal(`
      <h3>自定义动作</h3>
      <div class="form-row"><label>名称</label><input class="field" id="f-name" placeholder="如：波比跳" /></div>
      <div class="form-row"><label>数量</label><input class="field" id="f-val" type="number" inputmode="decimal" min="0" /></div>
      <div class="form-row"><label>单位</label><input class="field" id="f-unit" value="次" /></div>
      <div class="form-actions">
        <button class="btn ghost" data-close type="button">取消</button>
        <button class="btn fitness" id="f-save" type="button">保存</button>
      </div>
    `, (modal) => {
      modal.querySelector('#f-save').addEventListener('click', async () => {
        const name = modal.querySelector('#f-name').value.trim();
        const val = DB.parseAmount(modal.querySelector('#f-val').value);
        const unit = modal.querySelector('#f-unit').value.trim() || '次';
        if (!name || val === null || val <= 0) return App.toast('请填写完整');
        await this.addLog(name, val, unit, 'reps');
        App.closeModal();
        App.toast('已记录');
        App.render();
      });
    });
  },

  openGoal() {
    App.openModal(`
      <h3>设置目标</h3>
      <div class="form-row"><label>类型</label>
        <select class="field" id="g-type">
          <option value="steps">步数</option>
          <option value="reps">次数动作</option>
        </select>
      </div>
      <div class="form-row"><label>名称</label><input class="field" id="g-name" placeholder="步数或动作名，如：深蹲" /></div>
      <div class="form-row"><label>目标值</label><input class="field" id="g-target" type="number" inputmode="numeric" min="1" /></div>
      <div class="form-row"><label>单位</label><input class="field" id="g-unit" value="次" /></div>
      <div class="form-row"><label>范围</label>
        <select class="field" id="g-scope">
          <option value="daily">今日目标</option>
          <option value="longterm">长期目标</option>
        </select>
      </div>
      <div class="form-actions">
        <button class="btn ghost" data-close type="button">取消</button>
        <button class="btn fitness" id="g-save" type="button">保存</button>
      </div>
    `, (modal) => {
      const typeSel = modal.querySelector('#g-type');
      const nameEl = modal.querySelector('#g-name');
      const unitEl = modal.querySelector('#g-unit');
      typeSel.addEventListener('change', () => {
        if (typeSel.value === 'steps') {
          nameEl.value = '步数';
          unitEl.value = '步';
        } else {
          nameEl.placeholder = '动作名，如：深蹲';
          if (nameEl.value === '步数') nameEl.value = '';
          unitEl.value = '次';
        }
      });
      modal.querySelector('#g-save').addEventListener('click', async () => {
        const type = typeSel.value;
        const name = (nameEl.value.trim() || (type === 'steps' ? '步数' : ''));
        const target = DB.parseAmount(modal.querySelector('#g-target').value);
        const unit = unitEl.value.trim() || (type === 'steps' ? '步' : '次');
        const scope = modal.querySelector('#g-scope').value;
        if (!name || !target || target <= 0) return App.toast('请填写完整');
        // 同 scope+type+name 只保留一个
        const goals = await DB.getAll('fitnessGoals');
        for (const g of goals) {
          if (g.scope === scope && g.type === type && g.name === name && g.unit === unit) {
            await DB.del('fitnessGoals', g.id);
          }
        }
        await DB.put('fitnessGoals', {
          id: DB.uid(),
          scope,
          name,
          target,
          unit,
          type,
          createdAt: Date.now()
        });
        App.closeModal();
        App.toast('目标已保存');
        App.render();
      });
    });
  }
};

window.FitnessModule = FitnessModule;
