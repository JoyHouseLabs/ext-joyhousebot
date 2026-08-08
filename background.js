// JoyhouseBot service worker:右侧 Side Panel + 右键菜单 + 统一 API 出口。
// content/popup 不直接访问后端——都经这里转发,自带 token,免碰 CORS。

const MENU_SELECTION = "sa-translate-selection";
const MENU_PAGE = "sa-translate-page";
const MENU_CLIP_SELECTION = "sa-clip-selection";
const MENU_CLIP_IMAGE = "sa-clip-image";
const MENU_CLIP_LINK = "sa-clip-link";
const MENU_CLIP_PAGE = "sa-clip-page";
const API_BASE = "https://app.joyhouse.chat";
const WEB_APP = "https://app.joyhouse.chat";
const AUTH_GATEWAY = "https://auth.joyhouse.chat";
const BRIDGE_ID = "sa-auth-bridge";
const CONSENT_VERSION = "2026-08-01";

async function hasDataConsent() {
  const { dataConsentVersion } = await chrome.storage.local.get({ dataConsentVersion: "" });
  return dataConsentVersion === CONSENT_VERSION;
}

async function requireDataConsent() {
  if (!(await hasDataConsent())) {
    throw new Error("请先点击 JoyhouseBot 图标，阅读并同意数据处理说明");
  }
}

function enableSidePanel() {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// 点击工具栏图标打开 Chrome 原生侧栏。
enableSidePanel();

// 页面采集由 content/extractors.js 的站点适配器完成；这里仅负责消息调用与补注入。
async function extractFromTab(tabId) {
  if (!tabId) throw new Error("没有可抓取的网页");
  const request = async () => {
    const response = await chrome.tabs.sendMessage(tabId, { type: "sa.extractPage" });
    if (!response?.ok) throw new Error(response?.error || "正文抓取失败");
    return response.data;
  };
  try {
    return await request();
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/extractors.js", "content/content.js"],
    });
    return request();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    // 商店版只连接正式 HTTPS 服务；清理旧开发版遗留的本地/自定义地址。
    await chrome.storage.local.remove(["apiBase", "webApp", "token"]);
    if (!(await hasDataConsent())) {
      const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [BRIDGE_ID] });
      if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] });
    }
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: MENU_SELECTION, title: 'JoyhouseBot 翻译:"%s"', contexts: ["selection"] });
    chrome.contextMenus.create({ id: MENU_PAGE, title: "JoyhouseBot 整页双语翻译", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU_CLIP_SELECTION, title: "存进 Joyhouse 书房", contexts: ["selection"] });
    chrome.contextMenus.create({ id: MENU_CLIP_IMAGE, title: "保存图片到 Joyhouse 书房", contexts: ["image"] });
    chrome.contextMenus.create({ id: MENU_CLIP_LINK, title: "保存链接到 Joyhouse 书房", contexts: ["link"] });
    chrome.contextMenus.create({ id: MENU_CLIP_PAGE, title: "收藏本页到 Joyhouse 书房", contexts: ["page"] });
    enableSidePanel();
  })().catch(() => {});
});

// 浏览器/扩展 service worker 重启后再次确保 action 仍打开侧栏。
chrome.runtime.onStartup.addListener(() => {
  enableSidePanel();
});

// 资料库:链接域名命中视频站则 kind=video
const CLIP_VIDEO_HOSTS = ["bilibili.com", "youtube.com", "youtu.be", "youku.com", "iqiyi.com", "v.qq.com"];

function clipKindForLink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return CLIP_VIDEO_HOSTS.some((d) => host === d || host.endsWith(`.${d}`)) ? "video" : "url";
  } catch {
    return "url";
  }
}

async function clipSave(clip) {
  return api("/api/v1/admin/clips", {
    method: "POST",
    body: { tags: [], attachments: [], ...clip, visibility: "private" },
  });
}

