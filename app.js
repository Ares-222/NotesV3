/* ================= ХЕЛПЕРЫ ================= */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const PRM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const escA = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* каскад хранилищ: localStorage → sessionStorage → память */
const LS_OK = (() => {
  try { localStorage.setItem('__ares_t','1'); localStorage.removeItem('__ares_t'); return true; } catch (e) { return false; }
})();
const MEM = {};
const LS = {
  get(k) {
    if (LS_OK) { try { const v = localStorage.getItem(k); if (v != null) return v; } catch (e) {} }
    try { const v = sessionStorage.getItem(k); if (v != null) return v; } catch (e) {}
    return (k in MEM) ? MEM[k] : null;
  },
  set(k, v) {
    MEM[k] = v;
    if (LS_OK) { try { localStorage.setItem(k, v); return; } catch (e) {} }
    try { sessionStorage.setItem(k, v); } catch (e) {}
  }
};
function b64urlE(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlD(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/'); while (s.length % 4) s += '=';
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

/* появление при скролле */
const HAS_IO = 'IntersectionObserver' in window;
let rIO = null;
if (HAS_IO) {
  rIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); rIO.unobserve(e.target); }
  }), { threshold: .12 });
  $$('[data-reveal]').forEach(el => rIO.observe(el));
} else {
  $$('[data-reveal]').forEach(el => el.classList.add('in'));
}
addEventListener('error', () => document.documentElement.classList.add('nojs-ok'), { once: true });
addEventListener('unhandledrejection', () => document.documentElement.classList.add('nojs-ok'), { once: true });

/* toast: безопасная вставка через textContent (XSS-гигиена) */
function toast(msg, icon = 'ri-information-line') {
  const t = document.createElement('div');
  t.className = 'toast';
  const ic = document.createElement('i'); ic.className = icon;
  const sp = document.createElement('span'); sp.textContent = msg;
  t.appendChild(ic); t.appendChild(sp);
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3600);
}
setTimeout(() => { const sp = $('#splash'); if (sp) { sp.classList.add('gone'); setTimeout(() => sp.remove(), 100); } }, 1900);
/* ошибки картинок (capture — error не всплывает): фолбэк атласа Atlas/ → atlas/,
   удаление пустых карточек атласа и фото зала. Заменяет инлайн-onerror. */
document.addEventListener('error', e => {
  const el = e.target;
  if (!el || el.tagName !== 'IMG') return;
  if (el.dataset.fb) { el.src = el.dataset.fb; el.removeAttribute('data-fb'); return; }
  if (el.dataset.atlasfig != null) { const f = el.closest('figure'); if (f) f.remove(); return; }
  if (el.dataset.rem != null) el.remove();
}, true);
/* ================= ПРОГРАММЫ =================
   Контент (программы, проценты 1ПМ, атлас) больше НЕ зашит в html:
   он приходит с воркера (/api/programs) только после проверки доступа
   и кэшируется в localStorage. До загрузки — скелетон. */
let PROGRAMS = [];
let ATLAS = {};
let ATLAS_TIP = '';
let CALC_SPECS = {};

/* ================= ДАННЫЕ ================= */
const TKEY = 'ARES_GYM_TRACKER_V1';
const CKEY = 'ARES_CUSTOM_V1';
let store = (() => { try { return JSON.parse(LS.get(TKEY)) || {}; } catch (e) { return {}; } })();
let customPlan = (() => { try { return JSON.parse(LS.get(CKEY)) || null; } catch (e) { return null; } })();
let lastStats = null;

