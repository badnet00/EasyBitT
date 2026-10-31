// EasyBitT — qBittorrent WebUI API v2 客户端
// 在 Service Worker 中经 importScripts 加载，暴露全局 EBTQbit。
(function (global) {
  'use strict';

  // 规范化 WebUI 地址：补协议、去尾部斜杠
  function normalizeBaseUrl(input) {
    let u = (input || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/\/+$/, '');
  }

  function apiFetch(base, path, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const opts = Object.assign({ credentials: 'include' }, init, { signal: ctrl.signal });
    return fetch(base + path, opts).finally(() => clearTimeout(timer));
  }

  // qB 多数写操作端点接受 urlencoded 表单
  function apiPost(base, path, params) {
    const body = new URLSearchParams(params || {}).toString();
    return apiFetch(base, path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body
    });
  }

  // 登录获取 SID cookie；成功时 qB 返回 "Ok."
  async function login(base, username, password) {
    const body = new URLSearchParams({ username: username, password: password });
    const res = await apiFetch(base, '/api/v2/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString()
    });
    const text = (await res.text()).trim();
    if (res.ok && text.toLowerCase() === 'ok.') return { ok: true };
    if (res.status === 403) return { ok: false, error: '登录失败（403）：密码错误次数过多已临时封禁，请稍后再试' };
    return { ok: false, error: '登录失败：' + (text || 'HTTP ' + res.status) };
  }

  function wrapNetworkError(e) {
    if (e && e.name === 'AbortError') return { ok: false, error: '连接 WebUI 超时（15s），请检查地址与网络' };
    return { ok: false, error: '无法连接 WebUI：' + ((e && e.message) || e) };
  }

  // username 为空 → 免密模式（qBittorrent 网段白名单 / localhost 免密），跳过登录
  async function testConnection(settings) {
    const base = normalizeBaseUrl(settings.baseUrl);
    if (!base) return { ok: false, error: '请先填写 WebUI 地址' };
    try {
      let res = await apiFetch(base, '/api/v2/app/version', { method: 'GET' });
      if (res.status === 403 && (settings.username || '').trim()) {
        const lg = await login(base, settings.username.trim(), settings.password || '');
        if (!lg.ok) return lg;
        res = await apiFetch(base, '/api/v2/app/version', { method: 'GET' });
      }
      if (res.ok) return { ok: true, version: (await res.text()).trim() };
      if (res.status === 403) {
        return { ok: false, error: 'WebUI 需要认证：请填写用户名密码，或在 qBittorrent 中把本机网段加入免密白名单' };
      }
      return { ok: false, error: 'HTTP ' + res.status };
    } catch (e) {
      return wrapNetworkError(e);
    }
  }

  // job: { url, savepath, category, paused, name }
  async function addTorrent(settings, job) {
    const base = normalizeBaseUrl(settings.baseUrl);
    if (!base) return { ok: false, error: '请先在扩展设置中填写 WebUI 地址' };
    const uname = (settings.username || '').trim();
    try {
      if (uname) {
        const lg = await login(base, uname, settings.password || '');
        if (!lg.ok) return lg;
      }
      const form = new FormData();
      form.append('urls', job.url);
      if (job.savepath) form.append('savepath', job.savepath);
      if (job.category) form.append('category', job.category);
      const paused = job.paused ? 'true' : 'false';
      form.append('paused', paused);   // qB < 4.4
      form.append('stopped', paused);  // qB >= 4.4
      form.append('autoTMM', 'false');
      const res = await apiFetch(base, '/api/v2/torrents/add', { method: 'POST', body: form });
      const text = (await res.text()).trim();
      if (res.ok && text.toUpperCase() !== 'FAILS.') return { ok: true };
      if (res.status === 403) return { ok: false, error: '推送被拒绝（403）：用户名密码错误，或未配置网段免密' };
      if (res.status === 409) return { ok: false, error: '任务已存在（重复添加）' };
      return { ok: false, error: '添加失败：' + (text || 'HTTP ' + res.status) + '（任务可能已存在，或链接无效）' };
    } catch (e) {
      return wrapNetworkError(e);
    }
  }

  // 任务操作：action = 'resume' | 'pause' | 'delete'（删除连同已下载数据）
  async function torrentAction(settings, action, hash) {
    const base = normalizeBaseUrl(settings.baseUrl);
    if (!base) return { ok: false, error: '请先在扩展设置中填写 WebUI 地址' };
    if (!hash) return { ok: false, error: '缺少任务哈希' };
    const uname = (settings.username || '').trim();
    try {
      if (uname) {
        const lg = await login(base, uname, settings.password || '');
        if (!lg.ok) return lg;
      }
      let path;
      const params = { hashes: hash };
      if (action === 'resume') path = '/api/v2/torrents/resume';
      else if (action === 'pause') path = '/api/v2/torrents/pause';
      else if (action === 'delete') { path = '/api/v2/torrents/delete'; params.deleteFiles = 'true'; }
      else return { ok: false, error: '未知操作：' + action };
      const res = await apiPost(base, path, params);
      if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
      return { ok: true };
    } catch (e) {
      return wrapNetworkError(e);
    }
  }

  // 任务列表（工具栏进度面板用，全量返回后由面板按标签页过滤），403 时自动补登录重试
  async function listTorrents(settings) {
    const base = normalizeBaseUrl(settings.baseUrl);
    if (!base) return { ok: false, error: 'not_configured', message: '请先在设置中配置 WebUI 地址' };
    try {
      const path = '/api/v2/torrents/info';
      let res = await apiFetch(base, path, { method: 'GET' });
      if (res.status === 403 && (settings.username || '').trim()) {
        const lg = await login(base, settings.username.trim(), settings.password || '');
        if (!lg.ok) return { ok: false, error: 'auth', message: lg.error };
        res = await apiFetch(base, path, { method: 'GET' });
      }
      if (res.status === 403) return { ok: false, error: 'auth', message: 'WebUI 需要认证：请填写用户名密码，或配置网段免密' };
      if (!res.ok) return { ok: false, error: 'http', message: 'HTTP ' + res.status };
      return { ok: true, torrents: await res.json() };
    } catch (e) {
      const w = wrapNetworkError(e);
      return { ok: false, error: 'net', message: w.error };
    }
  }

  global.EBTQbit = { normalizeBaseUrl, testConnection, addTorrent, listTorrents, torrentAction };
})(self);
