// JoyhouseBot Side Panel:首次数据披露 + 登录/注册/微信扫码 + 网页采集。

const $ = (id) => document.getElementById(id);
const API_BASE = "https://app.joyhouse.chat";
const WEB_APP = "https://app.joyhouse.chat";
const PRIVACY_URL = "https://joyhousebot.com/privacy/";
const TERMS_URL = "https://joyhousebot.com/terms/";
const CONSENT_VERSION = "2026-08-01";

async function store(obj) { return chrome.storage.local.set(obj); }
async function read(keys) { return chrome.storage.local.get(keys); }
async function storeSession(obj) { return chrome.storage.session.set(obj); }
async function readSession(keys) { return chrome.storage.session.get(keys); }

function show(view) {
  $("consent-view").hidden = view !== "consent";
  $("login-view").hidden = view !== "login";
  $("register-view").hidden = view !== "register";
  $("main-view").hidden = view !== "main";
}

function updateAccountUI(label = "") {
  const loggedIn = Boolean(label);
  $("account-summary").textContent = loggedIn ? `已登录:${label}` : "未登录";
  $("user-label").textContent = loggedIn ? label : "未登录";
  $("logout-btn").hidden = !loggedIn;
}

function showError(el, e) {
  // 商店版固定连接生产服务，不接受本地或自定义后端地址。
  const msg = (e instanceof TypeError)
    ? "暂时无法连接 JoyHouse，请检查网络后重试"
    : String(e?.message || e);
  el.textContent = msg;
  el.hidden = false;
}

async function init() {
  const [{ accountLabel, dataConsentVersion, lastSavedClip }, { token }] = await Promise.all([
    read({ accountLabel: "", dataConsentVersion: "", lastSavedClip: null }),
    readSession({ token: "" }),
  ]);
  if (lastSavedClip?.id) savedClip = lastSavedClip;
  if (dataConsentVersion !== CONSENT_VERSION) {
    updateAccountUI();
    $("privacy-summary").textContent = "等待你的同意";
    show("consent");
    return;
  }
  $("privacy-summary").textContent = "已同意数据处理说明";
  let session = token ? { authenticated: true, accountLabel } : { authenticated: false };
  try {
    const response = await chrome.runtime.sendMessage({ type: "sa.syncWebSession" });
    if (response?.ok) session = response.data;
  } catch { /* 后台暂不可用时仍按插件已有 token 展示 */ }
  if (session?.authenticated) {
    const label = session.accountLabel || accountLabel;
    updateAccountUI(label || "Joyhouse 用户");
    show("main");
  } else {
    updateAccountUI();
    show("login");
  }
}

// ---------- 首次数据披露与同意 ----------

$("consent-checkbox").addEventListener("change", (event) => {
  $("consent-accept").disabled = !event.target.checked;
});

$("consent-accept").addEventListener("click", async () => {
  if (!$("consent-checkbox").checked) return;
  await store({
    dataConsentVersion: CONSENT_VERSION,
    dataConsentAcceptedAt: new Date().toISOString(),
  });
  await init();
});

$("privacy-link").addEventListener("click", async (event) => {
  event.preventDefault();
  await chrome.tabs.create({ url: PRIVACY_URL });
});

// ---------- 设置弹层(右上角齿轮):账号 / 隐私与数据 ----------

const SETTINGS_PANELS = {
  root: ["设置", "settings-root-panel"],
  account: ["账号", "settings-account-panel"],
  privacy: ["隐私与数据", "settings-privacy-panel"],
};

function showSettingsPanel(name) {
  const [title, panelId] = SETTINGS_PANELS[name] || SETTINGS_PANELS.root;
  Object.values(SETTINGS_PANELS).forEach(([, id]) => { $(id).hidden = id !== panelId; });
  $("settings-title").textContent = title;
  $("settings-back").hidden = name === "root";
}

function openConfig() {
  showSettingsPanel("root");
  $("config-overlay").hidden = false;
}
function closeConfig() {
  $("config-overlay").hidden = true;
  showSettingsPanel("root");
}