(function restoreFromHash() {
  if ((store && Object.keys(store).length) || customPlan) return;
  const m = (location.hash || '').match(/^#s=(.+)$/);
  if (!m) return;
  try {
    const o = JSON.parse(b64urlD(m[1]));
    if (o && typeof o === 'object') {
      if ('s' in o) { store = o.s || {}; customPlan = o.c || null; }
      else store = o;
      /* прозрачность: сообщаем, что данные из ссылки применены (хранилище было пустым) */
      setTimeout(() => toast('Прогресс из ссылки применён — проверь цифры.', 'ri-database-2-line'), 2100);
    }
  } catch (e) {}
})();

function packState() { return JSON.stringify({ s: store, c: customPlan }); }
function unpackState(str) {
  const o = JSON.parse(str);
  if (o && typeof o === 'object' && ('s' in o)) { store = o.s || {}; customPlan = o.c || null; }
  else store = o;
}
function makeCode() { return 'ARES2.' + b64urlE(packState()); }
function syncHash() { try { history.replaceState(null, '', '#s=' + makeCode()); } catch (e) {} }
const saveStore = () => {
  LS.set(TKEY, JSON.stringify(store));
  if (customPlan) LS.set(CKEY, JSON.stringify(customPlan));
  syncHash();
};
addEventListener('pagehide', () => { try { saveStore(); } catch (e) {} });

/* миграция: press → push (старые данные переносятся автоматически) */
(function migratePressToPush() {
  try {
    let changed = false;
    Object.keys(store).forEach(k => {
      if (k.indexOf('press:') === 0) { store['push' + k.slice(5)] = store[k]; delete store[k]; changed = true; }
    });
    const S = LS.get('ARES_SESSION_V1');
    if (S) {
      try {
        const sess = JSON.parse(S);
        if (sess && sess.press) { sess.push = sess.press; delete sess.press; LS.set('ARES_SESSION_V1', JSON.stringify(sess)); }
      } catch (e) {}
    }
    if (changed) saveStore();
  } catch (e) {}
})();

function getProg(pid) {
  if (pid === 'custom') {
    return {
      id:'custom', num:'04',
      full: (customPlan && customPlan.name) || 'Свой план',
      tags:'Своя программа', meta:''
    };
  }
  return PROGRAMS.find(x => x.id === pid);
}

/* ================= АТЛАС УПРАЖНЕНИЙ =================
   Данные приходят с воркера (payload.atlas). Фото-карточки
   подхватываются сами: <slug>-1.jpg — выполнение, <slug>-2.jpg —
   карта мышц. Пробуются оба варианта папки — «Atlas/» и «atlas/»
   (на GitHub Pages путь регистрозависим!). Нет файла — карточка
   просто не показывается, блок не ломается. */
function atlasFig(slug, n, cap, alt) {
  return `<figure><img src="Atlas/${slug}-${n}.jpg" loading="lazy" alt="${escA(alt)}" data-fb="atlas/${slug}-${n}.jpg" data-atlasfig="1"><figcaption>${cap}</figcaption></figure>`;
}
function atlasHTML(slug) {
  const a = ATLAS[slug]; if (!a) return '';
  return `<button class="atlas-toggle" data-atlas-toggle="${slug}"><i class="ri-book-open-line"></i> АТЛАС УПРАЖНЕНИЯ <i class="ri-arrow-down-s-line at-down"></i></button>
  <div class="atlas" data-atlas-box="${slug}" hidden>
    <div class="atlas-imgs">
      ${atlasFig(slug, 1, 'ВЫПОЛНЕНИЕ', 'Выполнение: ' + a.name)}
      ${atlasFig(slug, 2, 'МЫШЦЫ', 'Мышцы: ' + a.name)}
    </div>
    <div class="atlas-m">
      <p class="am-main"><b>Основные:</b> ${escA(a.main)}</p>
      <p class="am-sec"><b>Вторичные:</b> ${escA(a.second)}</p>
      ${a.note ? `<p class="am-note">${escA(a.note)}</p>` : ''}
      <p class="am-tip"><i class="ri-shield-check-line"></i> ${escA(ATLAS_TIP)}</p>
    </div>
  </div>`;
}

/* ================= КАЛЬКУЛЯТОР 1ПМ (данные с воркера) ================= */
function calcWeight(one, pct) {
  let w = Math.floor(one * pct / 100 / 2.5) * 2.5;
  if (w < 2.5) w = 2.5;
  return w;
}
function calcHTML(pid) {
  const s = CALC_SPECS[pid];
  const ph = pid === 'push' ? '115' : '90';
  return `<div class="calc" id="calc-${pid}">
    <div class="calc-title"><i class="ri-calculator-line"></i>${escA(s.title)}</div>
    <div class="calc-warn">⚠️ <b>ВСЁ СЧИТАЕТСЯ ТОЛЬКО ДЛЯ ЧИСТОЙ ТЕХНИКИ.</b> 30 кг в идеальной технике лучше, чем 60 в кривой. 1ПМ — тот, что поднял без читинга, без «половины повтора на страховке». Программа считает от честной цифры — врать тут можно только себе.</div>
    <div class="calc-in-row">
      <div>
        <span class="calc-lbl">ТВОЙ 1ПМ · КГ</span>
        <input class="calc-in" id="calcIn-${pid}" inputmode="decimal" placeholder="${ph}" autocomplete="off">
      </div>
      <p class="calc-note" style="margin-top:0">Проценты выведены из авторской программы: разминка → сингл → рабочие 87% → спец-блоки. Округление вниз до блинов 2,5 кг.</p>
    </div>
    <div id="calcRows-${pid}"></div>
    <button class="btn-fin calc-apply" id="calcApply-${pid}"><i class="ri-arrow-down-line"></i> ПОДСТАВИТЬ В ПРОГРАММУ</button>
    <p class="calc-note"><b>Когда добавлять:</b> последний подход лёгкий, в запасе 2+ повтора → <b>+2,5 кг</b> к рабочим. На грани техники → вес стоит, добирай качество. Техника поехала → <b>−5 кг</b> и назад к чистоте. Прогресс — только после чистой недели.</p>
  </div>`;
}

/* ================= РЕНДЕР ================= */
const MEMO = `<div class="p-note"><i class="ri-flashlight-fill"></i><div>
  <b>ПАМЯТКА:</b> правильное питание и витамины — база, а не дополнение. Без поддержки организма программа даёт лишь половину результата. <a href="#support">Весь протокол →</a></div></div>`;

function fitInp(el, max = 14) { if (el) el.style.width = Math.max(3, Math.min(max, el.value.length + 1)) + 'ch'; }

function setRow(s, i, pid, bi, vk, blk, rest) {
  const k = `${pid}:${bi}:${i}${vk ? ':' + vk : ''}`;
  const g = vk ? `b${bi}${vk}` : `b${bi}`;
  return `<div class="set" data-k="${k}" data-g="${g}" data-blk="${escA(blk)}" data-tech="${escA(s.t || '')}" data-rest="${rest}" data-eq0="${escA(s.eq0 || '')}" ${vk ? 'data-v="1"' : ''} data-w0="${escA(s.w)}" data-r0="${escA(s.r)}">
    <span class="s-n">${String(i + 1).padStart(2, '0')}</span>
    <input type="checkbox" class="ck" aria-label="Подход выполнен">
    <span class="s-wr"><input class="in-w" value="${escA(s.w)}" inputmode="decimal" aria-label="Вес, кг" autocomplete="off"><i>×</i><input class="in-r" value="${escA(s.r)}" inputmode="numeric" aria-label="Повторы" autocomplete="off"></span>
    <span class="s-t">${escA(s.t || '')}${s.note ? `<em class="s-hint">${escA(s.note)}</em>` : ''}</span>
    <input class="s-note-in" placeholder="заметка — как прошёл подход" autocomplete="off">
  </div>`;
}
function blockHTML(b, i, pid) {
  const num = String(i + 1).padStart(2, '0');
  const rest = b.rest || 90;
  const eq = b.eq || '';
  const eqHTML = eq ? `<span class="b-eq-wrap ${/panatta/i.test(eq) ? 'panatta' : ''}"><input class="b-eq-in" data-key="${pid}:b${i}:eq" data-def="${escA(eq)}" value="${escA(eq)}" aria-label="Тренажёр — можно изменить" autocomplete="off" spellcheck="false"></span>` : '';
  const atlas = b.atlas ? atlasHTML(b.atlas) : '';
  if (b.variants) {
    const rowsA = b.variants.a.sets.map((s, si) => setRow(Object.assign({}, s, { eq0: eq }), si, pid, i, 'a', `${escA(b.name)} — вариант А: ${escA(b.variants.a.name)}`, rest)).join('');
    const rowsB = b.variants.b.sets.map((s, si) => setRow(Object.assign({}, s, { eq0: eq }), si, pid, i, 'b', `${escA(b.name)} — вариант Б: ${escA(b.variants.b.name)}`, rest)).join('');
    return `<section class="block">
      <header class="b-head"><span class="b-idx mono">${num}</span><h4>${escA(b.name)}</h4>${eqHTML}<span class="b-count">А / Б</span></header>
      ${b.note ? `<p class="b-note">${escA(b.note)}</p>` : ''}
      ${atlas}
      <div class="alt-grid">
        <div class="alt"><h5>ВАРИАНТ А — ${escA(b.variants.a.name)}</h5>${rowsA}</div>
        <div class="alt"><h5>ВАРИАНТ Б — ${escA(b.variants.b.name)}</h5>${rowsB}</div>
      </div>
    </section>`;
  }
  return `<section class="block">
    <header class="b-head"><span class="b-idx mono">${num}</span><h4>${escA(b.name)}</h4>${eqHTML}<span class="b-count">${b.sets.length} ПОДХ. · ОТДЫХ ${rest}</span></header>
    ${b.note ? `<p class="b-note">${escA(b.note)}</p>` : ''}
    ${atlas}
    ${b.sets.map((s, si) => setRow(Object.assign({}, s, { eq0: eq }), si, pid, i, null, b.name, rest)).join('')}
  </section>`;
}
function panelHTML(p) {
  const hasCalc = !!CALC_SPECS[p.id];
  return `<div class="panel" id="panel-${p.id}"><div class="panel-in"><div class="panel-box" data-pid="${p.id}">
    <header class="panel-head">
      <div>
        <span class="ph-k mono">ПРОГРАММА /${p.num} · ВЕС В КГ</span>
        <h3 class="ph-name">${escA(p.full)}</h3>
        <p class="ph-tags">${escA(p.tags)}</p>
      </div>
      <span class="ph-r"><i class="ri-stack-line"></i>${escA(p.meta)}</span>
    </header>
    <div class="p-body">
      <div class="start-bar">
        <button class="btn-start" data-gym="${p.id}"><i class="ri-play-fill"></i>НАЧАТЬ ТРЕНИРОВКУ</button>
        ${hasCalc ? '<button class="gy-open" data-calc="' + p.id + '"><i class="ri-calculator-line"></i>РАСЧЁТ ОТ 1ПМ</button>' : ''}
        <span class="sb-hint"><b>КАК РАБОТАЕТ:</b> подход → «ВЫПОЛНЕНО» → отдых по упражнению (тап — пропуск) → следующий. Цифры, заметки и тренажёр правятся на месте.</span>
      </div>
      ${hasCalc ? calcHTML(p.id) : ''}
      ${p.blocks.map((b, i) => blockHTML(b, i, p.id)).join('')}
      <div class="track-bar">
        <span class="tb-label">ВЫПОЛНЕНО <span class="tb-count">0/0</span></span>
        <span class="tb-track"><i class="tb-fill"></i></span>
        <button class="gy-open" data-gym="${p.id}"><i class="ri-play-fill"></i>ЗАЛЬНЫЙ РЕЖИМ</button>
      </div>
      <div class="track-actions">
        <button class="btn-fin" data-report="${p.id}">ЗАКОНЧИТЬ ТРЕНИРОВКУ <i class="ri-flag-2-line"></i></button>
        <button class="btn-reset" data-reset="${p.id}">СБРОС ДНЯ</button>
        <button class="btn-reset" data-data>ДАННЫЕ · БЭКАП</button>
      </div>
      ${MEMO}
    </div>
  </div></div></div>`;
}
function customPanelHTML() {
  const hasPlan = !!(customPlan && customPlan.blocks && customPlan.blocks.length);
  const p = getProg('custom');
  let body;
  if (!hasPlan) {
    body = `<div class="p-body">
      <div class="start-bar">
        <button class="btn-start" data-planedit><i class="ri-hammer-line"></i> СОЗДАТЬ ПЛАН</button>
        <span class="sb-hint"><b>СВОЙ ПЛАН:</b> собери тренировку из своих упражнений — название, тренажёр, отдых, подходы. Дальше всё как в основных программах: галочки, зальный режим, таймеры, тоннаж и отчёт.</span>
      </div>
      ${MEMO}
    </div>`;
  } else {
    body = `<div class="p-body">
      <div class="start-bar">
        <button class="btn-start" data-gym="custom"><i class="ri-play-fill"></i>НАЧАТЬ ТРЕНИРОВКУ</button>
        <button class="btn-reset" data-planedit>РЕДАКТИРОВАТЬ ПЛАН</button>
        <span class="sb-hint"><b>КАК РАБОТАЕТ:</b> как и основные программы — подход → отдых → следующий. Отдых берётся из настроек упражнения, меняется на месте.</span>
      </div>
      ${customPlan.blocks.map((b, i) => blockHTML(Object.assign({ rest: 90, sets: [] }, b), i, 'custom')).join('')}
      <div class="track-bar">
        <span class="tb-label">ВЫПОЛНЕНО <span class="tb-count">0/0</span></span>
        <span class="tb-track"><i class="tb-fill"></i></span>
        <button class="gy-open" data-gym="custom"><i class="ri-play-fill"></i>ЗАЛЬНЫЙ РЕЖИМ</button>
      </div>
      <div class="track-actions">
        <button class="btn-fin" data-report="custom">ЗАКОНЧИТЬ ТРЕНИРОВКУ <i class="ri-flag-2-line"></i></button>
        <button class="btn-reset" data-reset="custom">СБРОС ДНЯ</button>
        <button class="btn-reset" data-data>ДАННЫЕ · БЭКАП</button>
      </div>
      ${MEMO}
    </div>`;
  }
  return `<div class="panel" id="panel-custom"><div class="panel-in"><div class="panel-box" data-pid="custom">
    <header class="panel-head">
      <div>
        <span class="ph-k mono">ПРОГРАММА /04 · СВОЯ СХЕМА</span>
        <h3 class="ph-name">${escA(p.full)}</h3>
        <p class="ph-tags">Собрал в конструкторе · правится в любой момент</p>
      </div>
    </header>
    ${body}
  </div></div></div>`;
}
function renderCustomPanel() {
  const old = document.getElementById('panel-custom');
  if (old) old.remove();
  $('#panels').insertAdjacentHTML('beforeend', customPanelHTML());
}
function updateCustomCard() {
  const m = $('#customMeta'); if (!m) return;
  m.textContent = (customPlan && customPlan.blocks && customPlan.blocks.length)
    ? customPlan.blocks.length + ' бл. · редактируется'
    : 'создай тренировку под себя';
}

updateCustomCard(); /* карточка «Свой план» — локальные данные, обновляется сразу */

function openPanelEl(panel) {
  panel.classList.add('open');
  panel.style.maxHeight = panel.scrollHeight + 'px';
}
function closePanelEl(panel) {
  panel.classList.remove('open');
  panel.style.maxHeight = '0px';
}
function refreshPanelHeight(el) {
  const panel = el && el.closest ? el.closest('.panel') : null;
  if (panel && panel.classList.contains('open')) panel.style.maxHeight = panel.scrollHeight + 'px';
}
 $$('.pcard').forEach(card => card.addEventListener('click', () => {
  const blk = (window.ARES_BLOCKS || {})[card.dataset.target];
  if (blk && (!blk.until || blk.until > Date.now())) {
    if (window.aresShowBlock) window.aresShowBlock(card.dataset.target);
    return;
  }
  const panel = document.getElementById('panel-' + card.dataset.target);
  if (!panel) {
    if (!window.__programsLoaded) toast('Программы ещё загружаются — секунду.', 'ri-loader-4-line');
    return;
  }
  const wasOpen = panel.classList.contains('open');
  $$('.panel.open').forEach(p => closePanelEl(p));
  $$('.pcard.active').forEach(c => c.classList.remove('active'));
  $$('.pcard').forEach(c => c.setAttribute('aria-expanded', 'false'));
  if (!wasOpen) {
    openPanelEl(panel);
    card.classList.add('active');
    card.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      const box = $('.panel-box', panel);
      if (box) box.scrollIntoView({ behavior: PRM ? 'auto' : 'smooth', block: 'start' });
    }, 350);
  }
}));
addEventListener('resize', debounce(() => {
  $$('.panel.open').forEach(p => { p.style.maxHeight = p.scrollHeight + 'px'; });
}, 150));

/* тап по «АТЛАС УПРАЖНЕНИЯ» */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-atlas-toggle]');
  if (!t) return;
  const scope = t.closest('section.block') || document;
  const box = scope.querySelector('[data-atlas-box="' + t.dataset.atlasToggle + '"]');
  if (!box) return;
  box.hidden = !box.hidden;
  t.classList.toggle('open', !box.hidden);
  refreshPanelHeight(t);
});

/* тап по названию тренажёра в справочнике → атлас упражнения */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-atlas-jump]');
  if (!t) return;
  const slug = t.dataset.atlasJump;
  const box = document.querySelector('[data-atlas-box="' + slug + '"]');
  if (!box) return;
  const panel = box.closest('.panel');
  const card = panel ? document.querySelector('.pcard[data-target="' + panel.id.replace('panel-', '') + '"]') : null;
  const wasClosed = !!(panel && card && !panel.classList.contains('open'));
  if (wasClosed) card.click();
  const tog = box.parentElement.querySelector('[data-atlas-toggle="' + slug + '"]');
  if (tog && box.hidden) tog.click();
  else if (box.hidden) { box.hidden = false; refreshPanelHeight(box); }
  setTimeout(() => {
    box.scrollIntoView({ behavior: PRM ? 'auto' : 'smooth', block: 'center' });
    box.classList.remove('atlas-flash'); void box.offsetWidth; box.classList.add('atlas-flash');
    setTimeout(() => box.classList.remove('atlas-flash'), 1900);
  }, wasClosed ? 620 : 80);
});

