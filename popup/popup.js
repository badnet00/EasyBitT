// EasyBitT — 工具栏进度面板（全部 / 下载 / 做种 / 完成 + 任务操作）
const $ = (id) => document.getElementById(id);

const DL_STATES = new Set([
  'downloading', 'forcedDL', 'metaDL', 'forcedMetaDL',
  'stalledDL', 'queuedDL',
  'checkingDL', 'checkingUP', 'checkingResumeData',
  'allocatingDL', 'moving'
]);
const SEED_STATES = new Set(['uploading', 'forcedUP', 'stalledUP', 'queuedUP']);
const PAUSED_STATES = new Set(['pausedUP', 'stoppedUP', 'pausedDL', 'stoppedDL']);

// qB 4.6.4 实测状态名（含 5.x 的 stopped* 新名做兼容）
const STATE_MAP = {
  downloading: '下载中',
  forcedDL: '下载中',
  metaDL: '获取元数据',
  forcedMetaDL: '获取元数据',
  stalledDL: '等待中',
  queuedDL: '排队中',
  uploading: '做种',
  forcedUP: '做种',
  stalledUP: '做种',
  queuedUP: '排队做种',
  checkingDL: '校验中',
  checkingUP: '校验中',
  checkingResumeData: '校验中',
  allocatingDL: '分配空间',
  moving: '移动中',
  pausedDL: '已暂停',
  stoppedDL: '已暂停',
  pausedUP: '已完成',
  stoppedUP: '已完成',
  error: '错误',
  missingFiles: '文件丢失',
  unknown: '未知'
};

// 与 qBittorrent 侧栏对应的分类
const TAB_FILTERS = {
  all: () => true,
  dl: (t) => DL_STATES.has(t.state),
  seed: (t) => SEED_STATES.has(t.state),
  done: (t) => (t.progress || 0) >= 1 - 1e-6,
  paused: (t) => PAUSED_STATES.has(t.state)
};

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