// 保存图片:扩展源 fetch 图片字节(无 CORS 限制)→ multipart 上传 → 拿到 attachments 条目
async function clipUploadImage(srcUrl) {
  await requireDataConsent();
  const resp = await fetch(srcUrl);
  if (!resp.ok) throw new Error(`图片获取失败(${resp.status})`);
  const blob = await resp.blob();
  const name = srcUrl.split("/").pop()?.split(/[?#]/)[0] || "image.png";
  const form = new FormData();
  form.append("file", new File([blob], name, { type: blob.type || "image/png" }));
  const { token } = await chrome.storage.session.get({ token: "" });
  const up = await fetch(`${API_BASE}/api/v1/admin/clips/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,   // 让浏览器自己带 multipart boundary,别设 Content-Type
  });
  const data = await up.json().catch(() => ({}));
  if (up.status === 401) throw new Error("未登录或登录已过期,点插件图标登录");
  if (!up.ok) throw new Error(data.detail || `上传失败(${up.status})`);
  return data;   // {url,name,mime,size,is_image}
}

// X 等页面抓取时，将页面图片真正下载并上传到 Joyhouse，资料里只保存自有附件地址。
async function clipSavePage(clip) {
  const { image_urls: rawImageUrls = [], extractor = "generic", ...payload } = clip || {};
  const imageLimit = extractor === "wechat_mp" ? 50 : (extractor === "x_status" ? 9 : 20);
  const imageUrls = [...new Set(rawImageUrls.filter((url) => /^https?:\/\//i.test(String(url))))].slice(0, imageLimit);
  const attachments = [...(payload.attachments || [])];
  const uploadedImages = [];
  let imageFailures = 0;
  for (const imageUrl of imageUrls) {
    try {
      const attachment = await clipUploadImage(String(imageUrl));
      attachments.push(attachment);
      if (attachment.is_image) uploadedImages.push({ sourceUrl: String(imageUrl), attachment });
    } catch {
      imageFailures += 1;
    }
  }
  // 站点适配器已将图片按原位置写进 Markdown：上传后替换为 Joyhouse 自有链接。
  // X 等只返回独立图片列表的适配器，则继续在正文末尾补图。
  const originalBody = String(payload.body || "").trim();
  let body = originalBody;
  for (const { sourceUrl, attachment } of uploadedImages) {
    if (body.includes(sourceUrl)) body = body.split(sourceUrl).join(attachment.url);
  }
  const unplacedImages = uploadedImages.filter(({ sourceUrl }) => !originalBody.includes(sourceUrl));
  const imageMarkdown = unplacedImages
    .map(({ attachment }, index) => `![文章图片 ${index + 1}](${attachment.url})`)
    .join("\n\n");
  if (imageMarkdown) body = [body, imageMarkdown].filter(Boolean).join("\n\n");
  const saved = await clipSave({ ...payload, body, attachments });
  return { ...saved, captured_images: uploadedImages.length, image_failures: imageFailures };
}

// 保存结果 toast 回页面(content.js 的 sa.toast);403 详情(未订阅引导)由后端 detail 带出
function clipNotify(tabId, p, okText) {
  p.then(() => {
    chrome.tabs.sendMessage(tabId, { type: "sa.toast", text: `JoyhouseBot:${okText}` }, () => void chrome.runtime.lastError);
  }).catch((e) => {
    chrome.tabs.sendMessage(tabId, { type: "sa.toast", text: `JoyhouseBot:保存失败:${e?.message || e}` }, () => void chrome.runtime.lastError);
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  void (async () => {
    if (!(await hasDataConsent())) {
      chrome.tabs.sendMessage(tab.id, {
        type: "sa.toast",
        text: "JoyhouseBot:请先点击扩展图标并同意数据处理说明",
      }, () => void chrome.runtime.lastError);
      return;
    }
    if (info.menuItemId === MENU_SELECTION && info.selectionText) {
      chrome.tabs.sendMessage(tab.id, { type: "sa.showCard", text: info.selectionText });
    } else if (info.menuItemId === MENU_PAGE) {
      chrome.tabs.sendMessage(tab.id, { type: "sa.togglePage" });
    } else if (info.menuItemId === MENU_CLIP_SELECTION && info.selectionText) {
      clipNotify(tab.id, clipSave({
        kind: "note", title: tab.title || "", body: info.selectionText, source_url: tab.url || "",
      }), "已存进书房");
    } else if (info.menuItemId === MENU_CLIP_IMAGE && info.srcUrl) {
      clipNotify(tab.id, (async () => {
        const attachment = await clipUploadImage(info.srcUrl);
        return clipSave({
          kind: "image", title: tab.title || "", source_url: tab.url || "", attachments: [attachment],
        });
      })(), "图片已存进书房");
    } else if (info.menuItemId === MENU_CLIP_LINK && info.linkUrl) {
      clipNotify(tab.id, clipSave({
        kind: clipKindForLink(info.linkUrl),
        title: info.linkText || info.linkUrl,
        source_url: info.linkUrl,
      }), "链接已存进书房");
    } else if (info.menuItemId === MENU_CLIP_PAGE) {
      clipNotify(tab.id, (async () => {
        let page = {};
        try { page = await extractFromTab(tab.id); } catch { /* 受限页面仅保存链接 */ }
        return clipSavePage({
          kind: "url",
          title: page.title || tab.title || "",
          body: page.body || "",
          source_url: page.source_url || tab.url || "",
          image_urls: page.image_urls || [],
          extractor: page.extractor || "generic",
        });
      })(), "本页已存进书房");
    }
  })().catch(() => {});
});

// ---------- Joyhouse 会话同步 / 微信扫码登录 ----------
// 优先复用已打开 app.joyhouse.chat 的登录态；没有会话时再走与 web-home
// 相同的 auth.joyhouse.chat 授权网关，扫码成功后桥回插件。

let wechatLoginTabId = null;

function webOrigin() { return WEB_APP; }

async function ensureAuthBridge(origin) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [BRIDGE_ID] });
  const wantedMatch = `${origin}/*`;
  if (existing.length && existing[0]?.matches?.includes(wantedMatch)) return;
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] });
  await chrome.scripting.registerContentScripts([{
      id: BRIDGE_ID,
      matches: [wantedMatch],
      js: ["auth_bridge.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
  }]);
}

async function validateStoredSession() {
  await requireDataConsent();
  const [{ token }, { accountLabel }] = await Promise.all([
    chrome.storage.session.get({ token: "" }),
    chrome.storage.local.get({ accountLabel: "" }),
  ]);
  if (!token) return { authenticated: false };
  try {
    const resp = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) {
      await Promise.all([
        chrome.storage.session.remove("token"),
        chrome.storage.local.remove("accountLabel"),
      ]);
      return { authenticated: false };
    }
    if (!resp.ok) return { authenticated: true, accountLabel };
    const me = await resp.json();
    const resolvedLabel = me.name || accountLabel || "Joyhouse 登录";
    await chrome.storage.local.set({ accountLabel: resolvedLabel });
    return { authenticated: true, accountLabel: resolvedLabel };
  } catch {
    // 临时网络故障不主动清除本地会话。
    return { authenticated: true, accountLabel };
  }
}

async function syncWebSession() {
  await requireDataConsent();
  const existing = await validateStoredSession();
  if (existing.authenticated) return existing;

  const origin = webOrigin();
  await ensureAuthBridge(origin);
  const tabs = await chrome.tabs.query({ url: [`${origin}/*`] });
  await Promise.allSettled(tabs.filter((tab) => tab.id).map((tab) =>
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["auth_bridge.js"] })
  ));
  // auth_bridge 通过消息异步写入扩展 storage，给即时同步留一个事件循环窗口。
  await new Promise((resolve) => setTimeout(resolve, 250));
  return validateStoredSession();
}

async function wechatStart() {
  await requireDataConsent();
  const origin = webOrigin();
  const session = await syncWebSession();
  if (session.authenticated) return { ...session, reused: true };

  await ensureAuthBridge(origin);
  const scan = `${AUTH_GATEWAY}/api/v1/admin/qrcode/wechat-auth?origin=${encodeURIComponent(origin)}`;
  const tab = await chrome.tabs.create({ url: scan });
  wechatLoginTabId = tab.id || null;
  return { authenticated: false, opened: true };
}

async function api(path, { method = "GET", body } = {}) {
  await requireDataConsent();
  const { token } = await chrome.storage.session.get({ token: "" });
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401) throw new Error("未登录或登录已过期,点插件图标登录");
  if (!resp.ok) throw new Error(data.detail || `请求失败(${resp.status})`);
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const wrap = (p) =>
    p.then((data) => sendResponse({ ok: true, data }))
     .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  switch (msg?.type) {
    case "sa.consent.status":
      wrap(hasDataConsent());
      return true;
    case "sa.consent.revoke":
      wrap((async () => {
        await Promise.all([
          chrome.storage.session.remove("token"),
          chrome.storage.local.remove([
            "token", "accountLabel", "dataConsentVersion", "dataConsentAcceptedAt",
            "apiBase", "webApp",
          ]),
        ]);
        const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [BRIDGE_ID] });
        if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] });
        return { revoked: true };
      })());
      return true;
    case "sa.extractPage":
      wrap(requireDataConsent().then(() => extractFromTab(Number(msg.tabId))));
      return true;
    case "sa.wechatStart":
      wrap(wechatStart());
      return true;
    case "sa.syncWebSession":
      wrap(syncWebSession());
      return true;
    case "sa.wechatToken":
      wrap((async () => {
        await requireDataConsent();
        await Promise.all([
          chrome.storage.session.set({ token: msg.token }),
          chrome.storage.local.set({ accountLabel: msg.accountLabel || "Joyhouse 登录" }),
        ]);
        if (sender.tab?.id && sender.tab.id === wechatLoginTabId) {
          chrome.tabs.remove(sender.tab.id);
          wechatLoginTabId = null;
        }
        return { ok: true };
      })());
      return true;
    case "sa.api.translate":
      wrap(api("/api/v1/translate", {
        method: "POST",
        body: { text: msg.text, target_lang: "auto", url: msg.url || "" },
      }));
      return true;
    case "sa.api.tts":
      wrap((async () => {
        const r = await api("/api/v1/translate/tts", { method: "POST", body: { text: msg.text } });
        // 由扩展源抓取音频，再转为 data URL 交给页面播放，避免页面侧跨域限制。
        const resp = await fetch(`${API_BASE}${r.audio_url}`);
        if (!resp.ok) throw new Error(`音频加载失败(${resp.status})`);
        const ctype = resp.headers.get("content-type") || "";
        if (!ctype.startsWith("audio/")) throw new Error(`音频内容异常(${ctype || "未知类型"})`);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        return { audio_url: `data:audio/mpeg;base64,${btoa(bin)}` };
      })());
      return true;
    case "sa.api.saveWord":
      wrap(api("/api/v1/translate/words", { method: "POST", body: msg.word }));
      return true;
    case "sa.api.clipSave":
      wrap(clipSavePage(msg.clip || {}));
      return true;
    case "sa.api.history":
      wrap(api(`/api/v1/translate/history?limit=${msg.limit || 20}`));
      return true;
    case "sa.api.words":
      wrap(api(`/api/v1/translate/words?limit=${msg.limit || 200}`));
      return true;
    default:
      return false;
  }
});