/* ================= ТРЕКЕР ================= */
function updateProgress(pid) {
  const panel = document.getElementById('panel-' + pid); if (!panel) return;
  const tb = $('.tb-count', panel); if (!tb) return;
  const rows = $$('.set:not([data-v])', panel);
  const done = rows.filter(r => $('.ck', r).checked).length;
  tb.textContent = done + '/' + rows.length;
  $('.tb-fill', panel).style.width = rows.length ? (done / rows.length * 100) + '%' : '0%';
  $('.btn-fin', panel).classList.toggle('ready', rows.length > 0 && done === rows.length);
}
function setDoneRow(row, d) {
  const ck = $('.ck', row);
  ck.checked = d; row.classList.toggle('done', d);
  store[row.dataset.k] = Object.assign({}, store[row.dataset.k], { d });
  saveStore();
  updateProgress(row.dataset.k.split(':')[0]);
}
function bindRows(root) {
  $$('.set', root).forEach(row => {
    const pid = row.dataset.k.split(':')[0];
    const st = store[row.dataset.k] || {};
    const w = $('.in-w', row), r = $('.in-r', row), n = $('.s-note-in', row), ck = $('.ck', row);
    if (st.w != null) w.value = st.w;
    if (st.r != null) r.value = st.r;
    if (st.n) n.value = st.n;
    if (st.d) { ck.checked = true; row.classList.add('done'); }
    fitInp(w); fitInp(r);
    ck.addEventListener('change', () => {
      setDoneRow(row, ck.checked);
      const panel = document.getElementById('panel-' + pid);
      if (panel) {
        const rows = $$('.set:not([data-v])', panel);
        if (rows.length && rows.every(x => $('.ck', x).checked))
          toast('Программа закрыта. Жми «Закончить тренировку».', 'ri-flag-2-fill');
      }
    });
    const deb = debounce(() => {
      store[row.dataset.k] = Object.assign({}, store[row.dataset.k], { w: w.value, r: r.value, n: n.value });
      saveStore();
    }, 250);
    [w, r, n].forEach(el => el.addEventListener('input', () => { fitInp(el); deb(); }));
  });
}
function bindEq(root) {
  $$('.b-eq-in', root).forEach(inp => {
    const key = inp.dataset.key, def = inp.dataset.def || '';
    const saved = store[key];
    if (saved != null) inp.value = saved;
    const wrap = inp.closest('.b-eq-wrap');
    const sync = () => { wrap.classList.toggle('panatta', /panatta/i.test(inp.value)); fitInp(inp, 34); };
    sync();
    inp.addEventListener('input', () => { sync(); store[key] = inp.value; saveStore(); });
    inp.addEventListener('blur', () => { if (!inp.value.trim()) { inp.value = def; store[key] = def; saveStore(); sync(); } });
  });
}
function applyStore() {
  $$('#panels .set').forEach(row => {
    const st = store[row.dataset.k] || {};
    const w = $('.in-w', row), r = $('.in-r', row), n = $('.s-note-in', row), ck = $('.ck', row);
    w.value = st.w != null ? st.w : row.dataset.w0;
    r.value = st.r != null ? st.r : row.dataset.r0;
    n.value = st.n || '';
    ck.checked = !!st.d; row.classList.toggle('done', !!st.d);
    fitInp(w); fitInp(r);
  });
  $$('.b-eq-in').forEach(inp => {
    const saved = store[inp.dataset.key];
    if (saved != null) inp.value = saved;
    inp.closest('.b-eq-wrap').classList.toggle('panatta', /panatta/i.test(inp.value));
    fitInp(inp, 34);
  });
  ['push', 'pull', 'legs', 'custom'].forEach(updateProgress);
}

/* сброс дня (тренажёры не трогает) — кнопки живут в панелях, биндим при рендере */
function bindResetButtons() {
  $$('[data-reset]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.arm !== '1') {
      b.dataset.arm = '1'; b.classList.add('arm'); b.textContent = 'ТОЧНО СБРОСИТЬ?';
      setTimeout(() => { b.dataset.arm = ''; b.classList.remove('arm'); b.textContent = 'СБРОС ДНЯ'; }, 2600);
      return;
    }
    const pid = b.dataset.reset;
    Object.keys(store).forEach(k => { if (k.startsWith(pid + ':') && !k.includes(':eq')) delete store[k]; });
    saveStore();
    const s = loadSess(); delete s[pid]; saveSess(s);
    lastStats = null;
    $$('#panel-' + pid + ' .set').forEach(row => {
      $('.ck', row).checked = false; row.classList.remove('done');
      $('.in-w', row).value = row.dataset.w0; $('.in-r', row).value = row.dataset.r0;
      $('.s-note-in', row).value = '';
      fitInp($('.in-w', row)); fitInp($('.in-r', row));
    });
    updateProgress(pid);
    toast('День сброшен — чистый лист.', 'ri-restart-line');
  }));
}

/* ================= КАЛЬКУЛЯТОР: логика ================= */
function calcRender(pid) {
  const inp = document.getElementById('calcIn-' + pid);
  const box = document.getElementById('calcRows-' + pid);
  if (!inp || !box) return;
  const one = parseFloat(String(inp.value).replace(',', '.'));
  const spec = CALC_SPECS[pid];
  if (!spec) return;
  if (!one || one < 20 || one > 500) {
    box.innerHTML = spec.rows.map(r =>
      `<div class="calc-row"><span>${escA(r.label)}</span><span><span class="pct">${r.pct ? r.pct + '%' : 'фикс'}</span> <b>—</b></span></div>`).join('');
    return;
  }
  box.innerHTML = spec.rows.map(r => {
    let w;
    if (r.pct) w = calcWeight(one, r.pct) + ' кг';
    else w = r.fixed + (/[0-9]/.test(r.fixed) ? ' кг' : '');
    return `<div class="calc-row"><span>${escA(r.label)}</span><span><span class="pct">${r.pct ? r.pct + '%' : 'фикс'}</span> <b>${escA(w)}</b></span></div>`;
  }).join('');
}
function calcApply(pid) {
  const panel = document.getElementById('panel-' + pid); if (!panel) return;
  const inp = document.getElementById('calcIn-' + pid);
  const one = parseFloat(String(inp.value).replace(',', '.'));
  if (!one || one < 20 || one > 500) { toast('Введи честный 1ПМ в килограммах.', 'ri-error-warning-line'); return; }
  store['1pm:' + pid] = one;
  const blk = $$('#panel-' + pid + ' .block')[0]; if (!blk) return;
  const rows = $$('.set', blk);
  CALC_SPECS[pid].rows.forEach(r => {
    const row = rows[r.i]; if (!row) return;
    let w;
    if (r.pct) w = String(calcWeight(one, r.pct));
    else w = r.fixed;
    const wi = $('.in-w', row);
    wi.value = w; fitInp(wi);
    row.dataset.w0 = w;
    store[row.dataset.k] = Object.assign({}, store[row.dataset.k], { w: w });
  });
  saveStore();
  ['push', 'pull'].forEach(updateProgress);
  toast('Веса подставлены. Прогресс — только чистая техника.', 'ri-check-double-line');
}
function initCalc() {
  Object.keys(CALC_SPECS).forEach(pid => {
    const btn = document.querySelector('[data-calc="' + pid + '"]');
    if (!btn) return;
    const inp = document.getElementById('calcIn-' + pid);
    if (store['1pm:' + pid] != null) inp.value = store['1pm:' + pid];
    btn.addEventListener('click', () => {
      const box = document.getElementById('calc-' + pid);
      box.classList.toggle('open');
      if (box.classList.contains('open')) calcRender(pid);
    });
    inp.addEventListener('input', () => calcRender(pid));
    document.getElementById('calcApply-' + pid).addEventListener('click', () => calcApply(pid));
    if (inp.value) calcRender(pid);
  });
}

/* ================= СТАТИСТИКА ================= */
function fmtDur(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0')
           : String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
}
function fmtKg(n) { return n.toLocaleString('ru-RU'); }
function parseNums(s) {
  const m = String(s).match(/\d+(?:[.,]\d+)?/g);
  if (!m) return null;
  const a = m.map(x => parseFloat(x.replace(',', '.')));
  return a.length > 1 ? (a[0] + a[1]) / 2 : a[0];
}
function setTonnage(w, r) {
  const W = /гриф/i.test(w) ? 20 : parseNums(w);
  const R = parseNums(r);
  return (W && R) ? Math.round(W * R) : 0;
}
function listRows(pid) {
  const rows = $$('#panel-' + pid + ' .set');
  const isActive = k => { const st = store[k]; return st && (st.d || st.n || st.w != null || st.r != null); };
  const g = {};
  rows.forEach(r => { if (r.dataset.v && isActive(r.dataset.k)) g[r.dataset.g] = true; });
  return rows.filter(r => !r.dataset.v || g[r.dataset.g]);
}
function computeTonnage(pid) {
  const map = new Map(); let total = 0;
  listRows(pid).forEach(r => {
    if (!$('.ck', r).checked) return;
    const kg = setTonnage($('.in-w', r).value, $('.in-r', r).value);
    total += kg;
    const e = map.get(r.dataset.blk) || { name: r.dataset.blk, kg: 0, n: 0 };
    e.kg += kg; e.n++;
    map.set(r.dataset.blk, e);
  });
  return { total, blocks: [...map.values()] };
}
function editedEq(row) {
  const m = row.dataset.g.match(/^b(\d+)/); if (!m) return null;
  const val = (store[row.dataset.k.split(':')[0] + ':b' + m[1] + ':eq'] || '').trim();
  const def = (row.dataset.eq0 || '').trim();
  return (val && val !== def) ? val : null;
}

/* ================= ОТЧЁТ ================= */
function buildReport(pid) {
  const p = getProg(pid);
  const rows = listRows(pid);
  const now = new Date();
  const when = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  let done = 0; rows.forEach(r => { if ($('.ck', r).checked) done++; });
  const L = [];
  L.push(p.full.toUpperCase() + ' · ' + when);
  L.push('Закрыто подходов: ' + done + '/' + rows.length);
  if (lastStats && lastStats.pid === pid)
    L.push('Время тренировки: ' + fmtDur(lastStats.secs) + ' · Отдых: ' + fmtDur(lastStats.rest) + ' · Тоннаж: ' + fmtKg(lastStats.ton.total) + ' кг');
  let curG = null, n = 0;
  rows.forEach(r => {
    if (r.dataset.g !== curG) {
      curG = r.dataset.g; n = 0; L.push('');
      const eq = editedEq(r);
      L.push(r.dataset.blk.toUpperCase() + (eq ? ' · ' + eq.toUpperCase() : ''));
    }
    n++;
    const w = $('.in-w', r).value.trim(), rr = $('.in-r', r).value.trim();
    const tech = r.dataset.tech, note = $('.s-note-in', r).value.trim(), d = $('.ck', r).checked;
    const join = /^[0-9]/.test(w) ? 'х' : ' × ';
    let line = n + ') ' + w + join + rr;
    if (tech) line += ' (' + tech + ')';
    if (note) line += ' — ' + note;
    if (!d) line += ' — НЕ ВЫПОЛНЕНО';
    L.push(line);
  });
  const ton = computeTonnage(pid);
  if (ton.blocks.length) {
    L.push(''); L.push('Тоннаж по блокам:');
    ton.blocks.forEach(b => L.push(b.name + ' — ' + fmtKg(b.kg) + ' кг (' + b.n + ' подх.)'));
  }
  L.push(''); L.push('— ARES GYM');
  return L.join('\n');
}
const reportEl = $('#report');
const dataEl = $('#dataModal');
const planEl = $('#planModal');
let reportPid = null;
function refreshLock() {
  const on = document.body.classList.contains('menu-open') ||
             $('#gym').classList.contains('open') ||
             reportEl.classList.contains('open') ||
             dataEl.classList.contains('open') ||
             planEl.classList.contains('open') ||
             $('#gateModal').classList.contains('open');
  document.documentElement.classList.toggle('no-scroll', on);
}
function openReport(pid) {
  reportPid = pid;
  $('#reportText').textContent = buildReport(pid);
  reportEl.classList.add('open'); refreshLock();
}
function closeReport() { reportEl.classList.remove('open'); refreshLock(); }
 $('#repClose').addEventListener('click', closeReport);
 $('#repClose2').addEventListener('click', closeReport);
