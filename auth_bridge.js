// JoyhouseBot 登录桥:注入 web-home 页面，立即检查并持续监听主站登录态，
// 将 localStorage 中的 Joyhouse 会话桥回扩展 background。

(() => {
  const TIMEOUT = 5 * 60 * 1000;
  const t0 = Date.now();

  // 重新注入时重置旧轮询，确保已打开的 Joyhouse 标签页也能马上同步。
  if (window.__joyhouseBotAuthTimer) clearInterval(window.__joyhouseBotAuthTimer);

  const sync = () => {
    const token = localStorage.getItem("jh_token");
    if (!token) return false;
    chrome.runtime.sendMessage({
      type: "sa.wechatToken",
      token,
      accountLabel: localStorage.getItem("jh_name") || "Joyhouse 登录",
    });
    return true;
  };

  if (sync()) return;
  window.__joyhouseBotAuthTimer = setInterval(() => {
    if (sync() || Date.now() - t0 > TIMEOUT) {
      clearInterval(window.__joyhouseBotAuthTimer);
      window.__joyhouseBotAuthTimer = null;
    }
  }, 1000);
})();
