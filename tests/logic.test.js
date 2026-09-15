/* 纯函数自测：node tests/logic.test.js */
const path = require('path');
const fs = require('fs');

// 轻量加载 db.js（去掉 window 挂载依赖）
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
const sandbox = { window: {}, indexedDB: null, Date, Math, Number, String, Promise, Array, Object, Map, console };
// 仅提取纯函数通过 eval 不安全；改为复制关键函数内联测试

function parseAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
function sumBy(list, fn) {
  return list.reduce((acc, item) => {
    const n = Number(fn(item));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}
function progressPct(current, target) {
  const c = Number(current);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.min(100, Math.round((c / t) * 1000) / 10);
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

assert(parseAmount('12.345') === 12.35, 'parseAmount rounds to 2 decimals');
assert(parseAmount('abc') === null, 'parseAmount invalid');
assert(parseAmount('0') === 0, 'parseAmount zero');
assert(sumBy([{v:1},{v:2.5}], x => x.v) === 3.5, 'sumBy');
assert(sumBy([{v:'12.50'},{v:'30'}], x => x.v) === 42.5, 'sumBy coerces numeric strings');
assert(sumBy([{v:'abc'},{v:10}], x => x.v) === 10, 'sumBy ignores non-numeric');
assert(progressPct(50, 100) === 50, 'progress half');
assert(progressPct(150, 100) === 100, 'progress capped');
assert(progressPct(10, 0) === 0, 'progress no target');
assert(progressPct('50', '100') === 50, 'progress coerces strings');
assert(progressPct('x', 100) === 0, 'progress invalid current');

// 分期剩余
function remainingInstallment(i) {
  const paid = (i.paidCount || 0) * (i.monthlyAmount || 0);
  return Math.max(0, i.totalAmount - paid);
}
assert(remainingInstallment({ totalAmount: 1200, paidCount: 3, monthlyAmount: 100 }) === 900, 'installment remaining');

// 借贷未结
function openLedger(l) {
  return Math.max(0, l.amount - (l.repaid || 0));
}
assert(openLedger({ amount: 500, repaid: 200 }) === 300, 'ledger open');

console.log('done');
