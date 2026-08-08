# Chrome Web Store · Privacy practices 填写稿

以下内容应与扩展 `0.4.1`、商店介绍和 `https://joyhousebot.com/privacy/` 保持一致。

## Single purpose description

在网页阅读过程中采集、翻译和理解用户主动选择的内容，并将用户主动保存的资料沉淀到其 JoyHouse 私人书房。

English:

> Help users capture, translate and understand content they actively select while reading on the web, and save the material they choose to their private JoyHouse library.

## Permission justifications

### `storage`

在 Chrome 内存会话存储中保存登录令牌，并在本地保存账号显示名、用户对数据处理说明的同意记录和必要偏好，以维持当前浏览器会话的登录、同步和用户选择。扩展不保存账号密码。

### `contextMenus`

在用户主动右键时提供翻译、整页双语、保存选中文字、图片、链接或当前页面的入口。

### `scripting`

在用户访问的网页中运行扩展安装包内自带的采集与翻译脚本，并在 JoyHouse 页面同步用户主动登录后的会话。扩展不会下载或执行远程代码。

### `sidePanel`

点击扩展图标后，在 Chrome 原生侧边栏展示首次数据披露、登录、网页采集和书房入口。

### Host permissions: `http://*/*`, `https://*/*`

用户可以在任意 HTTP/HTTPS 网页主动划词翻译、生成双语对照或采集正文和图片，因此扩展需要读取当前网页并显示页面内交互。扩展不会在后台持续记录浏览历史，也不会将网页数据用于广告或画像。

## Remote code

选择：`No, I am not using remote code.`

说明：所有可执行逻辑均包含在扩展 ZIP 中。扩展只通过 HTTPS 调用 JoyHouse API 获取翻译、语音、账号和资料保存结果；服务端响应是数据或音频，不包含可执行 JavaScript、WebAssembly 或动态规则代码。

## Data categories

应勾选：

- `Personally identifiable information`：用户主动登录或注册时的邮箱、手机号、昵称或账号标识。
- `Authentication information`：密码仅在登录请求中通过 HTTPS 传输；扩展只在 Chrome 内存会话存储中保存令牌，不保存密码。
- `Website content`：用户主动翻译、朗读、采集或收藏时涉及的标题、正文、选中文字和图片。
- `Web history / browsing activity`：为当前用户操作处理页面 URL 和来源信息；不持续收集浏览历史。
- `User-generated content`：用户主动保存的资料、生词、上下文、翻译历史或备注类内容。

除非代码和业务以后实际增加，否则不要勾选：精确位置、健康、金融与支付、私人通信。

## Data usage certification

- 数据只用于扩展公开说明的单一用途和用户可见功能。
- 不出售用户数据。
- 不将用户数据用于个性化、重定向或兴趣广告。
- 不将用户数据用于与单一用途无关的信用、借贷或类似资格判断。
- 仅在提供功能、保障安全、履行法律义务或合法的合并收购所必需时转移数据。
- 除用户针对具体支持请求明确许可、安全调查、法律要求，或聚合且匿名化的内部运行外，不允许工作人员读取私人内容。

## Public links

- Privacy policy: `https://joyhousebot.com/privacy/`
- English privacy policy: `https://joyhousebot.com/en/privacy/`
- Homepage: `https://joyhousebot.com/`
- Support: `https://joyhousebot.com/support/`
- Email: `han@joyhouse.chat`