reportEl.addEventListener('click', e => { if (e.target === reportEl) closeReport(); });
 $('#repCopy').addEventListener('click', () => copyText($('#reportText').textContent, 'отчёт — неси его в ИИ'));

/* ================= ЗАЛЬНЫЙ РЕЖИМ ================= */
const gymEl = $('#gym'), gyMid = $('#gyMid'), gyProg = $('#gyProg'), gyFill = $('#gyFill'), gyClock = $('#gyClock');
let gym = null;
const SKEY = 'ARES_SESSION_V1';
const loadSess = () => { try { return JSON.parse(LS.get(SKEY)) || {}; } catch (e) { return {}; } };
const saveSess = o => LS.set(SKEY, JSON.stringify(o));

function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    beep.ctx = beep.ctx || new C();
    const o = beep.ctx.createOscillator(), g = beep.ctx.createGain();
    o.connect(g); g.connect(beep.ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(.001, beep.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.25, beep.ctx.currentTime + .02);
    g.gain.exponentialRampToValueAtTime(.001, beep.ctx.currentTime + .55);
    o.start(); o.stop(beep.ctx.currentTime + .6);
  } catch (e) {}
}
function vib() { try { navigator.vibrate && navigator.vibrate([150, 80, 150]); } catch (e) {} }

function startClock() {
  stopClock();
  const tick = () => { if (gyClock && gym.startTs) gyClock.textContent = fmtDur((Date.now() - gym.startTs) / 1000); };
  tick();
  gym.clock = setInterval(tick, 1000);
}
function stopClock() { if (gym && gym.clock) { clearInterval(gym.clock); gym.clock = null; } }

function detectVariant(pid, all) {
  let act = null;
  all.forEach(r => {
    if (!r.dataset.v || act) return;
    const st = store[r.dataset.k];
    if (st && (st.d || st.n || st.w != null || st.r != null))
      act = r.dataset.g.endsWith('a') ? 'a' : 'b';
  });
  return act || store[pid + '::choice'] || null;
}
function filterRows(all, choice) {
  return all.filter(r => !r.dataset.v || r.dataset.g.endsWith(choice));
}
function openGym(pid) {
  const p = getProg(pid); if (!p) return;
  const panel = document.getElementById('panel-' + pid); if (!panel) return;
  const all = $$('.set', panel);
  const hasV = all.some(r => r.dataset.v);
  const choice = hasV ? detectVariant(pid, all) : null;
  gym = { pid, p, all, rows: [], idx: 0, remain: 0, iv: null, clock: null, choice, startTs: null, restTotal: 0, restTs: null, sess: loadSess()[pid] || null };
  gymEl.classList.add('open'); refreshLock();
  if (hasV && !choice) { renderVariantChoice(); return; }
  gym.rows = hasV ? filterRows(all, choice) : all;
  renderStart();
}
function closeGym() {
  if (gym) {
    if (gym.restTs) { gym.restTotal += Math.round((Date.now() - gym.restTs) / 1000); gym.restTs = null; }
    if (gym.iv) clearInterval(gym.iv);
    stopClock();
    if (gym.startTs) {
      const s = loadSess();
      if (s[gym.pid]) { s[gym.pid].restTotal = gym.restTotal; saveSess(s); }
    }
  }
  gymEl.classList.remove('open'); refreshLock();
  if (gyClock) gyClock.textContent = '';
  gym = null;
}
function gyProgress() {
  if (!gym.rows.length) { gyFill.style.width = '0%'; return; }
  const d = gym.rows.filter(r => $('.ck', r).checked).length;
  gyFill.style.width = (d / gym.rows.length * 100) + '%';
}
function nextIdx(from) {
  let i = from;
  while (i < gym.rows.length && $('.ck', gym.rows[i]).checked) i++;
  return i;
}
function renderStart() {
  gyProgress();
  if (gyClock) gyClock.textContent = '';
  const total = gym.rows.length;
  const done = gym.rows.filter(r => $('.ck', r).checked).length;
  const first = nextIdx(0);
  gyProg.textContent = gym.p.full.toUpperCase() + ' · СТАРТ';
  let primary, act;
  if (done >= total) { primary = 'СБРОСИТЬ ОТМЕТКИ И НАЧАТЬ ЗАНОВО'; act = 'fresh'; }
  else if (done > 0) { primary = 'ПРОДОЛЖИТЬ — ПОДХОД ' + (first + 1); act = 'start'; }
  else { primary = 'НАЧАТЬ ТРЕНИРОВКУ'; act = 'start'; }
  const resume = gym.sess && gym.sess.startTs;
  gyMid.innerHTML = `
    <span class="gy-fin-k">ПРОГРАММА /${gym.p.num} · ПОДХОДОВ: ${total}${done ? ' · ОСТАЛОСЬ: ' + (total - done) : ''}</span>
    <h3 class="gy-fin">${escA(gym.p.full).toUpperCase()}<em>.</em></h3>
    <p class="gy-fin-p">${resume ? 'Таймер прошлой сессии сохранён — время продолжит идти с того же места. ' : ''}Дальше — по одному подходу: выполнил → отдых → следующий. Цифры тапаются и правятся на месте.</p>
    <button class="gy-done" data-act="${act}"><i class="${act === 'fresh' ? 'ri-restart-line' : 'ri-play-fill'}"></i> ${primary}</button>
    <div class="gy-sub">
      ${done > 0 && done < total ? '<button class="gy-ghost" data-act="fresh">СБРОСИТЬ ОТМЕТКИ И СНАЧАЛА</button>' : ''}
      ${done >= total ? '<button class="gy-ghost" data-act="report"><i class="ri-file-list-3-line"></i> ОТЧЁТ</button>' : ''}
      <button class="gy-ghost" data-act="close">ВЫЙТИ</button>
    </div>`;
}
function startSession(fresh) {
  if (fresh) {
    gym.rows.forEach(r => {
      const ck = $('.ck', r); ck.checked = false; r.classList.remove('done');
      $('.s-note-in', r).value = '';
      store[r.dataset.k] = Object.assign({}, store[r.dataset.k], { d: false, n: '' });
    });
    saveStore(); updateProgress(gym.pid);
    gym.sess = null;
    toast('Новая тренировка — погнали.', 'ri-fire-fill');
  }
  const s = loadSess();
  if (gym.sess && gym.sess.startTs) {
    gym.startTs = gym.sess.startTs; gym.restTotal = gym.sess.restTotal || 0;
  } else {
    gym.startTs = Date.now(); gym.restTotal = 0;
    s[gym.pid] = { startTs: gym.startTs, restTotal: 0 }; saveSess(s);
    lastStats = null;
  }
  gym.sess = null;
  startClock();
  gym.idx = nextIdx(0);
  gym.idx >= gym.rows.length ? renderFinish() : renderGym();
}
function renderVariantChoice() {
  gyProgress();
  const vb = gym.p.blocks.find(b => b.variants);
  const na = vb ? vb.variants.a.name : 'А', nb = vb ? vb.variants.b.name : 'Б';
  gyProg.textContent = gym.p.full.toUpperCase() + ' · ВЫБОР ВАРИАНТА';
  gyMid.innerHTML = `
    <span class="gy-fin-k">ВЫБЕРИ ВАРИАНТ НА СЕГОДНЯ</span>
    <h3 class="gy-fin">${escA(vb ? vb.name : '').toUpperCase() || 'БЛОК'}<em>.</em></h3>
    <p class="gy-fin-p">В этом блоке два варианта — сегодня делаешь один. Выбор запомнится до «сброса дня».</p>
    <button class="gy-done" data-act="pick-a">А — ${escA(na).toUpperCase()}</button>
    <button class="gy-done ghosty" data-act="pick-b">Б — ${escA(nb).toUpperCase()}</button>
    <button class="gy-ghost" data-act="close">ВЫЙТИ</button>`;
}
function renderGym() {
  gyProgress();
  if (gym.idx >= gym.rows.length) { renderFinish(); return; }
  const r = gym.rows[gym.idx];
  const wInp = $('.in-w', r), rInp = $('.in-r', r);
  const note = $('.s-note-in', r).value;
  const eq = editedEq(r);
  gyProg.textContent = `${gym.p.full.toUpperCase()} · ПОДХОД ${gym.idx + 1}/${gym.rows.length}`;
  gyMid.innerHTML = `
    <span class="gy-blk">${escA(r.dataset.blk)}</span>
    ${eq ? `<span class="gy-eqline">${escA(eq)}</span>` : ''}
    <div class="gy-wr">
      <input class="gy-w" id="gyW" value="${escA(wInp.value)}" inputmode="decimal" autocomplete="off" aria-label="Вес, кг — можно изменить">
      <span class="gy-x">×</span>
      <input class="gy-r" id="gyR" value="${escA(rInp.value)}" inputmode="numeric" autocomplete="off" aria-label="Повторы — можно изменить">
    </div>
    <p class="gy-edit-hint">тап по цифрам — правка на месте</p>
    ${r.dataset.tech ? `<p class="gy-tech">${escA(r.dataset.tech)}</p>` : ''}
    <input class="gy-note" id="gyNote" placeholder="заметка — как прошёл подход" autocomplete="off" value="${escA(note)}">
    <button class="gy-done" data-act="done"><i class="ri-check-line"></i> ВЫПОЛНЕНО</button>
    <div class="gy-sub">
      <button class="gy-ghost" data-act="back" ${gym.idx === 0 ? 'disabled' : ''}><i class="ri-arrow-left-line"></i> НАЗАД</button>
      <button class="gy-ghost" data-act="skip">ПРОПУСТИТЬ <i class="ri-arrow-right-line"></i></button>
    </div>`;
  const gw = $('#gyW'), gr = $('#gyR');
  const fitG = el => { el.style.width = Math.max(2, Math.min(8, el.value.length + 1)) + 'ch'; };
  fitG(gw); fitG(gr);
  const syncNums = () => {
    wInp.value = gw.value; rInp.value = gr.value;
    fitInp(wInp); fitInp(rInp);
    store[r.dataset.k] = Object.assign({}, store[r.dataset.k], { w: gw.value, r: gr.value });
    saveStore();
  };
  gw.addEventListener('input', () => { fitG(gw); syncNums(); });
  gr.addEventListener('input', () => { fitG(gr); syncNums(); });
  const gn = $('#gyNote'), rin = $('.s-note-in', r);
  gn.addEventListener('input', debounce(() => {
    store[r.dataset.k] = Object.assign({}, store[r.dataset.k], { n: gn.value });
    saveStore();
    if (document.activeElement !== rin) rin.value = gn.value;
  }, 300));
}
function startRest(nextRow) {
  const rec = +gym.rows[gym.idx].dataset.rest || 90;
  gym.restTs = Date.now();
  const nextLine = nextRow
    ? `<p class="gy-next"><i class="ri-arrow-right-line"></i> ДАЛЬШЕ: ${escA(nextRow.dataset.blk)} — <b>${escA($('.in-w', nextRow).value)} × ${escA($('.in-r', nextRow).value)}</b></p>`
    : '';
  gyMid.innerHTML = `
    <span class="gy-rest-k"><i class="ri-timer-line"></i> ОТДЫХ · РЕКОМЕНДАЦИЯ ${rec} СЕК</span>
    <button class="gy-timer" id="gyTimer" data-act="rest-skip">${fmtDur(rec)}</button>
    <p class="gy-tap" id="gyTap">ТАП ПО ТАЙМЕРУ — ПРОПУСТИТЬ ОТДЫХ</p>
    ${nextLine}
    <div class="gy-presets">
      <button class="gy-chip" data-rest="90">90</button>
      <button class="gy-chip" data-rest="120">120</button>
      <button class="gy-chip" data-rest="180">180</button>
      <button class="gy-chip" data-rest="240">240</button>
      <button class="gy-chip" data-act="p30">+30</button>
    </div>
    <button class="gy-done" data-act="rest-skip"><i class="ri-skip-forward-line"></i> СЛЕДУЮЩИЙ ПОДХОД</button>`;
  setRest(rec);
}
function paintTimer() {
  const t = $('#gyTimer'); if (!t) return;
  t.textContent = fmtDur(Math.max(0, gym.remain));
  t.classList.toggle('zero', gym.remain <= 0);
}
function endRestAccum() {
  if (gym.restTs) {
    gym.restTotal += Math.round((Date.now() - gym.restTs) / 1000);
    gym.restTs = null;
    const s = loadSess();
    if (s[gym.pid]) { s[gym.pid].restTotal = gym.restTotal; saveSess(s); }
  }
  if (gym.iv) { clearInterval(gym.iv); gym.iv = null; }
}
function setRest(sec) {
  if (gym.iv) clearInterval(gym.iv);
  gym.remain = sec; paintTimer();
  $$('#gyMid .gy-chip[data-rest]').forEach(c => c.classList.toggle('on', +c.dataset.rest === sec));
  gym.iv = setInterval(() => {
    gym.remain--; paintTimer();
    if (gym.remain <= 0) {
      clearInterval(gym.iv); gym.iv = null;
      beep(); vib();
      const tap = $('#gyTap'); if (tap) tap.textContent = 'ВРЕМЯ — ЖМИ И ДАЛЬШЕ';
    }
  }, 1000);
}
function renderFinish() {
  endRestAccum();
  stopClock();
  const secs = gym.startTs ? Math.round((Date.now() - gym.startTs) / 1000) : 0;
  const ton = computeTonnage(gym.pid);
  lastStats = { pid: gym.pid, secs, rest: gym.restTotal, ton };
  const s = loadSess(); delete s[gym.pid]; saveSess(s);
  if (gyClock) gyClock.textContent = fmtDur(secs);
  gyProgress();
  gyProg.textContent = gym.p.full.toUpperCase() + ' · ФИНИШ';
  const tonRows = ton.blocks.map(b =>
    `<div class="gy-ton-row"><span>${escA(b.name)}</span><b>${fmtKg(b.kg)} кг · ${b.n} подх.</b></div>`).join('');
  gyMid.innerHTML = `
    <span class="gy-fin-k">ПРОГРАММА /${gym.p.num}</span>
    <h3 class="gy-fin">ЗАКРЫТО<em>.</em></h3>
    <div class="gy-stats">
      <div class="gy-stat"><b>${fmtDur(secs)}</b><span>время тренировки</span></div>
      <div class="gy-stat"><b>${fmtDur(gym.restTotal)}</b><span>отдых</span></div>
      <div class="gy-stat"><b>${fmtKg(ton.total)}<i class="gy-kg">кг</i></b><span>тоннаж</span></div>
    </div>
    ${ton.blocks.length ? `<div class="gy-ton"><div class="gy-ton-h">Тоннаж по блокам</div>${tonRows}</div>` : ''}
    <button class="gy-done" data-act="report"><i class="ri-file-list-3-line"></i> ЗАКОНЧИТЬ ТРЕНИРОВКУ</button>
    <button class="gy-ghost" data-act="close">ВЫЙТИ</button>`;
}
gymEl.addEventListener('click', e => {
  const restB = e.target.closest('[data-rest]');
  if (restB && gym) { setRest(+restB.dataset.rest); return; }
  const b = e.target.closest('[data-act]'); if (!b || !gym) return;
  const act = b.dataset.act;
  if (act === 'close') closeGym();
  else if (act === 'start') startSession(false);
  else if (act === 'fresh') startSession(true);
  else if (act === 'pick-a' || act === 'pick-b') {
    gym.choice = act.slice(-1);
    store[gym.pid + '::choice'] = gym.choice; saveStore();
    gym.rows = filterRows(gym.all, gym.choice);
    renderStart();
  }
  else if (act === 'done') {
    setDoneRow(gym.rows[gym.idx], true);
    const nxt = nextIdx(gym.idx + 1);
    nxt >= gym.rows.length ? renderFinish() : startRest(gym.rows[nxt]);
  }
  else if (act === 'back') { if (gym.idx > 0) { gym.idx--; setDoneRow(gym.rows[gym.idx], false); renderGym(); } }
  else if (act === 'skip') { gym.idx = nextIdx(gym.idx + 1); gym.idx >= gym.rows.length ? renderFinish() : renderGym(); }
  else if (act === 'rest-skip') { endRestAccum(); gym.idx = nextIdx(gym.idx + 1); gym.idx >= gym.rows.length ? renderFinish() : renderGym(); }
  else if (act === 'p30') { setRest(gym.remain + 30); }
  else if (act === 'report') { const pid = gym.pid; closeGym(); openReport(pid); }
});
 $('#gyClose').addEventListener('click', closeGym);

