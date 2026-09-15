/* 设置：导出 / 导入 / 清空 */
const SettingsModule = {
  async render(root) {
    const counts = {};
    for (const s of ['todos', 'fitnessLogs', 'fitnessGoals', 'txns', 'installments', 'ledgers']) {
      counts[s] = (await DB.getAll(s)).length;
    }

    root.innerHTML = `
      <div class="card">
        <h2>数据</h2>
        <div class="row"><div class="grow"><div class="title">待办</div></div><div class="sub">${counts.todos} 条</div></div>
        <div class="row"><div class="grow"><div class="title">运动记录</div></div><div class="sub">${counts.fitnessLogs} 条</div></div>
        <div class="row"><div class="grow"><div class="title">运动目标</div></div><div class="sub">${counts.fitnessGoals} 条</div></div>
        <div class="row"><div class="grow"><div class="title">账目</div></div><div class="sub">${counts.txns} 条</div></div>
        <div class="row"><div class="grow"><div class="title">分期</div></div><div class="sub">${counts.installments} 条</div></div>
        <div class="row"><div class="grow"><div class="title">借贷</div></div><div class="sub">${counts.ledgers} 条</div></div>
      </div>

      <div class="card">
        <h2>备份与迁移</h2>
        <p style="margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.5">
          数据保存在本机浏览器（IndexedDB）。换设备时先导出 JSON，再在新设备导入。
        </p>
        <button class="btn block primary" id="btn-export" type="button">导出备份 JSON</button>
        <div style="height:8px"></div>
        <button class="btn block" id="btn-import" type="button">导入备份 JSON</button>
        <input type="file" id="import-file" accept="application/json,.json" class="hidden" />
        <div style="height:8px"></div>
        <div class="seg" id="import-mode">
          <button type="button" data-mode="merge" class="active">合并</button>
          <button type="button" data-mode="overwrite">覆盖</button>
        </div>
        <div style="height:8px"></div>
        <button class="btn block danger" id="btn-wipe" type="button">清空全部数据</button>
      </div>

      <div class="card">
        <h2>安装到桌面</h2>
        <p style="margin:0;font-size:13px;color:var(--muted);line-height:1.6">
          <strong>Android / Chrome：</strong>浏览器菜单 →「安装应用」或「添加到主屏幕」。<br/>
          <strong>iOS / Safari：</strong>分享 →「添加到主屏幕」。<br/>
          安装后全屏打开，像普通 App 一样使用。
        </p>
      </div>

      <div class="card">
        <h2>关于</h2>
        <div class="sub" style="font-size:13px;color:var(--muted);line-height:1.5">
          工作台 v1 · 本地优先 · 待办 / 运动 / 记账<br/>
          离线可用，数据不上传。
        </div>
      </div>
    `;

    let importMode = 'merge';
    root.querySelectorAll('#import-mode button').forEach((b) => {
      b.addEventListener('click', () => {
        importMode = b.dataset.mode;
        root.querySelectorAll('#import-mode button').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    root.querySelector('#btn-export').addEventListener('click', async () => {
      try {
        const payload = await DB.exportAll();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `workbench-backup-${DB.todayStr().replace(/-/g, '')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        App.toast('已导出备份');
      } catch (e) {
        console.error(e);
        App.toast('导出失败');
      }
    });

    const fileInput = root.querySelector('#import-file');
    root.querySelector('#btn-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        if (importMode === 'overwrite') {
          if (!confirm('覆盖模式会先清空现有数据，确定？')) {
            fileInput.value = '';
            return;
          }
        }
        await DB.importAll(payload, importMode);
        App.toast('导入成功');
        App.render();
      } catch (e) {
        console.error(e);
        App.toast('备份文件格式不正确');
      } finally {
        fileInput.value = '';
      }
    });

    root.querySelector('#btn-wipe').addEventListener('click', async () => {
      if (!confirm('将删除本机全部数据且不可恢复，确定清空？')) return;
      if (!confirm('再次确认：真的要清空吗？')) return;
      await DB.wipeAll();
      App.toast('已清空');
      App.render();
    });
  }
};

window.SettingsModule = SettingsModule;
