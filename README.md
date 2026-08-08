# JoyhouseBot(Chrome 扩展,MV3)

Joyhouse 的浏览器采集与双语阅读入口:把网页内容带回书房,同时提供划词翻译、整页双语、英文朗读和生词本。数据全部落到自家后端。

## 功能

- **收藏到书房**:点「抓取正文」会提取并立即写入一条资料，随后「打开书房」直达该资料;也可点「收藏本页」自动抓取并保存标题/正文/原地址，抓取失败时退回仅保存链接;右键也可保存选中文字、图片、链接或整页
- **X 专项采集**:识别 `/status/` 推文页，只取当前推文正文;推文图片会以原图下载并上传到 Joyhouse，同时保留为附件并用 Markdown 图片链接插入正文，不依赖 X 外链。当前不对图片执行 OCR
- **微信公众号专项采集**:识别 `mp.weixin.qq.com/s/`，锁定 `#js_content` 获取完整文章 DOM，不受当前滚动位置影响;保留标题层级、段落、列表、引用、链接和正文图片。懒加载图片从 `data-src` 读取并上传到 Joyhouse，再按原位置替换为自有链接
- **站点适配器架构**:`content/extractors.js` 维护 `微信公众号 → X → 通用网页` 的有序适配器注册表;新增站点只需实现 `matches/extract`，统一输出标题、Markdown 正文、来源和图片列表

- **登录/注册**:主站账号(手机号或邮箱,`/api/v1/auth/login`);无账号点「去注册」,
  轻量注册(`/api/v1/auth/register-account`,consumer 角色,注册即登录)
- **Joyhouse 登录态复用 / 微信扫码登录**:侧栏打开时先检查已打开的 `app.joyhouse.chat`
  主站会话并同步 token；主站未登录时，点「微信扫码登录」才会跳转
  `auth.joyhouse.chat` 授权中心。扫码完成后 web-home 写入 `localStorage.jh_token`，
  `auth_bridge.js` 将会话桥回插件
- **划词翻译**:网页里选中文本 → 悬浮「译」按钮 → 卡片显示译文;或右键菜单「JoyhouseBot 翻译」
- **朗读**:翻译卡片分别提供「朗读原文」和「朗读翻译」；使用后端 edge 神经音色 TTS（可在后台「系统配置→语音合成」换音色）
- **生词本**:卡片里 ★,存入 `/api/v1/translate/words`(同词自动更新)
- **整页双语**:通过右键菜单触发,逐段对照插入译文(再次触发关闭);单次上限 60 段、3 并发
- **常驻侧边栏**:点击工具栏 JoyhouseBot 图标后在 Chrome 右侧 Side Panel 打开;切换或浏览网页时保持可见,再次点侧边栏关闭按钮才收起
- 方向自动检测(含中文→译成英文,反之→译成中文);翻译历史自动保存
- 网络故障友好提示:正式服务暂时不可达时给出可操作的重试提示
- **数据处理同意**:首次登录或处理网页数据前，必须在扩展内阅读披露并主动同意；可在「设置 → 隐私与数据」撤回同意
- **会话最小化**:登录令牌只保存在 Chrome 内存会话存储中，浏览器会话结束、退出或撤回同意时自动清除

## 安装（发布包）

1. 从 [GitHub Releases](https://github.com/JoyHouseLabs/ext-joyhousebot/releases) 下载最新的 `joyhousebot-chrome-extension.zip`
2. 解压 ZIP 到一个固定位置；不要直接把 ZIP 拖入 Chrome，也不要删除解压后的文件
3. Chrome 打开 `chrome://extensions/`，右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择刚才解压后的文件夹（包含 `manifest.json`）
5. 固定并点击工具栏中的 JoyhouseBot 图标，在右侧栏阅读数据处理说明并登录

升级时，下载新版发布包并解压到新文件夹；然后在 `chrome://extensions/` 中移除旧版本或选择「重新加载」。

## 从源码安装（开发者模式）

1. Chrome 打开 `chrome://extensions/`,右上角开「开发者模式」
2. 「加载已解压的扩展程序」→ 选本目录(`apps/ext-joyhousebot`)
3. 点工具栏 JoyhouseBot 图标 → 右侧栏打开 → 阅读数据处理说明并登录

## 服务地址

Chrome 商店版固定连接 `https://app.joyhouse.chat`，账号密码登录与业务 API 均使用 HTTPS；微信扫码登录使用 `https://auth.joyhouse.chat`。扩展不提供本地或自定义服务器配置入口。

## 结构

```
├── manifest.json        # MV3 清单
├── background.js        # service worker:右键菜单 + 统一 API 出口(带 token,免 CORS)+ 微信登录桥
├── auth_bridge.js       # 微信登录用:注入 web 站轮询 localStorage token 桥回
├── popup/               # Chrome Side Panel 页面:首次披露/登录/注册/采集 + 账号与隐私设置
├── content/extractors.js # 页面采集适配器:微信公众号 / X / 通用网页
├── content/             # content script:划词卡片(Shadow DOM)+ 整页双语
└── icons/               # PIL 生成的渐变图标(16/48/128)
```

## 注意

- TTS 服务不可达时朗读会失败;翻译本身不受影响
- 整页翻译跳过 `code/pre/textarea` 等元素;单段 20–2000 字才翻译(跳过导航碎块)
- 未覆盖:PDF/视频字幕/输入框翻译(对标沉浸式翻译的后续方向)

## License

Copyright 2026 JoyHouse Labs.

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