/* ================= КОНСТРУКТОР ПЛАНА ================= */
const plBlocks = $('#plBlocks');
function plSetRowHTML(s) {
  s = s || {};
  return `<div class="pl-setrow">
    <input class="dat-in pl-sw" inputmode="decimal" placeholder="вес" value="${escA(s.w || '')}" autocomplete="off">
    <i>×</i>
    <input class="dat-in pl-sr" inputmode="numeric" placeholder="повт" value="${escA(s.r || '')}" autocomplete="off">
    <input class="dat-in pl-st" placeholder="техника (необязательно)" value="${escA(s.t || '')}" autocomplete="off" spellcheck="false">
    <button class="pl-del" data-delset aria-label="Удалить подход"><i class="ri-close-line"></i></button>
  </div>`;
}
function plBlkHTML(b) {
  b = b || { name: '', eq: '', rest: 90, sets: [{}] };
  const sets = (b.sets && b.sets.length) ? b.sets : [{}];
  return `<div class="pl-blk">
    <div class="pl-top">
      <input class="dat-in pl-bname" placeholder="Название упражнения" value="${escA(b.name || '')}" autocomplete="off" spellcheck="false">
      <button class="pl-del" data-delblk aria-label="Удалить упражнение"><i class="ri-delete-bin-6-line"></i></button>
    </div>
    <div class="pl-row3">
      <input class="dat-in pl-beq" placeholder="Тренажёр (необязательно)" value="${escA(b.eq || '')}" autocomplete="off" spellcheck="false">
      <input class="dat-in pl-brest" inputmode="numeric" placeholder="Отдых, сек (90)" value="${b.rest || 90}" autocomplete="off">
    </div>
    <div class="pl-sets">${sets.map(plSetRowHTML).join('')}</div>
    <button class="gy-ghost" data-addset><i class="ri-add-line"></i> ДОБАВИТЬ ПОДХОД</button>
  </div>`;
}
function openBuilder() {
  $('#plName').value = (customPlan && customPlan.name) || 'Свой план';
  const blocks = (customPlan && customPlan.blocks && customPlan.blocks.length) ? customPlan.blocks : [{ name: '', eq: '', rest: 90, sets: [{}] }];
  plBlocks.innerHTML = blocks.map(plBlkHTML).join('');
  planEl.classList.add('open'); refreshLock();
}
function closeBuilder() { planEl.classList.remove('open'); refreshLock(); }
 $('#plAddBlk').addEventListener('click', () => plBlocks.insertAdjacentHTML('beforeend', plBlkHTML()));
planEl.addEventListener('click', e => {
  if (e.target === planEl) { closeBuilder(); return; }
  if (e.target.closest('[data-delset]')) { e.target.closest('.pl-setrow').remove(); return; }
  if (e.target.closest('[data-delblk]')) { e.target.closest('.pl-blk').remove(); return; }
  const addS = e.target.closest('[data-addset]');
  if (addS) { $('.pl-sets', addS.closest('.pl-blk')).insertAdjacentHTML('beforeend', plSetRowHTML()); }
});
 $('#planClose').addEventListener('click', closeBuilder);
 $('#plCancel').addEventListener('click', closeBuilder);
 $('#plSave').addEventListener('click', () => {
  const name = $('#plName').value.trim() || 'Свой план';
  const blocks = [];
  $$('.pl-blk', plBlocks).forEach(blk => {
    const bname = $('.pl-bname', blk).value.trim();
    if (!bname) return;
    const sets = [];
    $$('.pl-setrow', blk).forEach(sr => {
      const w = $('.pl-sw', sr).value.trim(), r = $('.pl-sr', sr).value.trim(), t = $('.pl-st', sr).value.trim();
      if (w || r) sets.push({ w: w || '—', r: r || '—', t: t });
    });
    if (!sets.length) return;
    const restRaw = parseInt($('.pl-brest', blk).value, 10);
    blocks.push({ name: bname, eq: $('.pl-beq', blk).value.trim(), rest: isNaN(restRaw) ? 90 : Math.max(30, Math.min(600, restRaw)), sets: sets });
  });
  if (!blocks.length) { toast('Добавь хотя бы одно упражнение с подходами.', 'ri-error-warning-line'); return; }
  customPlan = { name: name, blocks: blocks };
  saveStore();
  refreshCustom();
  closeBuilder();
  toast('План сохранён — он в четвёртой карточке.', 'ri-checkbox-circle-fill');
});
function refreshCustom() {
  renderCustomPanel();
  bindRows($('#panel-custom'));
  bindEq($('#panel-custom'));
  updateProgress('custom');
  updateCustomCard();
}