let settings = {};
let currentTab = 'dl';
let lastTorrents = [];
let pendingDelete = null;   // 两段式删除确认：第一次点变红，3 秒内再点执行
let pendingDeleteTimer = null;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtBytes(n) {
  if (n == null || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (v >= 100 ? Math.round(v) : v.toFixed(1)) + ' ' + units[i];
}

function fmtEta(s) {
  // qB 用 8640000 表示未知
  if (s == null || s < 0 || s >= 8640000) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return '剩余 ' + h + 'h' + m + 'm';
  if (m > 0) return '剩余 ' + m + 'm' + sec + 's';
  return '剩余 ' + sec + 's';
}

function renderCounts() {
  for (const tab of Object.keys(TAB_FILTERS)) {
    const el = document.getElementById('cnt-' + tab);
    if (el) el.textContent = lastTorrents.filter(TAB_FILTERS[tab]).length;
  }
}

function render() {
  renderCounts();
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === currentTab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  const listEl = $('list');
  // 按添加时间排序，新的在上
  const ts = lastTorrents
    .filter(TAB_FILTERS[currentTab])
    .sort((a, b) => (b.added_on || 0) - (a.added_on || 0));

  if (!ts.length) {
    listEl.innerHTML = '<div class="hintcard">暂无任务</div>';
    return;
  }

  listEl.innerHTML = ts.map((t) => {
    const label = STATE_MAP[t.state] || '未知';
    const pct = Math.round((t.progress || 0) * 1000) / 10;
    const meta = [];
    if (t.dlspeed > 0) meta.push('↓ ' + fmtBytes(t.dlspeed) + '/s');
    if (t.upspeed > 0) meta.push('↑ ' + fmtBytes(t.upspeed) + '/s');
    if (!meta.length) meta.push(label);
    const eta = fmtEta(t.eta);
    if (eta) meta.push(eta);
    const toggle = PAUSED_STATES.has(t.state)
      ? '<button type="button" class="act" data-act="resume" data-hash="' + esc(t.hash) + '" title="开始">' + ICON_PLAY + '</button>'
      : '<button type="button" class="act" data-act="pause" data-hash="' + esc(t.hash) + '" title="暂停">' + ICON_PAUSE + '</button>';
    const del =
      '<button type="button" class="act del' + (pendingDelete === t.hash ? ' confirm' : '') +
      '" data-act="delete" data-hash="' + esc(t.hash) + '" title="删除任务及其文件（再点一次确认）">' + ICON_TRASH + '</button>';
    return (
      '<div class="task" role="button" tabindex="0" aria-label="' + esc(t.name) + '">' +
        '<div class="row1">' +
          '<span class="tname" title="' + esc(t.name) + '">' + esc(t.name) + '</span>' +
          '<span class="acts">' + toggle + del + '</span>' +
          '<span class="pct">' + pct.toFixed(1) + '%</span>' +
        '</div>' +
        '<div class="pbar"><div class="pfill' + (t.progress >= 1 ? ' bar-done' : '') + '" style="width:' + pct + '%"></div></div>' +
        '<div class="row2">' +
          '<span class="state">' + esc(label) + '</span>' +
          '<span class="meta">' + esc(meta.join(' · ')) + '</span>' +
          '<span class="size">' + fmtBytes(t.total_size) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

async function refresh() {
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ type: 'ebt-list' });
  } catch (e) {
    res = { ok: false, error: 'net', message: String((e && e.message) || e) };
  }
  if (!res) res = { ok: false, error: 'net', message: '后台无响应' };

  if (!res.ok) {
    lastTorrents = [];
    const cfg = res.error === 'not_configured';
    $('list').innerHTML =
      '<div class="hintcard">' + esc(res.message || '无法获取任务') +
      (cfg ? '<button type="button" class="btn btn-primary" id="go-cfg">打开设置</button>' : '') +
      '</div>';
    const go = document.getElementById('go-cfg');
    if (go) go.addEventListener('click', () => chrome.runtime.openOptionsPage());
    renderCounts();
    return;
  }

  lastTorrents = res.torrents || [];
  render();
  $('upd').textContent = '更新于 ' + new Date().toLocaleTimeString();
}

function openWebUI() {
  const base = EBTQbit.normalizeBaseUrl(settings.baseUrl);
  if (base) chrome.tabs.create({ url: base + '/' });
}

async function doAction(act, hash) {
  try {
    await chrome.runtime.sendMessage({ type: 'ebt-action', action: act, hash: hash });
  } catch (e) { /* 刷新后会反映真实状态 */ }
  setTimeout(refresh, 300);
}

function handleAct(btn) {
  const act = btn.dataset.act;
  const hash = btn.dataset.hash;
  if (act === 'delete') {
    if (pendingDelete === hash) {
      pendingDelete = null;
      clearTimeout(pendingDeleteTimer);
      doAction('delete', hash);
    } else {
      const prev = document.querySelector('.act.confirm');
      if (prev) prev.classList.remove('confirm');
      btn.classList.add('confirm');
      pendingDelete = hash;
      clearTimeout(pendingDeleteTimer);
      pendingDeleteTimer = setTimeout(() => {
        pendingDelete = null;
        const b = document.querySelector('.act.confirm');
        if (b) b.classList.remove('confirm');
      }, 3000);
    }
    return;
  }
  pendingDelete = null;
  clearTimeout(pendingDeleteTimer);
  doAction(act, hash);
}

$('webui').addEventListener('click', openWebUI);
$('gear').addEventListener('click', () => chrome.runtime.openOptionsPage());

document.querySelectorAll('.tab').forEach((b) => {
  b.addEventListener('click', () => {
    if (currentTab === b.dataset.tab) return;
    currentTab = b.dataset.tab;
    chrome.storage.local.set({ popupTab: currentTab }).catch(() => {});
    render();
  });
});

// 任务行点击 → 打开 WebUI；行内按钮 → 操作
$('list').addEventListener('click', (e) => {
  const act = e.target.closest('.act');
  if (act) {
    e.stopPropagation();
    handleAct(act);
    return;
  }
  if (e.target.closest('.task')) openWebUI();
});
$('list').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('task')) {
    e.preventDefault();
    openWebUI();
  }
});

(async () => {
  settings = await chrome.storage.local.get({
    baseUrl: '', username: '', password: '', savePath: '', category: '', paused: false, popupTab: 'dl'
  });
  currentTab = TAB_FILTERS[settings.popupTab] ? settings.popupTab : 'dl';
  refresh();
  setInterval(refresh, 2500);
})();
