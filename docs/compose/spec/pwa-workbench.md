---
feature: pwa-workbench
status: delivered
updated: 2026-09-15
branch: feature/pwa-workbench
commits: 
---

# 手机工作台 PWA

## Report

**What was built** — 本地优先的可安装 PWA「工作台」：底部三 Tab（待办/运动/账本）+ 设置。待办支持快速添加、完成与筛选；运动支持深蹲等次数预设/自定义、今日步数覆盖写入、今日/长期目标与进度条；账本支持本月收支、流水、分期「还1期」、借入借出台账与还款。数据存 IndexedDB，设置页可导出/导入 JSON（合并或覆盖）并二次确认清空。含 manifest、service worker 与 192/512 图标，可在 Chrome/Safari「添加到主屏幕」后全屏使用。

**Verification** — `node --check` 全部 JS 通过；`node tests/logic.test.js` 全部 PASS；本地 `python -m http.server 8765` 下 index/manifest/sw/css/db/icon 均 HTTP 200。

**Journey log**
- 空仓库直接 `git init` + `feature/pwa-workbench`，未套用 worktree（无既有主仓历史）。
- 选用无构建纯 HTML/CSS/JS，便于预览与 PWA 安装。
- 评审子代理超时取消，改为主会话自审：XSS 转义、导入校验、进度上限、金额 Number 强制。
- 步数采用「当日覆盖」语义，避免多次累加误记。

## Tasks

## [S1] Problem
需要一个可安装到手机桌面的个人工作台，用来：
1. 快速准确记录待办；
2. 记录运动数据（深蹲次数、步数等），对照今日/长期目标看完成进度；
3. 记账（收支），并支持分期与借入借出台账；
4. 数据完全存本地，可导出/导入，换设备可迁移。

交付形态：PWA（Manifest + Service Worker），Android/Chrome「安装应用」后全屏打开，像普通 App；不是需要手动打开 HTML 文件的网页。

## [S2] Design

### 技术选型
- 纯 HTML/CSS/JS（无构建步骤），入口 `index.html`，便于浏览器直接预览与 PWA 安装。
- 数据层：IndexedDB（库名 `workbench`，版本 1）。
- 静态资源：`manifest.webmanifest`、`sw.js`、`icons/`。
- 移动优先，最大内容宽 430px，底部三 Tab。

### 视觉方向
- 风格锚点：系统级个人工具 App（提醒事项 + 简洁记账），纸质暖白底、扁平、无重阴影。
- 色板：背景 `#F4F1EA`，表面 `#FFFFFF`，主文字 `#1C1B19`，次文字 `#6E6A63`，描边 `#E4E0D6`。
- 强调色：待办 `#3D6B9A`，运动 `#2F6B4F`，账本 `#C47B3A`，危险 `#B54A4A`。
- 字体：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`。
- 圆角 12px，列表行高 ≥52px，触控目标 ≥44px。

### 信息架构
底部 Tab：
1. **待办** — 快速添加栏、今日/全部/已完成筛选、勾选完成、左滑或按钮删除。
2. **运动** — 今日进度卡（环形/条形）、快速记录（深蹲/俯卧撑/自定义次数）、步数登记、今日目标与长期累计。
3. **账本** — 本月收支摘要、记一笔（收入/支出）、流水列表、分期计划、借入借出台账。

顶部「设置」入口：导出 JSON、导入 JSON、清空数据、关于。

### 数据模型（IndexedDB object stores）

**todos**
```
{ id, title, note, done, createdAt, completedAt, priority: 'low'|'normal'|'high', tags: string[] }
```

**fitnessLogs**
```
{ id, type: 'reps'|'steps'|'custom', name, value, unit, date: 'YYYY-MM-DD', createdAt, note }
```

**fitnessGoals**
```
{ id, scope: 'daily'|'longterm', name, target, unit, type: 'reps'|'steps'|'custom', createdAt }
```
- 今日进度 = 当日同 name/unit/type 的 logs 合计 / 对应 daily goal。
- 长期累计 = 全部 logs 合计 / longterm goal。

**txns**
```
{ id, kind: 'income'|'expense', amount, category, note, date: 'YYYY-MM-DD', createdAt }
```

**installments**
```
{ id, title, totalAmount, paidCount, totalCount, monthlyAmount, startDate, note, closed }
```
- 剩余 = totalAmount - paidCount * monthlyAmount（展示用）。

**ledgers**（借入/借出）
```
{ id, direction: 'borrow'|'lend', party, amount, date, dueDate?, repaid: number, note, closed }
```
- 未还清 = amount - repaid。

**meta**
```
{ key, value }  // schemaVersion, lastExportAt 等
```

### 导出/导出
- 导出：`{ schemaVersion: 1, exportedAt, data: { todos, fitnessLogs, fitnessGoals, txns, installments, ledgers } }` 下载为 `workbench-backup-YYYYMMDD.json`。
- 导入：校验 `schemaVersion` 与顶层 `data`，可选「合并」或「覆盖」；合并按 id 去重，覆盖先清空再写入。

### 路由与状态
- Hash 路由：`#/todo` `#/fitness` `#/finance` `#/settings`。
- 模块内局部状态用内存 + 持久层读写；变更后立即写 IndexedDB。

### 错误行为
- 存储失败：Toast 提示「保存失败」，不静默。
- 导入非法 JSON：Toast「备份文件格式不正确」。
- Service Worker 注册失败：应用仍可用（仅失去离线缓存）。

### PWA 安装
- `manifest.webmanifest`：`name`/`short_name`=「工作台」，`display`=standalone，`theme_color`/`background_color` 对齐色板，图标 192/512。
- `sw.js`：cache-first 静态资源 + 网络回退页面。
- HTML 含 `apple-mobile-web-app-capable` 等 iOS meta。

### 测试边界
- 无需后端；验证以本地静态检查 + 浏览器可打开 + 核心交互逻辑自测为主。
- 数据层提供可单测的纯函数（金额合计、进度百分比、导入校验）。

## [S3] Out of Scope
- 账号/云同步/推送通知
- 二维码/照片附件
- 多币种与汇率
- 原生 Capacitor/APK 打包（结构已预留，不在本版）
- 复杂图表库与报表

## Tasks
- [x] T1: PWA 骨架（index.html/css/js、manifest、sw、icons、底部导航） — acceptance: 浏览器打开可切换三 Tab，manifest 与 sw 可注册 (covers: S2)
- [x] T2: IndexedDB 数据层与导出导入 — acceptance: CRUD 与 JSON 导出/导入校验可用 (covers: S2)
- [x] T3: 待办模块 — acceptance: 快速添加、完成、筛选、删除可用 (covers: S2)
- [x] T4: 运动模块 — acceptance: 记次数/步数，今日与长期目标进度正确 (covers: S2)
- [x] T5: 记账模块 — acceptance: 收支流水、分期、借入借出可录入与汇总 (covers: S2)
- [x] T6: 设置页与备份文件下载/选择导入 — acceptance: 导出得到合法 JSON，导入可恢复数据 (covers: S2)
- [x] T7: 移动端视觉与触控打磨 — acceptance: 430px 下布局无横向滚动，主操作触控 ≥44px（chip/btn.sm 提升至 40px；勾选 24px 视觉圆点外扩 40px 热区见 .check）(covers: S2)
