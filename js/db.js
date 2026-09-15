/* IndexedDB 数据层 */
const DB_NAME = 'workbench';
const DB_VERSION = 1;
const STORES = ['todos', 'fitnessLogs', 'fitnessGoals', 'txns', 'installments', 'ledgers', 'meta'];

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('todos')) {
        const s = db.createObjectStore('todos', { keyPath: 'id' });
        s.createIndex('done', 'done');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('fitnessLogs')) {
        const s = db.createObjectStore('fitnessLogs', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('name', 'name');
      }
      if (!db.objectStoreNames.contains('fitnessGoals')) {
        db.createObjectStore('fitnessGoals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('txns')) {
        const s = db.createObjectStore('txns', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('installments')) {
        db.createObjectStore('installments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('ledgers')) {
        db.createObjectStore('ledgers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(store) {
  return reqToPromise((await tx(store)).getAll());
}

async function getById(store, id) {
  return reqToPromise((await tx(store)).get(id));
}

async function put(store, value) {
  return reqToPromise((await tx(store, 'readwrite')).put(value));
}

async function del(store, id) {
  return reqToPromise((await tx(store, 'readwrite')).delete(id));
}

async function clearStore(store) {
  return reqToPromise((await tx(store, 'readwrite')).clear());
}

async function putMany(store, values) {
  const s = await tx(store, 'readwrite');
  await Promise.all(values.map((v) => reqToPromise(s.put(v))));
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthStr(d = new Date()) {
  return todayStr(d).slice(0, 7);
}

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asStr(v, dflt = '') {
  if (v == null) return dflt;
  return String(v);
}

function asNum(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function asId(v) {
  if (typeof v === 'string' && v) return v.slice(0, 64);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function asDateStr(v) {
  const s = asStr(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function normalizeImport(key, item) {
  if (!item || typeof item !== 'object') return null;
  const id = asId(item.id);
  if (!id) return null;
  switch (key) {
    case 'todos':
      return {
        id,
        title: asStr(item.title).slice(0, 120),
        note: asStr(item.note).slice(0, 500),
        done: !!item.done,
        createdAt: asNum(item.createdAt, Date.now()),
        completedAt: item.completedAt == null ? null : asNum(item.completedAt, null),
        priority: ['low', 'normal', 'high'].includes(item.priority) ? item.priority : 'normal',
        tags: Array.isArray(item.tags) ? item.tags.map((t) => asStr(t).slice(0, 32)) : []
      };
    case 'fitnessLogs':
      return {
        id,
        type: ['reps', 'steps', 'custom'].includes(item.type) ? item.type : 'reps',
        name: asStr(item.name).slice(0, 50) || '记录',
        value: asNum(item.value, 0),
        unit: asStr(item.unit).slice(0, 20) || '次',
        date: asDateStr(item.date) || todayStr(),
        createdAt: asNum(item.createdAt, Date.now()),
        note: asStr(item.note).slice(0, 200)
      };
    case 'fitnessGoals':
      return {
        id,
        scope: item.scope === 'longterm' ? 'longterm' : 'daily',
        name: asStr(item.name).slice(0, 50) || '目标',
        target: asNum(item.target, 0),
        unit: asStr(item.unit).slice(0, 20) || '次',
        type: ['reps', 'steps', 'custom'].includes(item.type) ? item.type : 'reps',
        createdAt: asNum(item.createdAt, Date.now())
      };
    case 'txns':
      return {
        id,
        kind: item.kind === 'income' ? 'income' : 'expense',
        amount: asNum(item.amount, 0),
        category: asStr(item.category).slice(0, 30) || '其他',
        note: asStr(item.note).slice(0, 100),
        date: asDateStr(item.date) || todayStr(),
        createdAt: asNum(item.createdAt, Date.now())
      };
    case 'installments': {
      const totalAmount = asNum(item.totalAmount, 0);
      const totalCount = Math.max(1, Math.floor(asNum(item.totalCount, 1)));
      const paidCount = Math.min(totalCount, Math.max(0, Math.floor(asNum(item.paidCount, 0))));
      return {
        id,
        title: asStr(item.title).slice(0, 50) || '分期',
        totalAmount,
        paidCount,
        totalCount,
        monthlyAmount: asNum(item.monthlyAmount, 0),
        startDate: asDateStr(item.startDate) || todayStr(),
        note: asStr(item.note).slice(0, 200),
        closed: !!item.closed || paidCount >= totalCount
      };
    }
    case 'ledgers': {
      const amount = asNum(item.amount, 0);
      const repaid = Math.min(amount, Math.max(0, asNum(item.repaid, 0)));
      return {
        id,
        direction: item.direction === 'lend' ? 'lend' : 'borrow',
        party: asStr(item.party).slice(0, 50) || '对方',
        amount,
        date: asDateStr(item.date) || todayStr(),
        dueDate: asDateStr(item.dueDate),
        repaid,
        note: asStr(item.note).slice(0, 200),
        closed: !!item.closed || (amount > 0 && repaid >= amount - 0.001)
      };
    }
    default:
      return null;
  }
}

async function exportAll() {
  const [todos, fitnessLogs, fitnessGoals, txns, installments, ledgers] = await Promise.all(
    STORES.filter((s) => s !== 'meta').map((s) => getAll(s))
  );
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: { todos, fitnessLogs, fitnessGoals, txns, installments, ledgers }
  };
}

const DATA_KEYS = ['todos', 'fitnessLogs', 'fitnessGoals', 'txns', 'installments', 'ledgers'];

async function importAll(payload, mode = 'merge') {
  if (!payload || typeof payload !== 'object') throw new Error('invalid');
  if (payload.schemaVersion !== 1 || !payload.data || typeof payload.data !== 'object') {
    throw new Error('invalid');
  }
  const data = payload.data;
  // 先校验并规范化，失败时绝不清空现有数据
  const normalized = {};
  for (const key of DATA_KEYS) {
    const arr = Array.isArray(data[key]) ? data[key] : [];
    normalized[key] = arr.map((item) => normalizeImport(key, item)).filter(Boolean);
  }
  if (mode === 'overwrite') {
    for (const key of DATA_KEYS) {
      await clearStore(key);
    }
  }
  for (const key of DATA_KEYS) {
    const existing = mode === 'merge' ? await getAll(key) : [];
    const map = new Map(existing.map((x) => [x.id, x]));
    for (const item of normalized[key]) {
      map.set(item.id, item);
    }
    await putMany(key, [...map.values()]);
  }
}

async function wipeAll() {
  for (const key of STORES) await clearStore(key);
}

const DB = {
  openDB, getAll, getById, put, del, clearStore, putMany,
  uid, todayStr, monthStr, parseAmount, sumBy, progressPct, escapeHtml,
  exportAll, importAll, wipeAll, STORES
};

if (typeof window !== 'undefined') {
  window.DB = DB;
  window.escapeHtml = escapeHtml;
}