/* ================= ДАННЫЕ · БЭКАП ================= */
function importCode(str) {
  try {
    let s = String(str).trim().replace(/^ARES[12]\./, '');
    if (!s) return false;
    unpackState(b64urlD(s));
    saveStore();
    applyStore();
    refreshCustom();
    return true;
  } catch (e) { return false; }
}
function openData() {
  const st = $('#datStatus');
  st.textContent = LS_OK
    ? 'СОХРАНЕНИЕ В БРАУЗЕРЕ: РАБОТАЕТ. ПРОГРЕСС ЖИВЁТ САМ — КОД НИЖЕ ДЕРЖИ КАК СТРАХОВКУ И ДЛЯ ПЕРЕНОСА.'
    : 'ХРАНЕНИЕ ЗАКРЫТО (ПРЕДПРОСМОТР / ПРИВАТНЫЙ РЕЖИМ). ПОСЛЕ ЗАКРЫТИЯ СТРАНИЦЫ ДАННЫЕ СТИРАЮТСЯ — КОПИРУЙ КОД ПЕРЕД ВЫХОДОМ И ВСТАВЛЯЙ ПОСЛЕ ОТКРЫТИЯ.';
  st.classList.toggle('bad', !LS_OK);
  $('#datOut').value = makeCode();
  $('#datIn').value = '';
  dataEl.classList.add('open'); refreshLock();
}
function closeData() { dataEl.classList.remove('open'); refreshLock(); }
 $('#datClose').addEventListener('click', closeData);
dataEl.addEventListener('click', e => { if (e.target === dataEl) closeData(); });
 $('#datCopy').addEventListener('click', () => copyText($('#datOut').value, 'код данных'));
 $('#datApply').addEventListener('click', () => {
  if (importCode($('#datIn').value)) { toast('Данные восстановлены.', 'ri-checkbox-circle-fill'); closeData(); }
  else toast('Код не распознан — проверь, что скопирован целиком.', 'ri-error-warning-line');
});

/* ================= ГЛОБАЛЬНЫЕ КЛИКИ / ESC ================= */
document.addEventListener('click', e => {
  const pe = e.target.closest('[data-planedit]');
  if (pe) { openBuilder(); return; }
  const g = e.target.closest('[data-gym]');
  if (g) { if (gym) closeGym(); openGym(g.dataset.gym); return; }
  const rp = e.target.closest('[data-report]');
  if (rp) { openReport(rp.dataset.report); return; }
  const dd = e.target.closest('[data-data]');
  if (dd) openData();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (reportEl.classList.contains('open')) closeReport();
  else if (planEl.classList.contains('open')) closeBuilder();
  else if (dataEl.classList.contains('open')) closeData();
  else if (gym) closeGym();
  else if (document.body.classList.contains('menu-open')) {
    document.body.classList.remove('menu-open');
    $('#burger').setAttribute('aria-expanded', 'false');
    refreshLock();
  }
});

/* ================= ЛЕГЕНДЫ ================= */
const LEGENDS = [
  ['ШВАРЦЕНЕГГЕР', '7× МИСТЕР ОЛИМПИЯ'],
  ['КОУЛМАН',      '8× МИСТЕР ОЛИМПИЯ'],
  ['САРЫЧЕВ',      'ЖИМ ЛЁЖА — 335 КГ'],
  ['ХЕЙНИ',        '8× МИСТЕР ОЛИМПИЯ'],
  ['ЙЕТС',         '6× МИСТЕР ОЛИМПИЯ'],
  ['ЗЕЙН',         '3× МИСТЕР ОЛИМПИЯ'],
  ['УИЛЕР',        'ЛЕГЕНДА ЭСТЕТИКИ']
];
(function renderLegends() {
  const items = LEGENDS.map(([n, r], i) =>
    `<span class="legm"><span class="lm-name ${i % 2 ? 'st' : ''}">${n}</span><span class="lm-rec">${r}</span></span><i class="dm"></i>`
  ).join('');
  $('#legTrack').innerHTML = `<div class="bm-group">${items}</div><div class="bm-group">${items}</div>`;
})();

/* ================= НАВИГАЦИЯ ================= */
const nav = $('#nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });
 $('#burger').addEventListener('click', () => {
  document.body.classList.toggle('menu-open');
  $('#burger').setAttribute('aria-expanded', document.body.classList.contains('menu-open'));
  refreshLock();
});
 $$('.mmenu a, .mmenu .m-close').forEach(el =>
  el.addEventListener('click', () => { document.body.classList.remove('menu-open'); refreshLock(); }));

if (HAS_IO) {
  const linkMap = {};
  $$('.nav-links a').forEach(a => linkMap[a.getAttribute('href').slice(1)] = a);
  const secIO = new IntersectionObserver(es => es.forEach(e => {
    const l = linkMap[e.target.id];
    if (l && e.isIntersecting) {
      $$('.nav-links a').forEach(x => x.classList.remove('active'));
      l.classList.add('active');
    }
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['programs', 'iron', 'support', 'nutrition', 'glossary', 'contacts'].forEach(id => {
    const el = document.getElementById(id); if (el) secIO.observe(el);
  });
}

/* ================= ПИТАНИЕ ================= */
(function initNutrition() {
  const W = $('#nutWeight'); if (!W) return;
  const out = { p: $('#mP'), f: $('#mF'), c: $('#mC'), k: $('#mK') };
  const notesEl = $('#nutNotes'), goalEl = $('#nutGoalNote');
  const g = n => Math.round(n);
  let goal = 'recomp';
  const DATA = {
    recomp: {
      calc(w) {
        const p = 2.5*w, f = 0.8*w, c = 3.5*w;
        return { p: g(p)+'', f: g(f)+'', c: g(c)+'', k: Math.round(p*4 + c*4 + f*9) };
      },
      notes: [
        'Белки — 2,5 г на кг веса: фундамент мышц.',
        'Жиры — 0,8 г на кг. Если комфортно — можно 0,5–0,6 г/кг.',
        'Углеводы — 3,5 г на кг: энергия на тренировки и восстановление.'
      ],
      goal: 'На своей рекомпозиции я часть дней специально урезал углеводы — можно делать так же. Но следи за силами на тренировке: если копится усталость — углей нужно больше.'
    },
    gain: {
      calc(w) {
        const p = 2.5*w, f = 0.8*w, c1 = 4.2*w, c2 = 5*w;
        return { p: g(p)+'', f: g(f)+'', c: g(c1)+'–'+g(c2), k: Math.round(p*4 + f*9 + (c1+c2)/2*4) };
      },
      notes: [
        'Белки — 2,5 г на кг веса.',
        'Жиры — как на рекомпозиции: 0,8 г/кг (если комфортно — 0,5–0,6).',
        'Углеводы — 4,2–5 г на кг: главный мотор набора.'
      ],
      goal: 'Весь набор крутится вокруг углеводов: белки и жиры держишь стабильными — играешь цифрой углей под темп роста веса.'
    },
    cut: {
      calc(w) {
        const p1 = 2.5*w, p2 = 3*w, f1 = 0.5*w, f2 = 0.6*w, c1 = 2*w, c2 = 2.4*w;
        return { p: g(p1)+'–'+g(p2), f: g(f1)+'–'+g(f2), c: g(c1)+'–'+g(c2),
                 k: Math.round((p1+p2)/2*4 + (f1+f2)/2*9 + (c1+c2)/2*4) };
      },
      notes: [
        'Белки — 2,5–3 г на кг: держим много, чтобы мышцы не ушли.',
        'Жиры — 0,5–0,6 г на кг. Ниже — гормональная система может сбоить.',
        'Углеводы — 2–2,4 г на кг.'
      ],
      goal: 'На сушке главное — чтобы силы хватало на повседневные дела. О прогрессе весом в зале стоит позабыть: будет очень тяжело. Это норма сушки, а не отклонение.'
    }
  };
  function render() {
    const w = parseFloat(String(W.value).replace(',', '.'));
    if (!w || w < 20 || w > 400) {
      out.p.innerHTML = '—<i>г</i>'; out.f.innerHTML = '—<i>г</i>'; out.c.innerHTML = '—<i>г</i>';
      out.k.textContent = '—';
      return;
    }
    const d = DATA[goal].calc(w);
    out.p.innerHTML = d.p + '<i>г</i>';
    out.f.innerHTML = d.f + '<i>г</i>';
    out.c.innerHTML = d.c + '<i>г</i>';
    out.k.textContent = d.k.toLocaleString('ru-RU');
    notesEl.innerHTML = DATA[goal].notes.map(t =>
      '<div class="nut-note"><i class="ri-corner-down-right-line"></i><span>' + t + '</span></div>').join('');
    goalEl.textContent = DATA[goal].goal;
  }
  $$('.nut-tabs .gy-chip').forEach(b => b.addEventListener('click', () => {
    goal = b.dataset.goal;
    $$('.nut-tabs .gy-chip').forEach(x => x.classList.toggle('on', x === b));
    render();
  }));
  W.addEventListener('input', render);
  render();
})();

/* ================= TELEGRAM: форма обращения ================= */
 $('#cmSend').addEventListener('click', () => {
  const ta = $('#cmText'), msg = ta.value.trim();
  if (!msg) { toast('Сначала напиши сообщение.', 'ri-error-warning-line'); return; }
  try { if (navigator.clipboard) navigator.clipboard.writeText(msg); } catch (e) {}
  window.open('https://t.me/RBares1337?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  toast('Открываю Telegram — текст будет в поле сообщения (копия в буфере).', 'ri-telegram-fill');
});

/* ================= КОПИРОВАНИЕ ================= */
function copyText(text, label) {
  const done = () => toast('Скопировано: ' + label, 'ri-check-double-line');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback());
  } else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (_) { toast(text); }
    ta.remove();
  }
}
 $$('.copy-btn').forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy, b.dataset.copy)));

 $('#toTop').addEventListener('click', () => scrollTo({ top: 0, behavior: PRM ? 'auto' : 'smooth' }));

