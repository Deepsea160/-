
/* ========== utils ========== */
const STORES = ['skills','studyLogs','fitnessLogs','fitnessGoals','txns','installments','ledgers','meta'];
const DATA_KEYS = ['skills','studyLogs','fitnessLogs','fitnessGoals','txns','installments','ledgers'];
let _db = null;

function uid(){ return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9); }
function todayStr(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function monthStr(d=new Date()){ return todayStr(d).slice(0,7); }
function parseAmount(v){ const n=Number(v); return Number.isFinite(n)?Math.round(n*100)/100:null; }
function asNum(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
function asStr(v,d=''){ return typeof v==='string'?v:(v==null?d:String(v)); }
function asId(v){
  if(typeof v==='string'&&v) return v.slice(0,64);
  if(typeof v==='number'&&Number.isFinite(v)) return String(v);
  return null;
}
function asDateStr(v){
  const s=asStr(v).slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sumBy(list,fn){
  return list.reduce((a,x)=>{ const n=Number(fn(x)); return a+(Number.isFinite(n)?n:0); },0);
}
function progressPct(cur, tgt){
  const c=Number(cur), t=Number(tgt);
  if(!Number.isFinite(c)||!Number.isFinite(t)||t<=0) return 0;
  return Math.min(100, Math.round((c/t)*1000)/10);
}
function fmtMoney(n){ return (Number(n)||0).toFixed(2); }
function daysBetween(a,b){
  const da=new Date(a+'T00:00:00'), db=new Date(b+'T00:00:00');
  return Math.round((db-da)/86400000);
}
function addDays(dateStr, n){
  const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return todayStr(d);
}

function openDB(){
  if(_db) return Promise.resolve(_db);
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('workbench',2);
    req.onupgradeneeded=()=>{
      const db=req.result;
      const ensure=(name, idx)=>{
        if(!db.objectStoreNames.contains(name)){
          const s=db.createObjectStore(name,{keyPath:'id'});
          (idx||[]).forEach(i=>s.createIndex(i,i));
        }
      };
      ensure('skills',['name']);
      ensure('studyLogs',['date','skillId']);
      ensure('fitnessLogs',['date','name']);
      ensure('fitnessGoals',[]);
      ensure('txns',['date','kind']);
      ensure('installments',[]);
      ensure('ledgers',[]);
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
    };
    req.onsuccess=()=>{_db=req.result;resolve(_db);};
    req.onerror=()=>reject(req.error);
  });
}
function reqP(req){ return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);}); }
async function getAll(store){ return reqP((await openDB()).transaction(store).objectStore(store).getAll()); }
async function getById(store,id){ return reqP((await openDB()).transaction(store).objectStore(store).get(id)); }
async function put(store,val){ return reqP((await openDB()).transaction(store,'readwrite').objectStore(store).put(val)); }
async function del(store,id){ return reqP((await openDB()).transaction(store,'readwrite').objectStore(store).delete(id)); }
async function clearStore(store){ return reqP((await openDB()).transaction(store,'readwrite').objectStore(store).clear()); }
async function putMany(store,vals){
  const s=(await openDB()).transaction(store,'readwrite').objectStore(store);
  await Promise.all(vals.map(v=>reqP(s.put(v))));
}
function normalizeImport(key,item){
  if(!item||typeof item!=='object') return null;
  const id=asId(item.id); if(!id) return null;
  switch(key){
    case 'skills': return {
      id, name:asStr(item.name).slice(0,40)||'技能',
      color:asStr(item.color).slice(0,20)||'#2DB89A',
      proficiency:Math.min(100,Math.max(0,asNum(item.proficiency,0))),
      totalMinutes:Math.max(0,asNum(item.totalMinutes,0)),
      streak:Math.max(0,Math.floor(asNum(item.streak,0))),
      bestStreak:Math.max(0,Math.floor(asNum(item.bestStreak,0))),
      lastStudyDate:asDateStr(item.lastStudyDate),
      createdAt:asNum(item.createdAt,Date.now()),
      note:asStr(item.note).slice(0,200)
    };
    case 'studyLogs': return {
      id, skillId:asId(item.skillId)||'',
      minutes:Math.max(1,Math.floor(asNum(item.minutes,1))),
      date:asDateStr(item.date)||todayStr(),
      createdAt:asNum(item.createdAt,Date.now()),
      note:asStr(item.note).slice(0,200)
    };
    case 'fitnessLogs': return {
      id, type:['reps','steps','custom'].includes(item.type)?item.type:'reps',
      name:asStr(item.name).slice(0,50)||'记录',
      value:asNum(item.value,0), unit:asStr(item.unit).slice(0,20)||'次',
      date:asDateStr(item.date)||todayStr(),
      createdAt:asNum(item.createdAt,Date.now()), note:asStr(item.note).slice(0,200)
    };
    case 'fitnessGoals': return {
      id, scope:item.scope==='longterm'?'longterm':'daily',
      name:asStr(item.name).slice(0,50)||'目标',
      target:asNum(item.target,0), unit:asStr(item.unit).slice(0,20)||'次',
      type:['reps','steps','custom'].includes(item.type)?item.type:'reps',
      createdAt:asNum(item.createdAt,Date.now())
    };
    case 'txns': return {
      id, kind:item.kind==='income'?'income':'expense',
      amount:asNum(item.amount,0),
      category:asStr(item.category).slice(0,30)||'其他',
      account:asStr(item.account).slice(0,30)||'默认',
      note:asStr(item.note).slice(0,100),
      date:asDateStr(item.date)||todayStr(),
      createdAt:asNum(item.createdAt,Date.now())
    };
    case 'installments': {
      const totalAmount=asNum(item.totalAmount,0);
      const totalCount=Math.max(1,Math.floor(asNum(item.totalCount,1)));
      const paidCount=Math.min(totalCount,Math.max(0,Math.floor(asNum(item.paidCount,0))));
      return {
        id, title:asStr(item.title).slice(0,50)||'分期',
        totalAmount, paidCount, totalCount,
        monthlyAmount:asNum(item.monthlyAmount,0),
        startDate:asDateStr(item.startDate)||todayStr(),
        note:asStr(item.note).slice(0,200),
        closed:!!item.closed||paidCount>=totalCount
      };
    }
    case 'ledgers': {
      const amount=asNum(item.amount,0);
      const repaid=Math.min(amount,Math.max(0,asNum(item.repaid,0)));
      return {
        id, direction:item.direction==='lend'?'lend':'borrow',
        party:asStr(item.party).slice(0,50)||'对方',
        amount, date:asDateStr(item.date)||todayStr(),
        dueDate:asDateStr(item.dueDate),
        repaid, note:asStr(item.note).slice(0,200),
        closed:!!item.closed||(amount>0&&repaid>=amount-0.001)
      };
    }
    default: return null;
  }
}
async function exportAll(){
  const pairs = await Promise.all(DATA_KEYS.map(k=>getAll(k)));
  const data={}; DATA_KEYS.forEach((k,i)=>data[k]=pairs[i]);
  return { schemaVersion:2, exportedAt:new Date().toISOString(), data };
}
async function importAll(payload, mode='merge'){
  if(!payload||typeof payload!=='object') throw new Error('invalid');
  if(![1,2].includes(payload.schemaVersion)||!payload.data||typeof payload.data!=='object') throw new Error('invalid');
  const normalized={};
  for(const key of DATA_KEYS){
    const arr=Array.isArray(payload.data[key])?payload.data[key]:[];
    normalized[key]=arr.map(it=>normalizeImport(key,it)).filter(Boolean);
  }
  if(mode==='overwrite'){ for(const key of DATA_KEYS) await clearStore(key); }
  for(const key of DATA_KEYS){
    const existing=mode==='merge'?await getAll(key):[];
    const map=new Map(existing.map(x=>[x.id,x]));
    for(const it of normalized[key]) map.set(it.id,it);
    await putMany(key,[...map.values()]);
  }
}
async function wipeAll(){ for(const k of STORES) await clearStore(k); }