$("gear-btn").addEventListener("click", openConfig);
$("config-close").addEventListener("click", closeConfig);
$("settings-back").addEventListener("click", () => showSettingsPanel("root"));
$("account-settings-open").addEventListener("click", () => showSettingsPanel("account"));
$("privacy-settings-open").addEventListener("click", () => showSettingsPanel("privacy"));
// 点遮罩关闭
$("config-overlay").addEventListener("click", (e) => {
  if (e.target.id === "config-overlay") closeConfig();
});

$("open-privacy-btn").addEventListener("click", () => chrome.tabs.create({ url: PRIVACY_URL }));
$("open-terms-btn").addEventListener("click", () => chrome.tabs.create({ url: TERMS_URL }));
$("revoke-consent-btn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "sa.consent.revoke" });
  updateAccountUI();
  $("consent-checkbox").checked = false;
  $("consent-accept").disabled = true;
  closeConfig();
  show("consent");
});

// ---------- 账号密码登录 ----------

async function login() {
  const account = $("account").value.trim();
  const password = $("password").value;
  $("login-error").hidden = true;
  if (!account || !password) {
    $("login-error").textContent = "请输入账号和密码";
    $("login-error").hidden = false;
    return;
  }
  $("login-btn").disabled = true;
  try {
    const body = account.includes("@") ? { email: account, password } : { phone: account, password };
    const resp = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || `登录失败(${resp.status})`);
    await Promise.all([
      storeSession({ token: data.token }),
      store({ accountLabel: account }),
    ]);
    updateAccountUI(account);
    show("main");
  } catch (e) {
    showError($("login-error"), e);
  } finally {
    $("login-btn").disabled = false;
  }
}

$("login-btn").addEventListener("click", login);
$("password").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });

// ---------- 注册 ----------

