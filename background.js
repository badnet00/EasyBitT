// EasyBitT — Service Worker：右键菜单、任务弹窗、推送、系统通知
// 工具栏图标由 popup 进度面板接管（manifest.action.default_popup）。
importScripts('lib/qbittorrent.js');

const MENU_LINK = 'ebt-link';
const MENU_SEL = 'ebt-selection';
const DEFAULT_SETTINGS = {
  baseUrl: '',
  username: '',
  password: '',
  savePath: '',
  category: '',
  paused: false
};

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_LINK, title: '通过 BitTorrent 下载…', contexts: ['link'] });
    chrome.contextMenus.create({ id: MENU_SEL, title: '通过 BitTorrent 下载选中的磁力链接…', contexts: ['selection'] });
  });
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === MENU_LINK) {
    // <a> 链接地址在 linkUrl；srcUrl 仅图片/音视频等带 src 的元素才有
    const url = info.linkUrl || info.srcUrl || '';
    if (!url) {
      notify('EasyBitT', '未能读取链接地址');
      return;
    }
    const type = url.startsWith('magnet:') ? 'magnet'
      : (/\.torrent(\?|#|$)/i.test(url) ? 'torrent' : 'url');
    await openDialog({ url: url, type: type });
  } else if (info.menuItemId === MENU_SEL) {
    const text = info.selectionText || '';
    const m = text.match(/magnet:\?[^\s"'<>]+/);
    if (!m) {
      notify('EasyBitT', '未在选中文本中找到磁力链接');
      return;
    }
    await openDialog({ url: m[0], type: 'magnet' });
  }
});

async function openDialog(job) {
  try {
    await chrome.storage.session.set({ ebtJob: job });
  } catch (e) {
    // 写入会话存储失败不阻断弹窗；弹窗侧字段仍可手动填写
    console.error('storage.session.set failed:', e);
  }
  chrome.windows.create({
    url: chrome.runtime.getURL('dialog/dialog.html'),
    type: 'popup',
    width: 480,
    height: 640
  });
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: title,
    message: message
  });
}

async function getSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    msg = msg || {};
    if (msg.type === 'ebt-push') {
      const job = msg.job || {};
      const r = await EBTQbit.addTorrent(await getSettings(), job);
      if (r.ok) notify('EasyBitT · 已推送', '开始下载：' + (job.name || job.url.slice(0, 90)));
      else notify('EasyBitT · 推送失败', r.error || '未知错误');
      sendResponse(r);
    } else if (msg.type === 'ebt-list') {
      sendResponse(await EBTQbit.listTorrents(await getSettings()));
    } else if (msg.type === 'ebt-action') {
      // 面板内任务操作：开始 / 暂停 / 删除
      sendResponse(await EBTQbit.torrentAction(await getSettings(), msg.action, msg.hash || ''));
    } else if (msg.type === 'ebt-test') {
      sendResponse(await EBTQbit.testConnection(msg.settings || {}));
    }
  })();
  return true; // 异步 sendResponse
});