/* ========== learning proficiency ========== */
function calcStreak(logs, today){
  const dates=[...new Set(logs.map(l=>l.date))].sort();
  if(!dates.length) return 0;
  const last=dates[dates.length-1];
  if(last!==today && last!==addDays(today,-1)) return 0;
  let streak=1, cursor=last;
  const set=new Set(dates);
  while(set.has(addDays(cursor,-1))){ streak++; cursor=addDays(cursor,-1); }
  return streak;
}
function skillGain(minutes, streak){
  const base=minutes/25;
  const streakBonus=Math.min(2, streak*0.12);
  const dailyCap=6+streakBonus;
  return Math.min(base+streakBonus*0.5, dailyCap);
}

/* ========== App shell ========== */
const App={
  route:'learn',
  main:null,
  titles:{learn:'学习', fitness:'运动', finance:'账本', settings:'设置'},
  async init(){
    this.main=document.getElementById('main');
    await openDB();
    document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>this.navigate(t.dataset.route)));
    document.getElementById('btn-settings').addEventListener('click',()=>this.navigate('settings'));
    window.addEventListener('hashchange',()=>this.readHash());
    this.readHash();
    this.registerSW();
  },
  readHash(){
    const h=(location.hash||'#/learn').replace(/^#\/?/,'')||'learn';
    const route=['learn','fitness','finance','settings'].includes(h)?h:'learn';
    this.navigate(route,true);
  },
  navigate(route,skipHash){
    this.route=route;
    if(!skipHash){ const next='#/'+route; if(location.hash!==next) history.replaceState(null,'',next); }
    document.getElementById('page-title').textContent=this.titles[route]||'工作台';
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.route===route));
    this.render();
  },
  async render(){
    if(!this.main) return;
    try{
      if(this.route==='learn') await LearnModule.render(this.main);
      else if(this.route==='fitness') await FitnessModule.render(this.main);
      else if(this.route==='finance') await FinanceModule.render(this.main);
      else await SettingsModule.render(this.main);
      document.getElementById('page-sub').textContent = this.route==='finance'?monthStr()+' · 一木风格': (this.route==='fitness'?'目标 · 记录 · 趋势': (this.route==='learn'?'技能熟练度 · 连续打卡':'本地数据 · 备份迁移'));
    }catch(e){
      console.error(e);
      this.main.innerHTML='<div class="empty">加载失败，请刷新重试</div>';
    }
  },
  toast(msg,ms=1800){
    let el=document.getElementById('toast');
    if(!el){ el=document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
    el.textContent=msg; el.classList.add('show');
    clearTimeout(this._tt); this._tt=setTimeout(()=>el.classList.remove('show'),ms);
  },
  openModal(html,onReady){
    this.closeModal();
    const bd=document.createElement('div');
    bd.className='modal-backdrop'; bd.id='modal-backdrop';
    bd.innerHTML='<div class="modal">'+html+'</div>';
    document.body.appendChild(bd);
    bd.addEventListener('click',e=>{ if(e.target===bd) this.closeModal(); });
    bd.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>this.closeModal()));
    if(onReady) onReady(bd.querySelector('.modal'));
  },
  closeModal(){ const el=document.getElementById('modal-backdrop'); if(el) el.remove(); },
  async safe(op,msg){
    try{ return await op(); }
    catch(e){ console.error(e); this.toast(msg||'保存失败'); throw e; }
  },
  registerSW(){
    if(!('serviceWorker' in navigator)) return;
    if(location.protocol!=='http:'&&location.protocol!=='https:') return;
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
};

