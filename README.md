# EasyBitT

Chromium 浏览器扩展：在网页中的磁力链接 / .torrent 链接上右键，推送到内网 qBittorrent WebUI 下载，推送前可编辑下载参数。

## 功能

- **右键推送**：任意 `magnet:` / `.torrent` 链接右键 →「通过 BitTorrent 下载…」
- **划选识别**：选中包含磁力链接的文本右键即可推送
- **下载设置弹窗**：链接、下载目录（最近 8 条历史下拉）、分类、开始状态，Enter 直推，可记住为默认
- **工具栏进度面板**：全部 / 下载 / 做种 / 完成 / 暂停 标签页，按添加时间排序，任务行内直接 开始 / 暂停 / 删除（二次确认），一键跳转 WebUI
- **免密支持**：qBittorrent 配置网段免密（白名单）时用户名密码可留空，也支持账密登录
- **系统通知**：推送成功 / 失败即时反馈

## 安装

1. 下载本项目（或 Release 中的 zip 解压）
2. Chrome / Edge 打开 `chrome://extensions`，开启右上角「开发者模式」
3. 「加载已解压的扩展程序」→ 选择含 `manifest.json` 的目录
4. 打开扩展设置页，填入 WebUI 地址（如 `http://192.168.1.100:8085`）；用户名密码按 qBittorrent 配置，可留空
5. 「测试连接」通过后即可使用

## 环境

- Chrome / Edge 等 Chromium 内核浏览器，Manifest V3
- 适配 qBittorrent WebUI API v2（在 v4.6.4 上实测）

## 目录结构

```
manifest.json          # MV3 配置
background.js          # Service Worker：右键菜单 / 推送 / 通知
lib/qbittorrent.js     # qBittorrent WebUI API v2 客户端
dialog/                # 下载设置弹窗
options/               # 扩展设置页
popup/                 # 工具栏进度面板
icons/                 # 图标
scripts/gen-icons.ps1  # 图标生成脚本（构建用，不参与加载）
```