/* ================= PWA (офлайн) ================= */
(function initPWA() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();

/* подсказка, если хранение закрыто */
if (!LS_OK) setTimeout(() =>
  toast('Хранение закрыто (предпросмотр). Прогресс переживёт перезакрытие только через код «ДАННЫЕ · БЭКАП».', 'ri-database-2-line'), 2600);

/* ================= ФОТОКАРТОЧКА ТРЕНИРОВКИ ================= */
function wrapText(x, text, font, maxW) {
  x.font = font;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
async function renderCardJPEG(pid) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
  const p = getProg(pid);
  const rows = listRows(pid);
  let done = 0; rows.forEach(r => { if ($('.ck', r).checked) done++; });
  const ton = computeTonnage(pid);
  const now = new Date();
  const when = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const W = 1080, MAXH = 4200, M = 72, CW = W - M * 2;
  const c = document.createElement('canvas'); c.width = W; c.height = MAXH;
  const x = c.getContext('2d');

  x.fillStyle = '#0a0a0b'; x.fillRect(0, 0, W, MAXH);
  const gr = x.createRadialGradient(W / 2, 240, 60, W / 2, 240, 900);
  gr.addColorStop(0, 'rgba(225,6,0,0.16)'); gr.addColorStop(1, 'rgba(225,6,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, W, MAXH);

  let y = 100;
  x.save(); x.translate(M + 14, y + 12); x.rotate(Math.PI / 4); x.fillStyle = '#e10600'; x.fillRect(-13, -13, 26, 26); x.restore();
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  x.font = '700 72px Oswald, sans-serif';
  x.fillStyle = '#f1efe9'; x.fillText('ARES', M + 52, y + 38);
  const wA = x.measureText('ARES ').width;
  x.fillStyle = '#e10600'; x.fillText('GYM', M + 52 + wA, y + 38);
  x.textAlign = 'right';
  x.font = '500 24px "JetBrains Mono", monospace'; x.fillStyle = '#84878d';
  x.fillText(when, W - M, y + 14);
  x.fillText('POWER · DISCIPLINA', W - M, y + 48);
  x.textAlign = 'left';
  y += 108;
  x.fillStyle = '#e10600'; x.fillRect(M, y, CW, 4); y += 48;

  x.font = '700 88px Oswald, sans-serif';
  wrapText(x, (p.full || 'ТРЕНИРОВКА').toUpperCase(), '700 88px Oswald, sans-serif', CW).forEach(L => { x.fillStyle = '#f1efe9'; x.fillText(L, M, y); y += 92; });
  y += 4;
  if (p.tags) {
    x.font = '500 26px "JetBrains Mono", monospace'; x.fillStyle = '#84878d';
    wrapText(x, p.tags.toUpperCase(), '500 26px "JetBrains Mono", monospace', CW).forEach(L => { x.fillText(L, M, y); y += 36; });
  }
  y += 6;
  x.font = '700 30px "JetBrains Mono", monospace'; x.fillStyle = '#ff3b2a';
  x.fillText('ЗАКРЫТО ' + done + '/' + rows.length + ' ПОДХОДОВ', M, y); y += 48;

  if (lastStats && lastStats.pid === pid) {
    const chips = [['ВРЕМЯ', fmtDur(lastStats.secs)], ['ОТДЫХ', fmtDur(lastStats.rest)], ['ТОННАЖ', fmtKg(lastStats.ton.total) + ' КГ']];
    const gap = 18, wch = (CW - gap * 2) / 3; let cx = M;
    chips.forEach(([k, v]) => {
      x.fillStyle = '#131315'; x.fillRect(cx, y, wch, 116);
      x.strokeStyle = '#38383e'; x.lineWidth = 2; x.strokeRect(cx, y, wch, 116);
      x.textAlign = 'center';
      x.font = '600 20px "JetBrains Mono", monospace'; x.fillStyle = '#84878d'; x.fillText(k, cx + wch / 2, y + 36);
      x.font = '700 38px Oswald, sans-serif'; x.fillStyle = '#f1efe9'; x.fillText(v, cx + wch / 2, y + 86);
      x.textAlign = 'left';
      cx += wch + gap;
    });
    y += 156;
  } else y += 10;

  let curG = null, n = 0;
  for (const r of rows) {
    if (y > MAXH - 460) break;
    if (r.dataset.g !== curG) {
      curG = r.dataset.g; n = 0; y += 20;
      x.font = '600 40px Oswald, sans-serif'; x.fillStyle = '#f1efe9';
      wrapText(x, r.dataset.blk.toUpperCase(), '600 40px Oswald, sans-serif', CW).forEach(L => { x.fillText(L, M, y); y += 48; });
      const eq = editedEq(r);
      if (eq) { x.font = '600 24px "JetBrains Mono", monospace'; x.fillStyle = '#ff3b2a'; x.fillText('· ' + eq.toUpperCase(), M, y - 12); y += 34; }
      x.fillStyle = '#212125'; x.fillRect(M, y, CW, 2); y += 28;
    }
    n++;
    const w = $('.in-w', r).value.trim(), rr = $('.in-r', r).value.trim();
    const tech = r.dataset.tech, note = $('.s-note-in', r).value.trim(), d = $('.ck', r).checked;
    const join = /^[0-9]/.test(w) ? '×' : ' × ';
    x.font = '700 28px "JetBrains Mono", monospace';
    x.fillStyle = d ? '#ff3b2a' : '#54575d';
    x.fillText(String(n).padStart(2, '0'), M, y);
    x.fillStyle = d ? '#f1efe9' : '#84878d';
    const main = w + join + rr;
    x.fillText(main, M + 64, y);
    let extra = tech ? ' (' + tech + ')' : '';
    if (!d) extra += ' — НЕ ВЫПОЛНЕНО';
    if (extra) {
      const x0 = M + 64 + x.measureText(main).width + 22;
      x.font = '500 24px "JetBrains Mono", monospace'; x.fillStyle = '#84878d';
      wrapText(x, extra, '500 24px "JetBrains Mono", monospace', Math.max(W - M - x0, 320)).forEach((L, i) => { x.fillText(L, i ? M + 64 : x0, y + i * 32); });
      y += Math.max(36, 32 * wrapText(x, extra, '500 24px "JetBrains Mono", monospace', Math.max(W - M - x0, 320)).length - 4);
    } else y += 36;
    if (note) {
      x.font = '500 22px "JetBrains Mono", monospace'; x.fillStyle = '#6a6d73';
      wrapText(x, '— ' + note, '500 22px "JetBrains Mono", monospace', CW - 64).forEach(L => { x.fillText(L, M + 64, y); y += 30; });
      y += 6;
    }
  }

  if (ton.blocks.length && y < MAXH - 560) {
    y += 26;
    x.fillStyle = '#e10600'; x.fillRect(M, y, CW, 3); y += 42;
    x.font = '700 26px "JetBrains Mono", monospace'; x.fillStyle = '#ff3b2a';
    x.fillText('ТОННАЖ ПО БЛОКАМ', M, y); y += 46;
    x.font = '500 26px "JetBrains Mono", monospace';
    ton.blocks.forEach(b => {
      if (y > MAXH - 220) return;
      x.textAlign = 'left'; x.fillStyle = '#b9bcc2';
      const nm = wrapText(x, b.name, '500 26px "JetBrains Mono", monospace', CW - 420)[0];
      x.fillText(nm, M, y);
      x.textAlign = 'right'; x.fillStyle = '#f1efe9';
      x.fillText(fmtKg(b.kg) + ' кг · ' + b.n + ' подх.', W - M, y);
      x.textAlign = 'left';
      y += 38;
    });
  }

  y += 32;
  x.fillStyle = '#e10600'; x.fillRect(M, y, CW, 3); y += 38;
  x.font = '600 24px "JetBrains Mono", monospace'; x.fillStyle = '#84878d';
  x.fillText('— ARES GYM · ЖЕЛЕЗО PANATTA · MADE IN ITALY', M, y); y += 42;

  const H = Math.min(MAXH, Math.ceil(y) + 56);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  out.getContext('2d').drawImage(c, 0, 0, W, H, 0, 0, W, H);
  return out.toDataURL('image/jpeg', 0.92);
}
async function sendPhotoCard() {
  const pid = reportPid;
  if (!pid) { toast('Сначала открой отчёт тренировки.', 'ri-error-warning-line'); return; }
  const btn = $('#repPhoto'); btn.disabled = true;
  toast('Рисую карточку…', 'ri-image-2-line');
  try {
    const b64 = await renderCardJPEG(pid);
    const payload = (TG_SESSION.mode === 'tg' && TG_SESSION.initData)
      ? { initData: TG_SESSION.initData, b64: b64 }
      : { token: localStorage.getItem('ARES_TOKEN_V1') || '', b64: b64 };
    const r = await fetch(BOT_API + '/api/photo', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) toast('Фотокарточка улетела в Telegram.', 'ri-telegram-fill');
    else if (j.reason === 'rate') toast('Слишком часто — подожди минуту и попробуй снова.', 'ri-error-warning-line');
    else if (j.reason === 'denied' || r.status === 403) toast('Сессия истекла — обнови страницу и введи код заново.', 'ri-error-warning-line');
    else toast('Не отправилось. Проверь доступ или отправь отчёт текстом.', 'ri-error-warning-line');
  } catch (e) {
    toast('Не получилось нарисовать карточку.', 'ri-error-warning-line');
  }
  btn.disabled = false;
}

/* ================= MINI APP: доступ + баны + техработы + блоки ================= */
const BOT_API = 'https://ares-gym-bot.maks222berg.workers.dev';
const TG_SESSION = { mode: null, initData: null, name: null, blocks: {} };
window.ARES_BLOCKS = {};

/* ================= КОНТЕНТ ПРОГРАММ: кэш + загрузка с воркера =================
   Контент приходит с /api/programs только после проверки доступа
   (token/initData). Кэш в localStorage: повторные входы — мгновенно,
   офлайн работает. Если версия у воркера новее — перерисовываем. */
const PROG_LS_KEY = 'ARES_PROG_V1';
let currentProgV = null;
function loadCachedPrograms() {
  try {
    const raw = LS.get(PROG_LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && o.v != null && o.payload && Array.isArray(o.payload.programs) && o.payload.programs.length) return o;
  } catch (e) {}
  return null;
}
function syncCards() {
  PROGRAMS.forEach(p => {
    const card = document.querySelector('.pcard[data-target="' + p.id + '"]');
    if (!card) return;
    const t = $('.pc-tags', card), m = $('.pc-meta', card);
    if (t) t.textContent = p.tags || '';
    if (m) m.textContent = p.meta || '';
  });
}
function renderPrograms() {
  $('#panels').innerHTML = PROGRAMS.map(panelHTML).join('') + customPanelHTML();
  syncCards();
  try {
    bindRows($('#panels'));
    bindEq($('#panels'));
    ['push', 'pull', 'legs', 'custom'].forEach(updateProgress);
    initCalc();
  } catch (e) { document.documentElement.classList.add('nojs-ok'); }
  bindResetButtons();
}
function showProgSkeleton() {
  $('#panels').innerHTML =
    '<div class="prog-skel" id="progSkel"><i class="ri-dumbbell-line"></i> ПРОГРАММЫ КЛУБА ЗАГРУЖАЮТСЯ<span class="sk-bar"></span></div>' +
    customPanelHTML();
  try {
    bindRows($('#panel-custom'));
    bindEq($('#panel-custom'));
    updateProgress('custom');
  } catch (e) {}
}
function applyPrograms(payload) {
  if (!payload || !Array.isArray(payload.programs) || !payload.programs.length) return;
  if (currentProgV === payload.v) return;
  /* идёт тренировка — не перерисовываем под ногами: новое применится при следующем входе */
  if (gym) return;
  currentProgV = payload.v;
  PROGRAMS = payload.programs || [];
  ATLAS = payload.atlas || {};
  ATLAS_TIP = payload.atlasTip || '';
  CALC_SPECS = payload.calc || {};
  window.__programsLoaded = true;
  renderPrograms();
}
async function fetchPrograms() {
  const pay = {};
  if (TG_SESSION.mode === 'tg' && TG_SESSION.initData) pay.initData = TG_SESSION.initData;
  else { const t = localStorage.getItem('ARES_TOKEN_V1'); if (!t) return; pay.token = t; }
  try {
    const r = await fetch(BOT_API + '/api/programs', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pay) });
    if (!r.ok) return;
    const d = await r.json().catch(() => ({}));
    if (d && d.ok && d.payload && Array.isArray(d.payload.programs) && d.payload.programs.length) {
      try { LS.set(PROG_LS_KEY, JSON.stringify({ v: d.payload.v, payload: d.payload })); } catch (e) {}
      applyPrograms(d.payload);
    }
  } catch (e) {}
}
(function initPrograms() {
  const cached = loadCachedPrograms();
  if (cached) applyPrograms(cached.payload);
  else showProgSkeleton();
  setTimeout(() => {
    if (!window.__programsLoaded) {
      const sk = document.getElementById('progSkel');
      if (sk) sk.innerHTML = '<i class="ri-wifi-off-line"></i> НЕ ЗАГРУЗИЛОСЬ — ПРОВЕРЬ СВЯЗЬ И ПЕРЕЗАЙДИ';
    }
  }, 10000);
})();

