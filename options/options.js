// EasyBitT — 设置页
const $ = (id) => document.getElementById(id);

const DEFAULTS = { baseUrl: '', username: '', password: '', savePath: '', category: '', paused: false };
let toastTimer = null;

function gather() {
  return {
    baseUrl: $('baseUrl').value.trim(),
    username: $('username').value.trim(),
    password: $('password').value,
    savePath: $('savePath').value.trim(),
    category: $('category').value.trim(),
    paused: $('paused').value === 'paused'
  };
}

async function init() {
  const s = await chrome.storage.local.get(DEFAULTS);
  $('baseUrl').value = s.baseUrl;
  $('username').value = s.username;
  $('password').value = s.password;
  $('savePath').value = s.savePath;
  $('category').value = s.category;
  $('paused').value = s.paused ? 'paused' : 'start';
}

function setStatus(cls, html) {
  const el = $('status');
  el.className = 'status ' + cls;
  el.innerHTML = html;
}

$('test').addEventListener('click', async () => {
  const btn = $('test');
  btn.disabled = true;
  setStatus('busy', '<span class="spin"></span>连接中…');
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ type: 'ebt-test', settings: gather() });
  } catch (e) {
    res = { ok: false, error: String((e && e.message) || e) };
  }
  btn.disabled = false;
  if (res && res.ok) {
    setStatus('ok', '连接成功 · qBittorrent ' + (res.version || '').replace(/^v/, ''));
  } else {
    setStatus('err', (res && res.error) || '测试失败');
  }
});

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set(gather());
  const toast = $('toast');
  $('toast-text').textContent = '设置已保存';
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
});

init().catch((e) => setStatus('err', '读取设置失败：' + ((e && e.message) || e)));
