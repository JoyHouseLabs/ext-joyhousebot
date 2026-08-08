// JoyhouseBot content script:划词翻译卡片(Shadow DOM)+ 整页双语对照。
// API 一律经 background service worker 转发(chrome.runtime.sendMessage)。

(() => {
  const SCRIPT_VERSION = "0.4.1";
  if (window.__saLoaded === SCRIPT_VERSION) return;  // 同版本防重复注入
  window.__saLoaded = SCRIPT_VERSION;                // 旧版本允许被新脚本替换

  const CARD_ID = "sa-card-host";
  const BTN_ID = "sa-float-btn";
  const MAX_SEL = 500;

  // 扩展重新加载后，旧 isolated world 的事件会失效，但它插入的 DOM 可能还留在页面里。
  // 新脚本启动时先清掉这些“看得见但点不动”的残留节点。
  document.getElementById(CARD_ID)?.remove();
  document.getElementById(BTN_ID)?.remove();

  // ---------- 消息助手 ----------

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error("插件已刷新,请刷新本页"));
        } else if (!resp?.ok) {
          reject(new Error(resp?.error || "请求失败"));
        } else {
          resolve(resp.data);
        }
      });
    });
  }

  // ---------- 划词悬浮按钮 ----------

  function removeFloatBtn() {
    document.getElementById(BTN_ID)?.remove();
  }

  function selectionInfo() {
    const sel = window.getSelection();
    const text = (sel?.toString() || "").trim();
    if (!sel || sel.isCollapsed || !text || text.length > MAX_SEL) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { text, rect };
  }

  document.addEventListener("mouseup", (e) => {
    if (e.target?.closest?.(`#${CARD_ID}`) || e.target?.closest?.(`#${BTN_ID}`)) return;
    setTimeout(async () => {
      // 未同意数据处理说明时，不读取所选文字，也不展示翻译入口。
      try {
        if (!(await send("sa.consent.status"))) {
          removeFloatBtn();
          return;
        }
      } catch {
        removeFloatBtn();
        return;
      }
      const info = selectionInfo();
      removeFloatBtn();
      if (!info) return;
      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = "译";
      btn.style.top = `${window.scrollY + info.rect.bottom + 6}px`;
      btn.style.left = `${window.scrollX + info.rect.left}px`;
      let activated = false;
      const activate = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (activated) return;
        activated = true;
        removeFloatBtn();
        void showCard(info.text, info.rect);
      };
      // X 会在 document 层处理 click；pointerdown 阶段立即打开，避免事件被页面截断。
      btn.addEventListener("pointerdown", activate);
      btn.addEventListener("click", activate);  // 键盘触发时的兜底
      document.body.appendChild(btn);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    // 点悬浮「译」按钮时不能提前把它删掉，否则 click 事件不会触发、翻译卡片也不会出现。
    if (!e.target?.closest?.(`#${CARD_ID}`) && !e.target?.closest?.(`#${BTN_ID}`)) removeFloatBtn();
  });

  // ---------- 翻译卡片(Shadow DOM 隔离样式) ----------

  const CARD_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font: 14px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .card {
      width: 340px; max-height: 420px; overflow: auto;
      background: #fff; border-radius: 12px; padding: 12px 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,.18); border: 1px solid #ececf1;
      color: #1f2329;
    }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .brand { font-size: 12px; font-weight: 600; color: #6d5ef0; }
    .close { border: none; background: none; cursor: pointer; color: #8a8f99; font-size: 16px; padding: 0 2px; }
    .src { color: #8a8f99; font-size: 12px; max-height: 80px; overflow: auto; margin-bottom: 8px;
           border-left: 3px solid #ececf1; padding-left: 8px; white-space: pre-wrap; }
    .dst { white-space: pre-wrap; min-height: 24px; }
    .dst.loading { color: #8a8f99; }
    .dst.error { color: #d4380d; }
    .phonetic { color: #6d5ef0; font-size: 13px; margin: 2px 0 4px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .actions button {
      border: 1px solid #e5e7eb; background: #f7f7fa; border-radius: 8px;
      padding: 4px 10px; cursor: pointer; font-size: 13px; color: #1f2329;
    }
    .actions button:hover { border-color: #6d5ef0; color: #6d5ef0; }
    .actions button.done { color: #389e0d; border-color: #389e0d; }
    .actions button:disabled { opacity: .6; cursor: default; }
  `;

  function closeCard() {
    audio?.pause();
    resetTtsButton(activeTtsButton);
    document.getElementById(CARD_ID)?.remove();
    document.removeEventListener("keydown", onEsc);
  }

  function onEsc(e) { if (e.key === "Escape") closeCard(); }

  let audio;   // 复用同一个 Audio,避免叠播
  let activeTtsButton;

  function resetTtsButton(button) {
    if (!button) return;
    button.textContent = button.dataset.idleLabel || "朗读";
    button.title = button.dataset.idleTitle || "朗读";
    button.disabled = false;
    if (activeTtsButton === button) activeTtsButton = null;
  }

  async function playTts(button, spokenText) {
    if (!spokenText) return;
    if (activeTtsButton === button && audio && !audio.paused) {
      audio.pause();
      resetTtsButton(button);
      return;
    }

    audio?.pause();
    resetTtsButton(activeTtsButton);
    button.disabled = true;
    button.textContent = "生成中…";
    try {
      const { audio_url } = await send("sa.api.tts", { text: spokenText.slice(0, 1000) });
      if (!button.isConnected) return;
      audio = new Audio(audio_url);
      activeTtsButton = button;
      audio.addEventListener("ended", () => resetTtsButton(button), { once: true });
      await audio.play();
      button.textContent = "■ 停止";
    } catch (e) {
      activeTtsButton = null;
      button.textContent = "朗读失败";
      button.title = `${e.message || e}（请检查后台「系统配置→语音合成」）`;
      setTimeout(() => resetTtsButton(button), 1600);
    } finally {
      button.disabled = false;
    }
  }

  async function showCard(text, rect) {
    closeCard();
    const host = document.createElement("div");
    host.id = CARD_ID;
    const viewportWidth = document.documentElement.clientWidth;
    const below = rect ? rect.bottom + 8 : 80;
    const top = below > window.innerHeight - 180 && rect ? Math.max(8, rect.top - 180) : below;
    const left = Math.min(rect ? rect.left : 40, viewportWidth - 360);
    host.style.cssText = `position:fixed;z-index:2147483647;top:${Math.max(8, top)}px;left:${Math.max(8, left)}px;`;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CARD_CSS}</style>
      <div class="card">
        <div class="head">
          <span class="brand">JoyhouseBot</span>
          <button class="close" title="关闭">×</button>
        </div>
        <div class="src"></div>
        <div class="dst loading">翻译中…</div>
        <div class="actions">
          <button class="tts-source" data-idle-label="🔊 朗读原文" data-idle-title="朗读原文" title="朗读原文">🔊 朗读原文</button>
          <button class="tts-translation" data-idle-label="🔊 朗读翻译" data-idle-title="朗读翻译" title="朗读翻译" disabled>🔊 朗读翻译</button>
          <button class="save" title="存入生词本">★ 存生词</button>
          <button class="clip" title="存进资料库">存资料库</button>
          <button class="copy" title="复制译文">复制</button>
        </div>
      </div>`;
    root.querySelector(".src").textContent = text.length > 300 ? `${text.slice(0, 300)}…` : text;
    root.querySelector(".close").addEventListener("click", closeCard);
    document.body.appendChild(host);
    document.addEventListener("keydown", onEsc);

    const dst = root.querySelector(".dst");
    const ttsSourceBtn = root.querySelector(".tts-source");
    const ttsTranslationBtn = root.querySelector(".tts-translation");
    const saveBtn = root.querySelector(".save");
    const clipBtn = root.querySelector(".clip");
    const copyBtn = root.querySelector(".copy");
    let phonetic = "";   // 单词翻译时后端顺带返回的音标,显示 + 存生词本

    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(dst.textContent || "");
      copyBtn.textContent = "已复制";
      setTimeout(() => { copyBtn.textContent = "复制"; }, 1200);
    });

    ttsSourceBtn.addEventListener("click", () => playTts(ttsSourceBtn, text));
    ttsTranslationBtn.addEventListener("click", () => playTts(ttsTranslationBtn, dst.textContent || ""));

    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        await send("sa.api.saveWord", {
          word: {
            word: text.slice(0, 128),
            translation: dst.textContent || "",
            phonetic,
            context: text.slice(0, 500),
            url: location.href,
          },
        });
        saveBtn.classList.add("done");
        saveBtn.textContent = "✓ 已存";
      } catch (e) {
        saveBtn.textContent = e.message.includes("登录") ? "先登录" : "保存失败";
      } finally {
        saveBtn.disabled = false;
      }
    });

    clipBtn.addEventListener("click", async () => {
      clipBtn.disabled = true;
      try {
        await send("sa.api.clipSave", {
          clip: {
            kind: "note",
            title: document.title || "",
            body: text.slice(0, 5000),
            source_url: location.href,
          },
        });
        clipBtn.classList.add("done");
        clipBtn.textContent = "✓ 已存";   // 保持 disabled 置灰,防重复收藏
      } catch (e) {
        clipBtn.textContent = e.message.includes("登录") ? "先登录" : "保存失败";
        clipBtn.disabled = false;
      }
    });

    try {
      const r = await send("sa.api.translate", { text, url: location.href });
      dst.classList.remove("loading");
      dst.textContent = r.translation;
      ttsTranslationBtn.disabled = !r.translation;
      if (r.phonetic) {
        phonetic = r.phonetic;
        const ph = document.createElement("div");
        ph.className = "phonetic";
        ph.textContent = r.phonetic;
        dst.before(ph);
      }
    } catch (e) {
      dst.classList.remove("loading");
      dst.classList.add("error");
      dst.textContent = e.message;
    }
  }

  // ---------- 整页双语对照 ----------

  const BLOCK_SEL = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,dd,figcaption";
  const SKIP_SEL = "script,style,code,pre,textarea,noscript,[contenteditable],.sa-translation";
  const MAX_BLOCKS = 60;          // 单次整页翻译上限(控成本)
  const CONCURRENCY = 3;

  const CJK = /[一-鿿]/;

  function collectBlocks() {
    const out = [];
    for (const el of document.querySelectorAll(BLOCK_SEL)) {
      if (el.dataset.saDone || el.closest(SKIP_SEL)) continue;
      const text = (el.innerText || "").trim();
      if (text.length < 20 || text.length > 2000) continue;   // 跳过导航碎块/超长块
      if ((el.offsetWidth || el.offsetHeight) === 0) continue; // 不可见
      out.push(el);
      if (out.length >= MAX_BLOCKS) break;
    }
    return out;
  }

  function pageTranslated() {
    return document.querySelectorAll(".sa-translation").length > 0;
  }

  function clearPageTranslation() {
    document.querySelectorAll(".sa-translation").forEach((n) => n.remove());
    document.querySelectorAll("[data-sa-done]").forEach((n) => delete n.dataset.saDone);
  }

  async function translatePage() {
    const blocks = collectBlocks();
    if (!blocks.length) return;
    toast(`JoyhouseBot:翻译 ${blocks.length} 个段落…`);
    let done = 0, failed = 0;
    const queue = [...blocks];
    async function worker() {
      while (queue.length) {
        const el = queue.shift();
        const text = (el.innerText || "").trim();
        try {
          const r = await send("sa.api.translate", { text, url: location.href });
          const div = document.createElement("div");
          div.className = "sa-translation";
          div.textContent = r.translation;
          el.after(div);
          el.dataset.saDone = "1";
          done += 1;
        } catch {
          failed += 1;
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    toast(failed
      ? `JoyhouseBot:完成 ${done} 段,${failed} 段失败(未登录或后端未启动?)`
      : `JoyhouseBot:完成 ${done} 段双语翻译`);
    setTimeout(removeToast, 4000);
  }

  let toastEl;
  function toast(msg) {
    removeToast();
    toastEl = document.createElement("div");
    toastEl.className = "sa-toast";
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
  }
  function removeToast() { toastEl?.remove(); toastEl = null; }

  async function togglePage() {
    if (pageTranslated()) {
      clearPageTranslation();
      toast("JoyhouseBot:已关闭双语翻译");
      setTimeout(removeToast, 2000);
    } else {
      await translatePage();
    }
  }

  // ---------- 消息入口 ----------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "sa.extractPage") {
      try {
        const data = globalThis.JoyhousePageExtractors?.extract();
        if (!data) throw new Error("页面采集器尚未加载");
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    } else if (msg?.type === "sa.showCard" && msg.text) {
      showCard(String(msg.text).slice(0, MAX_SEL), null);
      sendResponse({ ok: true });
    } else if (msg?.type === "sa.togglePage") {
      togglePage().then(() => sendResponse({ ok: true }));
      return true;
    } else if (msg?.type === "sa.toast" && msg.text) {
      toast(String(msg.text));
      setTimeout(removeToast, 4000);
      sendResponse({ ok: true });
    }
    return false;
  });
})();