/* ========== Learn ========== */
const LearnModule={
  filterSkill:null,
  async render(root){
    const [skills, logs]=await Promise.all([getAll('skills'), getAll('studyLogs')]);
    const today=todayStr();
    const todayLogs=logs.filter(l=>l.date===today);
    const todayMin=sumBy(todayLogs,l=>l.minutes);
    const weekMin=sumBy(logs.filter(l=>daysBetween(l.date,today)<7&&daysBetween(l.date,today)>=0),l=>l.minutes);

    root.innerHTML=`
      <div class="summary-row">
        <div class="summary-cell"><div class="k">今日学习</div><div class="v">${todayMin} 分</div></div>
        <div class="summary-cell"><div class="k">近7天</div><div class="v">${weekMin} 分</div></div>
        <div class="summary-cell"><div class="k">技能数</div><div class="v">${skills.length}</div></div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h2 style="margin:0">我的技能</h2>
          <button class="btn sm" id="add-skill" type="button">+ 新技能</button>
        </div>
        ${skills.length===0?'<div class="empty">先添加一个正在学的技能</div>':''}
        ${skills.map(s=>{
          const skillLogs=logs.filter(l=>l.skillId===s.id);
          const streak=calcStreak(skillLogs,today);
          const dayMin=sumBy(skillLogs.filter(l=>l.date===today),l=>l.minutes);
          return `
          <div class="card skill-card" style="margin-bottom:10px;box-shadow:none;background:var(--bg)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div class="name">${escapeHtml(s.name)}</div>
                <div class="meta">
                  <span>连续 ${streak} 天 · 今日 ${dayMin} 分</span>
                  <span>累计 ${Math.round(s.totalMinutes||0)} 分</span>
                </div>
              </div>
              <div class="pct">${(s.proficiency||0).toFixed(1)}%</div>
            </div>
            <div class="progress"><i style="width:${s.proficiency||0}%"></i></div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn sm ghost" data-study="${s.id}" type="button">记学习</button>
              <button class="btn sm plain" data-edit-skill="${s.id}" type="button">编辑</button>
              <button class="btn sm danger" data-del-skill="${s.id}" type="button">删除</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="card">
        <h2>今日记录</h2>
        ${todayLogs.length===0?'<div class="empty">今天还没开始学习</div>':todayLogs.slice().reverse().map(l=>{
          const sk=skills.find(s=>s.id===l.skillId);
          return `<div class="row">
            <div class="grow">
              <div class="title">${escapeHtml(sk?sk.name:'未知技能')} · ${l.minutes} 分钟</div>
              <div class="sub">${new Date(l.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}${l.note?' · '+escapeHtml(l.note):''}</div>
            </div>
            <button class="del-btn" data-del-log="${l.id}" type="button">×</button>
          </div>`;
        }).join('')}
      </div>
      <div class="card">
        <h2>近 7 天学习时长</h2>
        <div class="chart-wrap"><canvas id="learn-chart" width="760" height="320"></canvas></div>
      </div>
    `;

    root.querySelector('#add-skill').addEventListener('click',()=>this.openSkillForm());
    root.querySelectorAll('[data-study]').forEach(b=>b.addEventListener('click',()=>this.openStudy(b.dataset.study)));
    root.querySelectorAll('[data-edit-skill]').forEach(b=>b.addEventListener('click',()=>this.openSkillForm(b.dataset.editSkill)));
    root.querySelectorAll('[data-del-skill]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('删除该技能及其学习记录？')) return;
      const id=b.dataset.delSkill;
      await del('skills',id);
      for(const l of (await getAll('studyLogs')).filter(x=>x.skillId===id)) await del('studyLogs',l.id);
      App.toast('已删除'); App.render();
    }));
    root.querySelectorAll('[data-del-log]').forEach(b=>b.addEventListener('click',async()=>{
      await del('studyLogs',b.dataset.delLog); App.render();
    }));

    this.drawChart(document.getElementById('learn-chart'), logs);
  },
  drawChart(canvas, logs){
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const days=[];
    for(let i=6;i>=0;i--){ const d=addDays(todayStr(),-i); days.push({date:d, min:sumBy(logs.filter(l=>l.date===d),l=>l.minutes)}); }
    const max=Math.max(30,...days.map(d=>d.min));
    const padL=36,padR=10,padT=16,padB=28;
    const cw=(w-padL-padR)/days.length;
    ctx.fillStyle='#8A9399'; ctx.font='20px sans-serif';
    days.forEach((d,i)=>{
      const bh=(d.min/max)*(h-padT-padB);
      const x=padL+i*cw+cw*0.25, y=h-padB-bh, bw=cw*0.5;
      ctx.fillStyle='#2DB89A';
      ctx.beginPath(); ctx.roundRect(x,y,bw,Math.max(4,bh),6); ctx.fill();
      ctx.fillStyle='#8A9399'; ctx.font='18px sans-serif'; ctx.textAlign='center';
      ctx.fillText(d.date.slice(5), x+bw/2, h-8);
      if(d.min) { ctx.fillStyle='#1C2124'; ctx.fillText(String(d.min), x+bw/2, y-6); }
    });
  },
  openSkillForm(id){
    const isEdit=!!id;
    App.openModal(`
      <h3>${isEdit?'编辑技能':'新建技能'}</h3>
      <div class="form-row"><label>名称</label><input class="field" id="sk-name" placeholder="如：英语 / Python / 吉他" maxlength="20" /></div>
      <div class="form-row"><label>备注</label><input class="field" id="sk-note" placeholder="可选" maxlength="50" /></div>
      ${isEdit?'<div class="form-row"><label>熟练度校正 %</label><input class="field" id="sk-prof" type="number" min="0" max="100" step="0.1" /></div>':''}
      <div class="form-actions">
        <button class="btn plain" data-close type="button">取消</button>
        <button class="btn" id="sk-save" type="button">保存</button>
      </div>
    `, async (modal)=>{
      if(isEdit){
        const s=await getById('skills',id);
        if(s){ modal.querySelector('#sk-name').value=s.name; modal.querySelector('#sk-note').value=s.note||''; modal.querySelector('#sk-prof').value=s.proficiency; }
      }
      modal.querySelector('#sk-save').addEventListener('click',async()=>{
        const name=modal.querySelector('#sk-name').value.trim();
        if(!name) return App.toast('请输入技能名称');
        if(isEdit){
          const s=await getById('skills',id);
          s.name=name; s.note=modal.querySelector('#sk-note').value.trim();
          const p=DBp(modal.querySelector('#sk-prof').value); if(p!==null) s.proficiency=Math.min(100,Math.max(0,p));
          await put('skills',s);
        }else{
          await put('skills',{
            id:uid(), name, color:'#2DB89A', proficiency:0, totalMinutes:0,
            streak:0, bestStreak:0, lastStudyDate:'', createdAt:Date.now(),
            note:modal.querySelector('#sk-note').value.trim()
          });
        }
        App.closeModal(); App.toast('已保存'); App.render();
      });
    });
  },
  openStudy(skillId){
    App.openModal(`
      <h3>记录学习</h3>
      <div class="form-row"><label>时长（分钟）</label><input class="field" id="st-min" type="number" inputmode="numeric" min="1" max="600" value="30" /></div>
      <div class="chips" id="st-quick">
        ${[15,25,30,45,60,90].map(m=>`<button class="chip" data-m="${m}" type="button">${m}分</button>`).join('')}
      </div>
      <div class="form-row"><label>备注</label><input class="field" id="st-note" placeholder="可选" maxlength="50" /></div>
      <div class="hint" id="st-preview"></div>
      <div class="form-actions">
        <button class="btn plain" data-close type="button">取消</button>
        <button class="btn" id="st-save" type="button">保存并增加熟练度</button>
      </div>
    `, async (modal)=>{
      const skill=await getById('skills',skillId);
      if(!skill){ App.toast('技能不存在'); App.closeModal(); return; }
      const minEl=modal.querySelector('#st-min');
      const updatePreview=async()=>{
        const logs=(await getAll('studyLogs')).filter(l=>l.skillId===skillId);
        const streak=calcStreak(logs, todayStr());
        const minutes=asNum(minEl.value,0);
        const gain=skillGain(minutes, Math.max(streak,1));
        const next=Math.min(100,(skill.proficiency||0)+gain);
        modal.querySelector('#st-preview').textContent=`预计熟练度 ${(skill.proficiency||0).toFixed(1)}% → ${next.toFixed(1)}%（+${gain.toFixed(2)}）`;
      };
      minEl.addEventListener('input',updatePreview);
      await updatePreview();
      modal.querySelectorAll('#st-quick .chip').forEach(c=>c.addEventListener('click',()=>{
        minEl.value=c.dataset.m; updatePreview();
      }));
      modal.querySelector('#st-save').addEventListener('click',async()=>{
        const minutes=Math.floor(asNum(minEl.value,0));
        if(minutes<1) return App.toast('请输入有效时长');
        const today=todayStr();
        const logs=(await getAll('studyLogs')).filter(l=>l.skillId===skillId);
        const hadToday=logs.some(l=>l.date===today);
        const streakForGain=Math.max(1, calcStreak(hadToday?logs:[...logs,{date:today}], today));
        const gain=skillGain(minutes, streakForGain);
        await put('studyLogs',{ id:uid(), skillId, minutes, date:today, createdAt:Date.now(), note:modal.querySelector('#st-note').value.trim() });
        skill.totalMinutes=asNum(skill.totalMinutes,0)+minutes;
        skill.proficiency=Math.min(100, asNum(skill.proficiency,0)+gain);
        skill.streak=streakForGain;
        skill.bestStreak=Math.max(asNum(skill.bestStreak,0), streakForGain);
        skill.lastStudyDate=today;
        await put('skills', skill);
        App.closeModal();
        App.toast(`熟练度 +${gain.toFixed(2)}%`);
        App.render();
      });
    });
  }
};
function DBp(v){ return parseAmount(v); }

/* ========== Fitness ========== */
const FitnessModule={
  chartMode:'bar',
  async render(root){
    const [logs, goals]=await Promise.all([getAll('fitnessLogs'), getAll('fitnessGoals')]);
    const today=todayStr();
    const todayLogs=logs.filter(l=>l.date===today);
    const dailyGoals=goals.filter(g=>g.scope==='daily');
    const longGoals=goals.filter(g=>g.scope==='longterm');

    const todaySteps=sumBy(todayLogs.filter(l=>l.type==='steps'),l=>l.value);
    const allSteps=sumBy(logs.filter(l=>l.type==='steps'),l=>l.value);
    const stepsGoal=dailyGoals.find(g=>g.type==='steps');
    const stepsLong=longGoals.find(g=>g.type==='steps');

    const repsToday=todayLogs.filter(l=>l.type==='reps');
    const grouped={};
    for(const l of repsToday){
      const key=l.name+'|'+l.unit;
      if(!grouped[key]) grouped[key]={name:l.name,unit:l.unit,value:0};
      grouped[key].value+=asNum(l.value,0);
    }
    const repsGroups=Object.values(grouped);

    root.innerHTML=`
      <!-- 目标区 -->
      <div class="card mint">
        <h2>今日目标</h2>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px">
          <span>步数</span><span>${todaySteps.toLocaleString()}${stepsGoal?' / '+Number(stepsGoal.target).toLocaleString():''}</span>
        </div>
        <div class="progress" style="background:rgba(255,255,255,.25)"><i style="width:${stepsGoal?progressPct(todaySteps,stepsGoal.target):0}%;background:#fff"></i></div>
        <div class="divider" style="background:rgba(255,255,255,.2)"></div>
        ${repsGroups.length===0?'<div style="font-size:13px;opacity:.85">今日动作目标完成情况见下方</div>':repsGroups.map(g=>{
          const goal=dailyGoals.find(x=>x.name===g.name&&x.unit===g.unit&&x.type==='reps');
          const pct=goal?progressPct(g.value,goal.target):null;
          return `<div style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;font-size:13px"><span>${escapeHtml(g.name)}</span><span>${g.value}${escapeHtml(g.unit)}${goal?' / '+goal.target:''}</span></div>
            <div class="progress" style="background:rgba(255,255,255,.25);height:6px"><i style="width:${pct||0}%;background:#fff"></i></div>
          </div>`;
        }).join('')}
      </div>

      <div class="card">
        <h2>长期目标</h2>
        <div class="row" style="border:none;padding-top:0">
          <div class="grow">
            <div class="title">步数累计 ${allSteps.toLocaleString()}${stepsLong?' / '+Number(stepsLong.target).toLocaleString():''}</div>
            <div class="progress"><i style="width:${stepsLong?progressPct(allSteps,stepsLong.target):0}%"></i></div>
          </div>
        </div>
        ${longGoals.filter(g=>g.type!=='steps').map(g=>{
          const allFor=sumBy(logs.filter(l=>l.type==='reps'&&l.name===g.name&&l.unit===g.unit),l=>l.value);
          const pct=progressPct(allFor,g.target);
          return `<div class="row"><div class="grow">
            <div class="title">${escapeHtml(g.name)} ${allFor} / ${g.target} ${escapeHtml(g.unit)}</div>
            <div class="progress"><i style="width:${pct}%"></i></div>
          </div></div>`;
        }).join('')}
        <button class="btn ghost block" id="open-goal" type="button" style="margin-top:8px">管理目标</button>
      </div>

      <!-- 快速记录 -->
      <div class="card">
        <h2>快速记录</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn" data-preset="深蹲|20|次" type="button">深蹲 +20</button>
          <button class="btn" data-preset="俯卧撑|10|个" type="button">俯卧撑 +10</button>
          <button class="btn" data-preset="卷腹|15|个" type="button">卷腹 +15</button>
          <button class="btn ghost" id="open-custom" type="button">自定义</button>
        </div>
        <div style="display:flex;gap:8px">
          <input class="field" id="steps-input" type="number" inputmode="numeric" min="0" step="1" placeholder="今日步数" />
          <button class="btn" id="save-steps" type="button">记步数</button>
        </div>
      </div>

      <!-- 图表 -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h2 style="margin:0">趋势</h2>
          <div class="seg" style="width:160px;margin:0">
            <button type="button" data-cm="bar" class="${this.chartMode==='bar'?'active':''}">柱状</button>
            <button type="button" data-cm="line" class="${this.chartMode==='line'?'active':''}">折线</button>
          </div>
        </div>
        <div class="chips" id="metric-pick">
          <button class="chip active" data-metric="steps" type="button">步数</button>
          <button class="chip" data-metric="reps" type="button">动作总量</button>
        </div>
        <div class="chart-wrap"><canvas id="fit-chart" width="760" height="320"></canvas></div>
      </div>

      <!-- 今日明细 -->
      <div class="card">
        <h2>今日明细</h2>
        ${todayLogs.length===0?'<div class="empty">暂无</div>':todayLogs.slice().reverse().map(l=>`
          <div class="row">
            <div class="grow">
              <div class="title">${escapeHtml(l.name)} · ${l.value} ${escapeHtml(l.unit)}</div>
              <div class="sub">${new Date(l.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div>
            </div>
            <button class="del-btn" data-del-log="${l.id}" type="button">×</button>
          </div>
        `).join('')}
      </div>
    `;

    root.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',async()=>{
      const [name,value,unit]=b.dataset.preset.split('|');
      await put('fitnessLogs',{id:uid(),type:'reps',name,value:Number(value),unit,date:today,createdAt:Date.now(),note:''});
      App.toast(`已记 ${name} +${value}`); App.render();
    }));
    root.querySelector('#open-custom').addEventListener('click',()=>this.openCustom());
    root.querySelector('#open-goal').addEventListener('click',()=>this.openGoal());
    root.querySelector('#save-steps').addEventListener('click',async()=>{
      const v=parseAmount(root.querySelector('#steps-input').value);
      if(v===null||v<0) return App.toast('请输入有效步数');
      const existing=(await getAll('fitnessLogs')).filter(l=>l.type==='steps'&&l.date===today);
      for(const e of existing) await del('fitnessLogs',e.id);
      await put('fitnessLogs',{id:uid(),type:'steps',name:'步数',value:v,unit:'步',date:today,createdAt:Date.now(),note:''});
      App.toast('步数已保存'); App.render();
    });
    root.querySelectorAll('[data-del-log]').forEach(b=>b.addEventListener('click',async()=>{
      await del('fitnessLogs',b.dataset.delLog); App.render();
    }));
    root.querySelectorAll('[data-cm]').forEach(b=>b.addEventListener('click',()=>{
      this.chartMode=b.dataset.cm; App.render();
    }));

    let metric='steps';
    root.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{
      metric=b.dataset.metric;
      root.querySelectorAll('[data-metric]').forEach(x=>x.classList.toggle('active',x===b));
      this.drawChart(document.getElementById('fit-chart'), logs, metric, this.chartMode);
    }));
    this.drawChart(document.getElementById('fit-chart'), logs, metric, this.chartMode);

    const stepsToday=todayLogs.filter(l=>l.type==='steps');
    if(stepsToday.length) root.querySelector('#steps-input').value=sumBy(stepsToday,l=>l.value);
  },
  drawChart(canvas, logs, metric, mode){
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const days=[];
    for(let i=13;i>=0;i--){
      const d=addDays(todayStr(),-i);
      const dayLogs=logs.filter(l=>l.date===d);
      let val=0;
      if(metric==='steps') val=sumBy(dayLogs.filter(l=>l.type==='steps'),l=>l.value);
      else val=sumBy(dayLogs.filter(l=>l.type==='reps'),l=>l.value);
      days.push({date:d,val});
    }
    const max=Math.max(1,...days.map(d=>d.val));
    const padL=40,padR=12,padT=20,padB=32;
    const plotW=w-padL-padR, plotH=h-padT-padB;
    if(mode==='bar'){
      const cw=plotW/days.length;
      days.forEach((d,i)=>{
        const bh=(d.val/max)*plotH;
        const x=padL+i*cw+cw*0.2, y=padT+plotH-bh, bw=cw*0.6;
        ctx.fillStyle='#2DB89A';
        ctx.beginPath(); ctx.roundRect(x,y,bw,Math.max(3,bh),4); ctx.fill();
        if(i%2===0){ ctx.fillStyle='#8A9399'; ctx.font='16px sans-serif'; ctx.textAlign='center';
          ctx.fillText(d.date.slice(8), x+bw/2, h-10); }
      });
    }else{
      ctx.strokeStyle='#2DB89A'; ctx.lineWidth=4; ctx.lineJoin='round'; ctx.beginPath();
      days.forEach((d,i)=>{
        const x=padL+(i/(days.length-1))*plotW;
        const y=padT+plotH-(d.val/max)*plotH;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();
      days.forEach((d,i)=>{
        const x=padL+(i/(days.length-1))*plotW;
        const y=padT+plotH-(d.val/max)*plotH;
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#2DB89A'; ctx.lineWidth=3; ctx.stroke();
        if(i%3===0){ ctx.fillStyle='#8A9399'; ctx.font='16px sans-serif'; ctx.textAlign='center';
          ctx.fillText(d.date.slice(5), x, h-10); }
      });
    }
    ctx.fillStyle='#8A9399'; ctx.font='16px sans-serif'; ctx.textAlign='right';
    ctx.fillText(String(Math.round(max)), padL-6, padT+12);
  },
  openCustom(){
    App.openModal(`
      <h3>自定义动作</h3>
      <div class="form-row"><label>名称</label><input class="field" id="f-name" placeholder="如：波比跳" /></div>
      <div class="form-row"><label>数量</label><input class="field" id="f-val" type="number" inputmode="decimal" min="0" /></div>
      <div class="form-row"><label>单位</label><input class="field" id="f-unit" value="次" /></div>
      <div class="form-actions">
        <button class="btn plain" data-close type="button">取消</button>
        <button class="btn" id="f-save" type="button">保存</button>
      </div>
    `,(modal)=>{
      modal.querySelector('#f-save').addEventListener('click',async()=>{
        const name=modal.querySelector('#f-name').value.trim();
        const val=parseAmount(modal.querySelector('#f-val').value);
        const unit=modal.querySelector('#f-unit').value.trim()||'次';
        if(!name||val===null||val<=0) return App.toast('请填写完整');
        await put('fitnessLogs',{id:uid(),type:'reps',name,value:val,unit,date:todayStr(),createdAt:Date.now(),note:''});
        App.closeModal(); App.toast('已记录'); App.render();
      });
    });
  },
  openGoal(){
    App.openModal(`
      <h3>设置目标</h3>
      <div class="form-row"><label>类型</label>
        <select class="field" id="g-type"><option value="steps">步数</option><option value="reps">次数动作</option></select>
      </div>
      <div class="form-row"><label>名称</label><input class="field" id="g-name" placeholder="步数或动作名" /></div>
      <div class="form-row"><label>目标值</label><input class="field" id="g-target" type="number" inputmode="numeric" min="1" /></div>
      <div class="form-row"><label>单位</label><input class="field" id="g-unit" value="次" /></div>
      <div class="form-row"><label>范围</label>
        <select class="field" id="g-scope"><option value="daily">今日目标</option><option value="longterm">长期目标</option></select>
      </div>
      <div class="form-actions">
        <button class="btn plain" data-close type="button">取消</button>
        <button class="btn" id="g-save" type="button">保存</button>
      </div>
      <div class="divider"></div>
      <div id="goal-list"></div>
    `,(modal)=>{
      const typeSel=modal.querySelector('#g-type');
      const nameEl=modal.querySelector('#g-name');
      const unitEl=modal.querySelector('#g-unit');
      typeSel.addEventListener('change',()=>{
        if(typeSel.value==='steps'){ nameEl.value='步数'; unitEl.value='步'; }
        else { if(nameEl.value==='步数') nameEl.value=''; unitEl.value='次'; }
      });
      const refresh=async()=>{
        const goals=await getAll('fitnessGoals');
        modal.querySelector('#goal-list').innerHTML=goals.length===0?'<div class="empty">暂无目标</div>':goals.map(g=>`
          <div class="row"><div class="grow">
            <div class="title">${escapeHtml(g.name)} · ${g.target} ${escapeHtml(g.unit)}</div>
            <div class="sub">${g.scope==='daily'?'今日':'长期'}</div>
          </div><button class="del-btn" data-gdel="${g.id}" type="button">×</button></div>
        `).join('');
        modal.querySelectorAll('[data-gdel]').forEach(b=>b.addEventListener('click',async()=>{
          await del('fitnessGoals',b.dataset.gdel); await refresh();
        }));
      };
      refresh();
      modal.querySelector('#g-save').addEventListener('click',async()=>{
        const type=typeSel.value;
        const name=nameEl.value.trim()||(type==='steps'?'步数':'');
        const target=parseAmount(modal.querySelector('#g-target').value);
        const unit=unitEl.value.trim()||(type==='steps'?'步':'次');
        const scope=modal.querySelector('#g-scope').value;
        if(!name||!target||target<=0) return App.toast('请填写完整');
        const goals=await getAll('fitnessGoals');
        for(const g of goals) if(g.scope===scope&&g.type===type&&g.name===name&&g.unit===unit) await del('fitnessGoals',g.id);
        await put('fitnessGoals',{id:uid(),scope,name,target,unit,type,createdAt:Date.now()});
        App.toast('目标已保存'); await refresh();
      });
    });
  }
};

/* ========== Finance (一木风格) ========== */
const CAT_META={
  '餐饮':{ico:'🍜',cls:'cat-food'},
  '交通':{ico:'🚇',cls:'cat-transit'},
  '购物':{ico:'🛍️',cls:'cat-shop'},
  '居住':{ico:'🏠',cls:'cat-home'},
  '娱乐':{ico:'🎮',cls:'cat-fun'},
  '医疗':{ico:'💊',cls:'cat-med'},
  '工资':{ico:'💼',cls:'cat-salary'},
  '奖金':{ico:'🎁',cls:'cat-salary'},
  '其他':{ico:'•',cls:'cat-other'},
  '分期':{ico:'📅',cls:'cat-debt'},
  '借贷':{ico:'🤝',cls:'cat-debt'}
};
function catMeta(c){ return CAT_META[c]||CAT_META['其他']; }

const FinanceModule={
  tab:'txns',
  month:monthStr(),
  async render(root){
    const [txns, installments, ledgers]=await Promise.all([getAll('txns'),getAll('installments'),getAll('ledgers')]);
    const m=this.month;
    const monthTx=txns.filter(t=>(t.date||'').startsWith(m));
    const income=sumBy(monthTx.filter(t=>t.kind==='income'),t=>t.amount);
    const expense=sumBy(monthTx.filter(t=>t.kind==='expense'),t=>t.amount);
    const balance=income-expense;

    const months=[];
    for(let i=0;i<6;i++){
      const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
      months.push(monthStr(d));
    }

    root.innerHTML=`
      <div class="month-bar">
        ${months.map(mm=>`<button class="chip ${mm===m?'active':''}" data-month="${mm}" type="button">${mm.slice(5)}月</button>`).join('')}
      </div>
      <div class="summary-row">
        <div class="summary-cell"><div class="k">月支出</div><div class="v">${fmtMoney(expense)}</div></div>
        <div class="summary-cell"><div class="k">月收入</div><div class="v">${fmtMoney(income)}</div></div>
        <div class="summary-cell"><div class="k">月结余</div><div class="v">${fmtMoney(balance)}</div></div>
      </div>
      <div class="sub-tabs">
        <div class="chips" style="margin:0;flex:1">
          ${[['txns','流水'],['install','分期'],['ledger','借贷'],['stat','统计']].map(([k,l])=>
            `<button class="chip ${this.tab===k?'active':''}" data-ftab="${k}" type="button">${l}</button>`).join('')}
        </div>
        <button class="btn" id="open-txn" type="button">记一笔</button>
      </div>
      ${this.tab==='txns'?this.txnsHTML(txns,m):''}
      ${this.tab==='install'?this.installHTML(installments):''}
      ${this.tab==='ledger'?this.ledgerHTML(ledgers):''}
      ${this.tab==='stat'?this.statHTML(monthTx):''}
    `;

    root.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click',()=>{ this.month=b.dataset.month; App.render(); }));
    root.querySelectorAll('[data-ftab]').forEach(b=>b.addEventListener('click',()=>{ this.tab=b.dataset.ftab; App.render(); }));
    root.querySelector('#open-txn').addEventListener('click',()=>this.openTxn());
    const ai=root.querySelector('#add-install'); if(ai) ai.addEventListener('click',()=>this.openInstall());
    const al=root.querySelector('#add-ledger'); if(al) al.addEventListener('click',()=>this.openLedger());
    root.querySelectorAll('[data-pay-one]').forEach(b=>b.addEventListener('click',async()=>{
      const item=await getById('installments',b.dataset.payOne);
      if(!item||item.closed) return;
      item.paidCount=Math.min(item.totalCount,(item.paidCount||0)+1);
      if(item.paidCount>=item.totalCount) item.closed=true;
      await put('installments',item); App.toast('已记 1 期'); App.render();
    }));
    root.querySelectorAll('[data-repay]').forEach(b=>b.addEventListener('click',async()=>{
      const item=await getById('ledgers',b.dataset.repay); if(!item) return;
      const rest=Math.max(0,item.amount-(item.repaid||0));
      const v=prompt('还款/收款金额（剩余 ¥'+rest.toFixed(2)+'）', String(rest));
      if(v===null) return;
      const amount=parseAmount(v); if(amount===null||amount<0) return App.toast('金额无效');
      item.repaid=Math.min(item.amount,(item.repaid||0)+amount);
      if(item.repaid>=item.amount-0.001) item.closed=true;
      await put('ledgers',item); App.toast('已更新'); App.render();
    }));
    root.querySelectorAll('[data-del-finance]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('确认删除？')) return;
      await del(b.dataset.store,b.dataset.delFinance); App.render();
    }));
  },
  txnsHTML(txns,m){
    const monthTx=txns.filter(t=>(t.date||'').startsWith(m)).sort((a,b)=>{
      if(a.date===b.date) return (b.createdAt||0)-(a.createdAt||0);
      return (b.date||'').localeCompare(a.date||'');
    });
    if(!monthTx.length) return '<div class="card"><div class="empty">本月还没有账目</div></div>';
    const byDay={};
    monthTx.forEach(t=>{ (byDay[t.date]=byDay[t.date]||[]).push(t); });
    return Object.keys(byDay).sort().reverse().map(date=>{
      const list=byDay[date];
      const dayIn=sumBy(list.filter(t=>t.kind==='income'),t=>t.amount);
      const dayOut=sumBy(list.filter(t=>t.kind==='expense'),t=>t.amount);
      return `<div class="list-group">
        <div class="day-head" style="padding:10px 0 0"><span>${date}</span><span>收 ${fmtMoney(dayIn)} · 支 ${fmtMoney(dayOut)}</span></div>
        ${list.map(t=>{
          const cm=catMeta(t.category);
          return `<div class="row">
            <div class="cat-icon ${cm.cls}">${cm.ico}</div>
            <div class="grow">
              <div class="title">${escapeHtml(t.category)}</div>
              <div class="sub">${escapeHtml(t.note||t.account||'')}</div>
            </div>
            <div class="amount ${t.kind}" style="margin-right:4px">${t.kind==='income'?'+':'-'}${fmtMoney(t.amount)}</div>
            <button class="del-btn" data-del-finance="${t.id}" data-store="txns" type="button">×</button>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  },
  installHTML(all){
    const open=all.filter(i=>!i.closed);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h2 style="margin:0">分期（进行中 ${open.length}）</h2>
        <button class="btn sm" id="add-install" type="button">新增</button>
      </div>
      ${all.length===0?'<div class="empty">暂无分期</div>':all.slice().reverse().map(i=>{
        const paid=(i.paidCount||0)*(i.monthlyAmount||0);
        const rest=Math.max(0,i.totalAmount-paid);
        const pct=progressPct(paid,i.totalAmount);
        return `<div class="row">
          <div class="grow">
            <div class="title">${escapeHtml(i.title)} ${i.closed?'<span class="badge">已结清</span>':''}</div>
            <div class="sub">共 ${i.totalCount} 期 · 每期 ¥${fmtMoney(i.monthlyAmount)} · 已还 ${i.paidCount||0} 期</div>
            <div class="sub">剩余 ¥${fmtMoney(rest)} / ¥${fmtMoney(i.totalAmount)}</div>
            <div class="progress expense"><i style="width:${pct}%"></i></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${!i.closed?`<button class="btn sm" data-pay-one="${i.id}" type="button">还1期</button>`:''}
            <button class="del-btn" data-del-finance="${i.id}" data-store="installments" type="button">×</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  },
  ledgerHTML(all){
    const open=all.filter(l=>!l.closed);
    const borrowSum=sumBy(open.filter(l=>l.direction==='borrow'),l=>Math.max(0,l.amount-(l.repaid||0)));
    const lendSum=sumBy(open.filter(l=>l.direction==='lend'),l=>Math.max(0,l.amount-(l.repaid||0)));
    return `
      <div class="stat-grid">
        <div class="stat"><div class="label">借入未还</div><div class="value">${fmtMoney(borrowSum)}</div></div>
        <div class="stat"><div class="label">借出未收</div><div class="value">${fmtMoney(lendSum)}</div></div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h2 style="margin:0">借贷台账</h2>
          <button class="btn sm" id="add-ledger" type="button">新增</button>
        </div>
        ${all.length===0?'<div class="empty">暂无记录</div>':all.slice().reverse().map(l=>{
          const rest=Math.max(0,l.amount-(l.repaid||0));
          return `<div class="row">
            <div class="grow">
              <div class="title">${l.direction==='borrow'?'借入':'借出'} · ${escapeHtml(l.party)} ${l.closed?'<span class="badge">已结清</span>':''}</div>
              <div class="sub">${l.date}${l.dueDate?' → '+l.dueDate:''} · 未结 ¥${fmtMoney(rest)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              ${!l.closed?`<button class="btn sm ghost" data-repay="${l.id}" type="button">还款</button>`:''}
              <button class="del-btn" data-del-finance="${l.id}" data-store="ledgers" type="button">×</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  },
  statHTML(monthTx){
    const expenseTx=monthTx.filter(t=>t.kind==='expense');
    const incomeTx=monthTx.filter(t=>t.kind==='income');
    const byCat={};
    expenseTx.forEach(t=>{
      if(!byCat[t.category]) byCat[t.category]={amount:0,count:0};
      byCat[t.category].amount+=asNum(t.amount,0);
      byCat[t.category].count++;
    });
    const totalOut=sumBy(expenseTx,t=>t.amount);
    const cats=Object.entries(byCat).sort((a,b)=>b[1].amount-a[1].amount);
    return `
      <div class="card">
        <h2>支出分类占比</h2>
        ${cats.length===0?'<div class="empty">本月无支出</div>':cats.map(([name,v])=>{
          const pct=totalOut?Math.round(v.amount/totalOut*1000)/10:0;
          const cm=catMeta(name);
          return `<div class="row">
            <div class="cat-icon ${cm.cls}">${cm.ico}</div>
            <div class="grow">
              <div class="title">${escapeHtml(name)} <span style="color:var(--muted);font-weight:400;font-size:12px">${v.count}笔 · ${pct}%</span></div>
              <div class="progress expense" style="margin-top:6px"><i style="width:${pct}%"></i></div>
            </div>
            <div class="amount expense">-${fmtMoney(v.amount)}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="card">
        <h2>本月概览</h2>
        <div class="row"><div class="grow"><div class="title">支出笔数</div></div><div>${expenseTx.length}</div></div>
        <div class="row"><div class="grow"><div class="title">收入笔数</div></div><div>${incomeTx.length}</div></div>
        <div class="row"><div class="grow"><div class="title">日均支出</div></div><div>${fmtMoney(totalOut/Math.max(1,new Date(Number(this.month.slice(0,4)),Number(this.month.slice(5,7)),0).getDate()))}</div></div>
      </div>
      <div class="chart-wrap" style="background:var(--card);border-radius:16px;padding:12px;height:200px">
        <canvas id="fin-chart" width="760" height="320"></canvas>
      </div>
    `;
  },
  openTxn(){
    App.openModal(`
      <h3>记一笔</h3>
      <div class="seg" id="txn-kind">
        <button type="button" data-kind="expense" class="active">支出</button>
        <button type="button" data-kind="income">收入</button>
      </div>
      <div class="form-row"><label>金额</label><input class="field" id="t-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" /></div>
      <div class="form-row"><label>分类</label>
        <div class="chips" id="t-cats">
          ${Object.keys(CAT_META).filter(c=>!['分期','借贷'].includes(c)).map((c,i)=>
            `<button class="chip ${i===0?'active':''}" data-cat="${c}" type="button">${CAT_META[c].ico} ${c}</button>`).join('')}
        </div>
      </div>
      <div class="form-row"><label>备注</label><input class="field" id="t-note" placeholder="可选" /></div>
      <div class="form-row"><label>日期</label><input class="field" id="t-date" type="date" value="${todayStr()}" /></div>
      <div class="form-actions">
        <button class="btn plain" data-close type="button">取消</button>
        <button class="btn" id="t-save" type="button">保存</button>
      </div>
    `,(modal)=>{
      let kind='expense', category='餐饮';
      modal.querySelectorAll('#txn-kind button').forEach(b=>b.addEventListener('click',()=>{
        kind=b.dataset.kind;
        modal.querySelectorAll('#txn-kind button').forEach(x=>x.classList.toggle('active',x===b));
      }));
      modal.querySelectorAll('#t-cats .chip').forEach(b=>b.addEventListener('click',()=>{
        category=b.dataset.cat;
        modal.querySelectorAll('#t-cats .chip').forEach(x=>x.classList.toggle('active',x===b));
      }));
      modal.querySelector('#t-save').addEventListener('click',async()=>{
        const amount=parseAmount(modal.querySelector('#t-amount').value);
        const note=modal.querySelector('#t-note').value.trim();
        const date=modal.querySelector('#t-date').value||todayStr();
        if(amount===null||amount<=0) return App.toast('请输入有效金额');
        await put('txns',{id:uid(),kind,amount,category,account:'默认',note,date,createdAt:Date.now()});
        this.month=date.slice(0,7);
        App.closeModal(); App.toast('已记账'); App.render();
      });
    });
  },
  openInstall(){
    App.openModal(`
      <h3>新增分期</h3>
      <div class="form-row"><label>名称</label><input class="field" id="i-title" placeholder="如：手机分期" /></div>
      <div class="form-row"><label>总额</label><input class="field" id="i-total" type="number" inputmode="decimal" min="0" step="0.01" /></div>
      <div class="form-row"><label>期数</label><input class="field" id="i-count" type="number" inputmode="numeric" min="1" step="1" /></div>
      <div class="form-row"><label>每期金额</label><input class="field" id="i-monthly" type="number" inputmode="decimal" min="0" step="0.01" /></div>
      <div class="form-row"><label>开始日期</label><input class="field" id="i-start" type="date" value="${todayStr()}" /></div>
      <div class="form-row"><label>已还期数</label><input class="field" id="i-paid" type="number" inputmode="numeric" min="0" step="1" value="0" /></div>
      <div class="form-actions">
        <button class="btn plain" data-close type="button">取消</button>
        <button class="btn" id="i-save" type="button">保存</button>
      </div>
    `,(modal)=>{
      modal.querySelector('#i-save').addEventListener('click',async()=>{
        const title=modal.querySelector('#i-title').value.trim();
        const totalAmount=parseAmount(modal.querySelector('#i-total').value);
        const totalCount=parseInt(modal.querySelector('#i-count').value,10);
        let monthlyAmount=parseAmount(modal.querySelector('#i-monthly').value);
        const startDate=modal.querySelector('#i-start').value||todayStr();
        const paidCount=parseInt(modal.querySelector('#i-paid').value,10)||0;
        if(!title||!totalAmount||totalAmount<=0||!totalCount||totalCount<1) return App.toast('请填写完整');
        if(!monthlyAmount||monthlyAmount<=0) monthlyAmount=Math.round((totalAmount/totalCount)*100)/100;
        await put('installments',{id:uid(),title,totalAmount,paidCount:Math.min(paidCount,totalCount),totalCount,monthlyAmount,startDate,note:'',closed:paidCount>=totalCount});
        App.closeModal(); App.toast('分期已添加'); App.render();
      });
    });
  },
  openLedger(){
    App.openModal(`
      <h3>新增借贷</h3>
      <div class="seg" id="l-dir">
        <button type="button" data-dir="borrow" class="active">借入</button>
        <button type="button" data-dir="lend">借出</button>
      </div>
      <div class="form-row"><label>对方</label><input class="field" id="l-party" placeholder="姓名 / 平台" /></div>
      <div class="form-row"><label>金额</label><input class="field" id="l-amount" type="number" inputmode="decimal" min="0" step="0.01" /></div>
      <div class="form-row"><label>日期</label><input class="field" id="l-date" type="date" value="${todayStr()}" /></div>
      <div class="form-row"><label>约定归还日（可选）</label><input class="field" id="l-due" type="date" /></div>
      <div class="form-row"><label>已还 / 已收</label><input class="field" id="l-repaid" type="number" inputmode="decimal" min="0" step="0.01" value="0" /></div>
      <div class="form-row"><label>备注</label><input class="field" id="l-note" placeholder="可选" /></div>
      <div class="form-actions">
        <button class="btn plain" data-close type="button">取消</button>
        <button class="btn" id="l-save" type="button">保存</button>
      </div>
    `,(modal)=>{
      let direction='borrow';
      modal.querySelectorAll('#l-dir button').forEach(b=>b.addEventListener('click',()=>{
        direction=b.dataset.dir;
        modal.querySelectorAll('#l-dir button').forEach(x=>x.classList.toggle('active',x===b));
      }));
      modal.querySelector('#l-save').addEventListener('click',async()=>{
        const party=modal.querySelector('#l-party').value.trim();
        const amount=parseAmount(modal.querySelector('#l-amount').value);
        const date=modal.querySelector('#l-date').value||todayStr();
        const dueDate=modal.querySelector('#l-due').value||'';
        const repaid=parseAmount(modal.querySelector('#l-repaid').value)||0;
        const note=modal.querySelector('#l-note').value.trim();
        if(!party||amount===null||amount<=0) return App.toast('请填写完整');
        await put('ledgers',{id:uid(),direction,party,amount,date,dueDate,repaid:Math.min(repaid,amount),note,closed:repaid>=amount});
        App.closeModal(); App.toast('已保存'); App.render();
      });
    });
  }
};

/* ========== Settings ========== */
const SettingsModule={
  async render(root){
    const counts={};
    for(const s of DATA_KEYS) counts[s]=(await getAll(s)).length;
    root.innerHTML=`
      <div class="card">
        <h2>数据概况</h2>
        <div class="row"><div class="grow"><div class="title">技能</div></div><div class="sub">${counts.skills}</div></div>
        <div class="row"><div class="grow"><div class="title">学习记录</div></div><div class="sub">${counts.studyLogs}</div></div>
        <div class="row"><div class="grow"><div class="title">运动记录</div></div><div class="sub">${counts.fitnessLogs}</div></div>
        <div class="row"><div class="grow"><div class="title">账目</div></div><div class="sub">${counts.txns}</div></div>
        <div class="row"><div class="grow"><div class="title">分期 / 借贷</div></div><div class="sub">${counts.installments} / ${counts.ledgers}</div></div>
      </div>
      <div class="card">
        <h2>备份与迁移</h2>
        <p class="hint" style="margin:0 0 12px">数据保存在本机浏览器。换设备先导出 JSON，再在新设备导入。</p>
        <button class="btn block" id="btn-export" type="button">导出备份 JSON</button>
        <div style="height:8px"></div>
        <button class="btn plain block" id="btn-import" type="button">导入备份 JSON</button>
        <input type="file" id="import-file" accept="application/json,.json" class="hidden" />
        <div class="seg" id="import-mode" style="margin-top:10px">
          <button type="button" data-mode="merge" class="active">合并</button>
          <button type="button" data-mode="overwrite">覆盖</button>
        </div>
        <button class="btn danger block" id="btn-wipe" type="button">清空全部数据</button>
      </div>
      <div class="card">
        <h2>安装到桌面</h2>
        <p class="hint" style="margin:0"><strong>Android Chrome：</strong>菜单 →「安装应用」。<br/><strong>iOS Safari：</strong>分享 →「添加到主屏幕」。</p>
      </div>
      <div class="card">
        <h2>关于</h2>
        <div class="hint">工作台 v2 · 学习 / 运动 / 账本 · 本地优先<br/>账本视觉参考一木记账（白底薄荷绿）</div>
      </div>
    `;
    let importMode='merge';
    root.querySelectorAll('#import-mode button').forEach(b=>b.addEventListener('click',()=>{
      importMode=b.dataset.mode;
      root.querySelectorAll('#import-mode button').forEach(x=>x.classList.toggle('active',x===b));
    }));
    root.querySelector('#btn-export').addEventListener('click',async()=>{
      try{
        const payload=await exportAll();
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download='workbench-backup-'+todayStr()+'.json';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
        App.toast('已导出');
      }catch(e){ App.toast('导出失败'); }
    });
    const fileInput=root.querySelector('#import-file');
    root.querySelector('#btn-import').addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',async()=>{
      const file=fileInput.files&&fileInput.files[0]; if(!file) return;
      try{
        const text=await file.text();
        const payload=JSON.parse(text);
        if(importMode==='overwrite'&&!confirm('覆盖会先清空现有数据，确定？')){ fileInput.value=''; return; }
        await importAll(payload,importMode);
        App.toast('导入成功'); App.render();
      }catch(e){ App.toast('备份文件格式不正确'); }
      finally{ fileInput.value=''; }
    });
    root.querySelector('#btn-wipe').addEventListener('click',async()=>{
      if(!confirm('将删除本机全部数据，确定？')) return;
      if(!confirm('再次确认清空？')) return;
      await wipeAll(); App.toast('已清空'); App.render();
    });
  }
};

/* ========== boot ========== */
// finance stat chart after render
const _origRender=FinanceModule.render.bind(FinanceModule);
FinanceModule.render=async function(root){
  await _origRender(root);
  const canvas=root.querySelector('#fin-chart');
  if(canvas) drawFinanceChart(canvas, this.month);
};
function drawFinanceChart(canvas, month){
  // fill after data load
  getAll('txns').then(txns=>{
    const ctx=canvas.getContext('2d');
    const w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const days=new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
    const vals=[];
    for(let d=1;d<=days;d++){
      const ds=month+'-'+String(d).padStart(2,'0');
      vals.push(sumBy(txns.filter(t=>t.date===ds&&t.kind==='expense'),t=>t.amount));
    }
    const max=Math.max(1,...vals);
    const padL=36,padR=10,padT=16,padB=28;
    const cw=(w-padL-padR)/vals.length;
    vals.forEach((v,i)=>{
      const bh=(v/max)*(h-padT-padB);
      const x=padL+i*cw+cw*0.2, y=h-padB-bh, bw=Math.max(3,cw*0.6);
      ctx.fillStyle='#EF6B6B';
      ctx.beginPath(); ctx.roundRect(x,y,bw,Math.max(v?3:0,bh),3); ctx.fill();
    });
    ctx.fillStyle='#8A9399'; ctx.font='16px sans-serif'; ctx.textAlign='center';
    ctx.fillText(month.slice(5)+'月每日支出', w/2, h-6);
  });
}

document.addEventListener('DOMContentLoaded',()=>App.init());