(function initGate() {
  const wa = window.Telegram && window.Telegram.WebApp;
  if (wa) { try { wa.ready(); wa.expand(); } catch (e) {} }
  const gate = $('#gateModal'), body = $('#gateBody');
  let tmIv = null, rcIv = null;
  const show = html => { body.innerHTML = html; gate.classList.add('open'); refreshLock(); };
  const hide = () => {
    if (tmIv) { clearInterval(tmIv); tmIv = null; }
    if (rcIv) { clearInterval(rcIv); rcIv = null; }
    gate.classList.remove('open'); refreshLock();
  };

  function countdown(until) {
    if (tmIv) { clearInterval(tmIv); tmIv = null; }
    const tick = () => {
      const e = document.getElementById('gateTm'); if (!e) return;
      const d = until - Date.now();
      if (d <= 0) { e.textContent = 'разблокировка…'; if (tmIv) { clearInterval(tmIv); tmIv = null; } setTimeout(() => location.reload(), 2000); return; }
      const s = Math.ceil(d / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
      e.textContent = (h ? h + ' ч ' : '') + (m ? m + ' мин ' : '') + x + ' с';
    };
    tick(); tmIv = setInterval(tick, 1000);
  }
  function startRecheck(clearFn) {
    if (rcIv) clearInterval(rcIv);
    rcIv = setInterval(async () => {
      if (!gate.classList.contains('open')) { if (rcIv) { clearInterval(rcIv); rcIv = null; } return; }
      try {
        const wa2 = window.Telegram && window.Telegram.WebApp;
        const pay = (wa2 && wa2.initData) ? { initData: wa2.initData } : { token: localStorage.getItem('ARES_TOKEN_V1') || '' };
        const r = await fetch(BOT_API + '/api/auth', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pay) });
        if (!r.ok) return;
        const d = await r.json().catch(() => ({}));
        if (clearFn(d)) location.reload();
      } catch (e) {}
    }, 20000);
  }
  function blockScreen(kind, reason, until, clearFn) {
    const t = kind === 'ban' ? 'ДОСТУП ПРИОСТАНОВЛЕН' : 'ТЕХ РАБОТЫ';
    show(`
      <span class="dat-label" style="color:var(--red-hi)">${t}</span>
      ${reason ? `<p class="dat-p"><b style="color:var(--txt)">${escA(reason)}</b></p>` : ''}
      <span class="dat-label">ДО РАЗБЛОКИРОВКИ</span>
      <p class="dat-p" style="font:700 26px var(--fh);color:var(--red-hi)" id="gateTm">…</p>`);
    if (until) countdown(until);
    else { const e = document.getElementById('gateTm'); if (e) e.textContent = 'до решения владельца'; }
    if (clearFn) startRecheck(clearFn);
  }
  window.aresShowBlock = pid => {
    const b = TG_SESSION.blocks[pid]; if (!b) return;
    blockScreen('lock', b.reason, b.until, d => !(d.blocks && d.blocks[pid]));
  };
  function applyBlocks(blocks) {
    window.ARES_BLOCKS = blocks || {}; TG_SESSION.blocks = blocks || {};
    Object.keys(window.ARES_BLOCKS).forEach(pid => {
      const b = window.ARES_BLOCKS[pid];
      if (!b || (b.until && b.until <= Date.now())) return;
      const card = document.querySelector('.pcard[data-target="' + pid + '"]');
      if (card && !card.querySelector('.pc-badge')) {
        const sp = document.createElement('span');
        sp.className = 'pc-badge'; sp.textContent = 'НА ТЕХ РАБОТАХ';
        card.appendChild(sp);
      }
    });
  }
  function denyScreen() {
    show(`
      <span class="dat-label">ДОСТУП ЗАКРЫТ</span>
      <p class="dat-p">ARES GYM — клуб по приглашению. Открой бота и нажми <b>/start</b> — владелец получит твой ID и откроет доступ.</p>
      <a class="btn-fin" href="https://t.me/AresGYM_app" target="_blank" rel="noopener" style="justify-content:center"><i class="ri-telegram-fill"></i> ОТКРЫТЬ БОТА</a>`);
  }
  /* экран кода: err — неверный код; blocked — лимит попыток; tokenDead — сессия истекла */
  function codeScreen(err, tokenDead, blocked) {
    show(`
      <span class="dat-label">КОД ДОСТУПА</span>
      <p class="dat-p">${blocked
        ? 'Слишком много неверных попыток с этого адреса — подожди час или войди через Telegram.'
        : tokenDead
        ? 'Сессия истекла (токен живёт 30 дней) — введи код заново, он выдаст новый токен.'
        : 'Сайт открыт вне Telegram — введи код доступа. Один раз, запомнится.'}</p>
      <input class="dat-in" id="gateCode" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="код" spellcheck="false">
      ${err ? '<span class="dat-warn" style="color:var(--red-hi)">Неверный код — попробуй ещё.</span>' : ''}
      <div class="dat-actions"><button class="btn-fin" id="gateOk"><i class="ri-check-line"></i> ВОЙТИ</button></div>`);
    $('#gateOk').addEventListener('click', async () => {
      const code = $('#gateCode').value.trim(); if (!code) return;
      try {
        const r = await fetch(BOT_API + '/api/auth', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok && d.token) {
          localStorage.setItem('ARES_TOKEN_V1', d.token);
          localStorage.removeItem('ARES_CODE_V1');
          localStorage.removeItem('ARES_TG_OK_V1');
          if (await handleState(d, 'code', null)) { hide(); toast('Доступ открыт — сессия на 30 дней.', 'ri-checkbox-circle-fill'); }
          return;
        }
        if (r.status === 429) { codeScreen(false, false, true); return; }
        codeScreen(true, false, false);
      } catch (e) { toast('Сервер недоступен — проверь связь.', 'ri-error-warning-line'); }
    });
  }
  async function handleState(d, mode, initData) {
    if (d.ban) { blockScreen('ban', d.ban.reason, d.ban.until, x => !x.lock && !x.ban); return false; }
    if (d.lock) { blockScreen('lock', d.lock.reason, d.lock.until, x => !x.lock && !x.ban); return false; }
    TG_SESSION.mode = mode; TG_SESSION.initData = initData || null;
    TG_SESSION.name = d.user && d.user.name;
    applyBlocks(d.blocks || {});
    startHeartbeat(initData);
    fetchPrograms(); /* контент программ — только после подтверждённого доступа */
    return true;
  }
  function startHeartbeat(initData) {
    const BEAT = 300; /* 5 мин: ×5 экономия запросов и записей KV; при коротком заходе до 5 мин не досчитается */
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      try {
        const pay = { seconds: BEAT };
        if (initData) pay.initData = initData;
        else { const t = localStorage.getItem('ARES_TOKEN_V1'); if (!t) return; pay.token = t; }
        fetch(BOT_API + '/api/beat', { method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pay) }).catch(function(){});
      } catch (e) {}
    }, BEAT * 1000);
  }
  (async function run() {
    const initData = wa ? (wa.initData || '') : '';
    try {
      if (initData) {
        /* шлём устройство (userAgent + userAgentData) воркеру для /activity */
        let uad = null;
        try {
          if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)
            uad = await navigator.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
        } catch (e) { uad = null; }
        const r = await fetch(BOT_API + '/api/auth', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: initData, userAgent: navigator.userAgent || '', userAgentData: uad }) });
        if (r.ok) { const d = await r.json().catch(() => ({})); await handleState(d, 'tg', initData); return; }
        denyScreen(); return;
      }
      const token = localStorage.getItem('ARES_TOKEN_V1');
      if (token) {
        const r = await fetch(BOT_API + '/api/auth', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok) { await handleState(d, 'code', null); return; }
        /* токен умер/отозван → чистим и просим код */
        localStorage.removeItem('ARES_TOKEN_V1');
        codeScreen(false, true, false);
        return;
      }
    } catch (e) { return; }
    codeScreen(false, false, false);
  })();

  $('#repSendTG').addEventListener('click', async () => {
    const report = $('#reportText').textContent.trim();
    if (!report) { toast('Отчёт пуст.', 'ri-error-warning-line'); return; }
    const payload = { report };
    if (TG_SESSION.mode === 'tg' && TG_SESSION.initData) payload.initData = TG_SESSION.initData;
    else { const t = localStorage.getItem('ARES_TOKEN_V1'); if (t) payload.token = t; }
    const btn = $('#repSendTG'); btn.disabled = true;
    try {
      const r = await fetch(BOT_API + '/api/report', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) toast('Отчёт улетел в Telegram.', 'ri-telegram-fill');
      else {
        let m = 'Не отправилось — доступ не подтверждён.';
        try { const j = await r.json();
          if (j.reason === 'banned') m = 'Ты в бане' + (j.msg ? ': ' + j.msg : '') + '. Отчёт не принят — скопируй его текст.';
          if (j.reason === 'lock') m = 'Техработы' + (j.msg ? ': ' + j.msg : '') + '. Отчёт не принят — скопируй текст, отправишь после открытия.';
          if (j.reason === 'rate') m = 'Слишком часто — подожди полминуты и попробуй снова.';
          if (j.reason === 'denied') m = 'Сессия истекла — обнови страницу и введи код заново.';
        } catch (e) {}
        toast(m, 'ri-error-warning-line');
      }
    } catch (e) {
      toast('Сервер недоступен — скопируй отчёт вручную.', 'ri-error-warning-line');
    }
    btn.disabled = false;
  });

  $('#repPhoto').addEventListener('click', sendPhotoCard);
})();

window.__aresReady = true;
