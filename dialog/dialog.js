// EasyBitT — 下载设置弹窗
const $ = (id) => document.getElementById(id);

const BTN_IDLE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>立即推送';
const BTN_BUSY = '<span class="spin"></span>推送中…';
const BTN_DONE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>已推送';

const PRESET_CATS = ['软件镜像', '电影', '剧集', '音乐'];
const START_OPTIONS = [
  { label: '立即开始', value: 'start' },
  { label: '添加后暂停', value: 'paused' }
];

// 三个字段（目录/分类/开始状态）共用同一种下拉控件
const DROPDOWNS = {
  dir: { input: 'dir', btn: 'dir-dd', panel: 'dir-panel' },
  cat: { input: 'cat', btn: 'cat-dd', panel: 'cat-panel' },
  start: { input: 'start', btn: 'start-dd', panel: 'start-panel' }
};

let settings = {};
let job = { url: '', type: 'url' };
let startValue = 'start';
let openPanelName = null;

function typeBadgeText(t) {
  return t === 'magnet' ? '磁力链接' : (t === 'torrent' ? '.torrent 文件' : '链接');
}

function shortName(url) {
  if (url.indexOf('magnet:') === 0) {
    const m = /dn=([^&]+)/.exec(url);
    return m ? decodeURIComponent(m[1]) : '磁力任务';
  }
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

function labelForStart(v) {
  const o = START_OPTIONS.find((o) => o.value === v);
  return o ? o.label : '立即开始';
}

function showErr(text, withSettingsBtn) {
  $('error-text').textContent = text;
  $('error-settings').hidden = !withSettingsBtn;
  $('error').hidden = false;
}

async function init() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get({ baseUrl: '', username: '', password: '', savePath: '', category: '', paused: false, lastUsed: null }),
    chrome.storage.session.get({ ebtJob: null })
  ]);
  settings = local;
  job = session.ebtJob || job;

  $('link').value = job.url || '';
  $('type-badge').textContent = typeBadgeText(job.type);

  const base = EBTQbit.normalizeBaseUrl(settings.baseUrl);
  if (base) {
    let host = base;
    try { host = new URL(base).host; } catch (e) { /* 保持原样 */ }
    $('target-text').textContent = '推送目标 · ' + host;
  } else {
    $('target-dot').classList.add('off');
    $('target-text').textContent = '未配置 WebUI';
  }

  const last = settings.lastUsed || {};
  $('dir').value = last.savePath || settings.savePath || '';
  $('cat').value = last.category || settings.category || '';
  const pausedPref = (last.paused != null) ? last.paused : settings.paused;
  startValue = pausedPref ? 'paused' : 'start';
  $('start').value = labelForStart(startValue);

  if (job.url) $('link').focus();
}

/* ---------- 统一下拉控件 ---------- */
function closePanels() {
  for (const d of Object.values(DROPDOWNS)) {
    $(d.panel).hidden = true;
    $(d.btn).setAttribute('aria-expanded', 'false');
  }
  openPanelName = null;
}

async function getItemsFor(name) {
  if (name === 'dir') {
    const s = await chrome.storage.local.get({ dirHistory: [] });
    const h = Array.isArray(s.dirHistory) ? s.dirHistory : [];
    return h.map((d) => ({ label: d, value: d }));
  }
  if (name === 'cat') {
    const cur = $('cat').value.trim();
    const items = PRESET_CATS.map((c) => ({ label: c, value: c }));
    if (cur && !PRESET_CATS.includes(cur)) items.unshift({ label: cur, value: cur });
    return items;
  }
  return START_OPTIONS.slice();
}

async function togglePanel(name) {
  if (openPanelName === name) {
    closePanels();
    return;
  }
  closePanels();
  const d = DROPDOWNS[name];
  const panel = $(d.panel);
  const items = await getItemsFor(name);
  panel.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('div');
    p.className = 'dd-empty';
    p.textContent = name === 'dir' ? '暂无历史目录，推送成功后自动记录' : '暂无可选项';
    panel.appendChild(p);
  } else {
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dd-item';
      b.textContent = it.label;
      b.title = it.label;
      b.addEventListener('click', () => {
        $(d.input).value = it.label;
        if (name === 'start') startValue = it.value;
        closePanels();
      });
      panel.appendChild(b);
    }
  }
  if (name === 'dir') {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'dd-clear';
    clear.textContent = '清空历史';
    clear.addEventListener('click', async () => {
      await chrome.storage.local.set({ dirHistory: [] });
      closePanels();
    });
    panel.appendChild(clear);
  }
  panel.hidden = false;
  $(d.btn).setAttribute('aria-expanded', 'true');
  openPanelName = name;
}

/* ---------- 目录历史 ---------- */
async function rememberDir(dir) {
  if (!dir) return;
  const s = await chrome.storage.local.get({ dirHistory: [] });
  let h = Array.isArray(s.dirHistory) ? s.dirHistory : [];
  h = h.filter((x) => x !== dir);
  h.unshift(dir);
  await chrome.storage.local.set({ dirHistory: h.slice(0, 8) });
}

/* ---------- 推送 ---------- */
async function push() {
  const btn = $('push');
  if (btn.disabled) return;
  const url = $('link').value.trim();
  if (!url) {
    showErr('请填写磁力链接或种子地址', false);
    return;
  }
  $('error').hidden = true;
  btn.disabled = true;
  btn.innerHTML = BTN_BUSY;

  const savepath = $('dir').value.trim();
  const category = $('cat').value.trim();
  const paused = startValue === 'paused';

  let res = null;
  try {
    res = await chrome.runtime.sendMessage({
      type: 'ebt-push',
      job: { url: url, savepath: savepath, category: category, paused: paused, name: shortName(url) }
    });
  } catch (e) {
    res = { ok: false, error: String((e && e.message) || e) };
  }

  if (res && res.ok) {
    await rememberDir(savepath);
    if ($('remember').checked) {
      await chrome.storage.local.set({
        lastUsed: { savePath: savepath, category: category, paused: paused }
      });
    }
    btn.classList.add('btn-ok');
    btn.innerHTML = BTN_DONE;
    setTimeout(() => window.close(), 900);
  } else {
    btn.disabled = false;
    btn.innerHTML = BTN_IDLE;
    showErr((res && res.error) || '推送失败', !EBTQbit.normalizeBaseUrl(settings.baseUrl));
  }
}

/* ---------- 事件绑定 ---------- */
$('push').addEventListener('click', push);
$('cancel').addEventListener('click', () => window.close());
$('error-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
for (const [name, d] of Object.entries(DROPDOWNS)) {
  $(d.btn).addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel(name);
  });
}

// 点击面板外关闭下拉
document.addEventListener('click', (e) => {
  if (!openPanelName) return;
  const d = DROPDOWNS[openPanelName];
  if (!$(d.panel).contains(e.target) && e.target !== $(d.btn)) {
    closePanels();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openPanelName) closePanels();
    else window.close();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    push();
  }
});

init().catch((e) => showErr('初始化失败：' + ((e && e.message) || e), false));