async function register() {
  const name = $("reg-name").value.trim();
  const account = $("reg-account").value.trim();
  const password = $("reg-password").value;
  $("register-error").hidden = true;
  if (!account || !password) {
    $("register-error").textContent = "请输入账号和密码";
    $("register-error").hidden = false;
    return;
  }
  if (password !== $("reg-password2").value) {
    $("register-error").textContent = "两次密码不一致";
    $("register-error").hidden = false;
    return;
  }
  $("register-btn").disabled = true;
  try {
    const resp = await fetch(`${API_BASE}/api/v1/auth/register-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password, name }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || `注册失败(${resp.status})`);
    await Promise.all([
      storeSession({ token: data.token }),
      store({ accountLabel: name || account }),
    ]);
    updateAccountUI(name || account);
    show("main");
  } catch (e) {
    showError($("register-error"), e);
  } finally {
    $("register-btn").disabled = false;
  }
}

$("register-btn").addEventListener("click", register);

$("go-register").addEventListener("click", () => show("register"));
$("go-login").addEventListener("click", () => show("login"));

// ---------- 微信扫码(跳 web 站登录页,登录成功后 token 由 content script 桥回) ----------

async function wechatStart() {
  const buttons = [$("wechat-login-btn"), $("wechat-register-btn")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await chrome.runtime.sendMessage({
      type: "sa.wechatStart",
    });
    if (!response?.ok) throw new Error(response?.error || "微信登录启动失败");
    if (response.data?.authenticated) await init();
  } catch (e) {
    showError($("login-error"), e);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

$("wechat-login-btn").addEventListener("click", wechatStart);
$("wechat-register-btn").addEventListener("click", wechatStart);

// 主站扫码完成或已登录标签页被同步后，侧栏立即切到已登录状态。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.token?.newValue) init();
});

// ---------- 主视图 ----------

let extractedPage = null;
let savedClip = null;

async function extractActivePage(showStatus = true) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error("当前页面不可抓取");
  const response = await chrome.runtime.sendMessage({ type: "sa.extractPage", tabId: tab.id });
  if (!response?.ok) throw new Error(response?.error || "正文抓取失败");
  extractedPage = { ...response.data, tabId: tab.id, tabUrl: tab.url };
  if (showStatus) {
    const result = $("clip-result");
    const count = String(extractedPage.body || "").length;
    const imageCount = Array.isArray(extractedPage.image_urls) ? extractedPage.image_urls.length : 0;
    const siteLabel = extractedPage.site_label || "网页";
    result.textContent = (count || imageCount)
      ? `已识别${siteLabel}正文 ${count} 字、图片 ${imageCount} 张`
      : "未识别到正文或图片";
    result.className = (count || imageCount) ? "ok" : "error";
    result.hidden = false;
  }
  return { tab, data: extractedPage };
}

async function savePage(tab, page) {
  const response = await chrome.runtime.sendMessage({
    type: "sa.api.clipSave",
    clip: {
      kind: "url",
      title: page.title || tab.title || "",
      body: page.body || "",
      source_url: page.source_url || tab.url,
      image_urls: page.image_urls || [],
      extractor: page.extractor || "generic",
    },
  });
  if (!response?.ok) throw new Error(response?.error || "保存失败");
  savedClip = {
    id: response.data?.id,
    tabId: tab.id,
    tabUrl: tab.url,
    capturedImages: Number(response.data?.captured_images || 0),
    imageFailures: Number(response.data?.image_failures || 0),
  };
  await store({ lastSavedClip: savedClip });
  return response.data;
}

$("logout-btn").addEventListener("click", async () => {
  await Promise.all([
    chrome.storage.session.remove("token"),
    chrome.storage.local.remove("accountLabel"),
  ]);
  updateAccountUI();
  closeConfig();
  show("login");
});

$("extract-page-btn").addEventListener("click", async () => {
  const button = $("extract-page-btn");
  const result = $("clip-result");
  button.disabled = true;
  result.hidden = true;
  try {
    const { tab, data } = await extractActivePage(false);
    const count = String(data.body || "").length;
    const imageCount = Array.isArray(data.image_urls) ? data.image_urls.length : 0;
    if (!count && !imageCount) throw new Error("未识别到正文或图片,可用「收藏本页」仅保存链接");
    const saved = await savePage(tab, data);
    const storedImages = Number(saved?.captured_images || 0);
    const failedImages = Number(saved?.image_failures || 0);
    const siteLabel = data.site_label || "网页";
    result.textContent = `已写入${siteLabel}正文 ${count} 字、图片 ${storedImages} 张${failedImages ? `(${failedImages} 张下载失败)` : ""},点「打开书房」查看`;
    result.className = "ok";
    result.hidden = false;
  } catch (e) {
    result.textContent = `抓取失败:${e?.message || e}`;
    result.className = "error";
    result.hidden = false;
  } finally {
    button.disabled = false;
  }
});

$("clip-page-btn").addEventListener("click", async () => {
  const button = $("clip-page-btn");
  const result = $("clip-result");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  button.disabled = true;
  result.hidden = true;
  try {
    if (savedClip?.tabId === tab.id && savedClip?.tabUrl === tab.url) {
      result.textContent = "本页已经收藏,点「打开书房」查看";
      result.className = "ok";
      result.hidden = false;
      return;
    }
    // 自动先抓正文；失败时仍允许仅保存标题+链接。
    let extracted = extractedPage?.tabId === tab.id && extractedPage?.tabUrl === tab.url ? extractedPage : {};
    try {
      if (!extracted.body) extracted = (await extractActivePage(false)).data;
    } catch { /* chrome:// 等受限页面退回仅收藏链接 */ }
    const saved = await savePage(tab, extracted);
    const storedImages = Number(saved?.captured_images || 0);
    result.textContent = (extracted.body || storedImages)
      ? `已写入 Joyhouse 书房${storedImages ? `,含 ${storedImages} 张图片` : ""}`
      : "已收藏链接到 Joyhouse 书房";
    result.className = "ok";
    result.hidden = false;
  } catch (e) {
    result.textContent = `收藏失败:${e?.message || e}`;
    result.className = "error";
    result.hidden = false;
  } finally {
    button.disabled = false;
  }
});

$("open-library-btn").addEventListener("click", async () => {
  const path = savedClip?.id ? `/clips/${savedClip.id}` : "/clips";
  await chrome.tabs.create({ url: `${WEB_APP}${path}` });
});

init();
