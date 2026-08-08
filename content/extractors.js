// JoyhouseBot 页面采集适配器。
// 每个站点适配器只负责识别页面并输出统一结构；background 负责图片入库和资料保存。

(() => {
  const VERSION = "0.3.0";
  if (globalThis.JoyhousePageExtractors?.version === VERSION) return;

  const MAX_BODY_LENGTH = 200000;
  const DROP_SELECTORS = [
    "script", "style", "noscript", "nav", "footer", "aside", "form",
    "button", "input", "textarea", "select", "svg", "canvas", "iframe",
    ".sa-translation", "#sa-card-host", "#sa-float-btn",
  ];

  function normalizeUrl(raw) {
    const value = String(raw || "").trim();
    if (!value || /^(data|blob|javascript):/i.test(value)) return "";
    try {
      const url = new URL(value.startsWith("//") ? `https:${value}` : value, location.href);
      if (!/^https?:$/.test(url.protocol)) return "";
      if (url.hostname.endsWith("mmbiz.qpic.cn") && url.protocol === "http:") url.protocol = "https:";
      return url.href;
    } catch {
      return "";
    }
  }

  function imageSource(img) {
    return normalizeUrl(
      img.getAttribute("data-src")
      || img.getAttribute("data-original")
      || img.getAttribute("data-backsrc")
      || img.getAttribute("data-lazy-src")
      || img.currentSrc
      || img.getAttribute("src")
    );
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r\n ]+/g, " ");
  }

  function normalizeMarkdown(value) {
    return String(value || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_BODY_LENGTH);
  }

  function cloneForCapture(root, extraDrop = []) {
    const copy = root.cloneNode(true);
    copy.querySelectorAll([...DROP_SELECTORS, ...extraDrop].join(",")).forEach((node) => node.remove());
    return copy;
  }

  function domToMarkdown(root) {
    const imageUrls = [];

    const children = (node, context = {}) =>
      [...node.childNodes].map((child) => serialize(child, context)).join("");

    const serializeList = (node, ordered, context) => {
      const depth = Number(context.listDepth || 0);
      const items = [...node.children].filter((child) => child.tagName === "LI");
      const lines = items.map((item, index) => {
        const nested = [...item.children].filter((child) => child.tagName === "UL" || child.tagName === "OL");
        const direct = [...item.childNodes]
          .filter((child) => !(child.nodeType === Node.ELEMENT_NODE && ["UL", "OL"].includes(child.tagName)))
          .map((child) => serialize(child, { ...context, listDepth: depth + 1 }))
          .join("")
          .trim();
        const prefix = ordered ? `${index + 1}. ` : "- ";
        const indent = "  ".repeat(depth);
        const nestedText = nested.map((child) => serializeList(child, child.tagName === "OL", { listDepth: depth + 1 })).join("");
        return `${indent}${prefix}${direct}${nestedText ? `\n${nestedText.trimEnd()}` : ""}`;
      });
      return `\n\n${lines.join("\n")}\n\n`;
    };

    const serializeTable = (node) => {
      const rows = [...node.querySelectorAll("tr")].map((row) =>
        [...row.querySelectorAll(":scope > th, :scope > td")].map((cell) => cleanText(cell.textContent).trim())
      ).filter((cells) => cells.length);
      if (!rows.length) return "";
      const width = Math.max(...rows.map((row) => row.length));
      const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
      const header = normalized[0];
      return `\n\n| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n${normalized.slice(1).map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`;
    };

    function serialize(node, context = {}) {
      if (node.nodeType === Node.TEXT_NODE) return cleanText(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName.toLowerCase();

      if (["script", "style", "noscript", "iframe", "svg", "canvas", "form", "button"].includes(tag)) return "";
      if (tag === "br") return "\n";
      if (tag === "hr") return "\n\n---\n\n";
      if (tag === "img") {
        const src = imageSource(node);
        if (!src) return "";
        imageUrls.push(src);
        const alt = cleanText(node.getAttribute("alt") || "文章图片").replace(/[\[\]]/g, "").trim() || "文章图片";
        return `\n\n![${alt}](${src})\n\n`;
      }
      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        return `\n\n${"#".repeat(level)} ${children(node, context).trim()}\n\n`;
      }
      if (tag === "strong" || tag === "b") {
        const value = children(node, context).trim();
        return value ? `**${value}**` : "";
      }
      if (tag === "em" || tag === "i") {
        const value = children(node, context).trim();
        return value ? `*${value}*` : "";
      }
      if (tag === "del" || tag === "s") {
        const value = children(node, context).trim();
        return value ? `~~${value}~~` : "";
      }
      if (tag === "code" && node.parentElement?.tagName !== "PRE") {
        return `\`${cleanText(node.textContent).trim()}\``;
      }
      if (tag === "pre") {
        return `\n\n\`\`\`\n${String(node.textContent || "").trim()}\n\`\`\`\n\n`;
      }
      if (tag === "a") {
        const label = children(node, context).trim();
        const href = normalizeUrl(node.getAttribute("href"));
        return href && label ? `[${label}](${href})` : label;
      }
      if (tag === "ul" || tag === "ol") return serializeList(node, tag === "ol", context);
      if (tag === "li") return children(node, context);
      if (tag === "blockquote") {
        const value = normalizeMarkdown(children(node, context));
        return value ? `\n\n${value.split("\n").map((line) => `> ${line}`).join("\n")}\n\n` : "";
      }
      if (tag === "table") return serializeTable(node);
      if (tag === "figcaption") {
        const value = children(node, context).trim();
        return value ? `\n\n*${value}*\n\n` : "";
      }

      const value = children(node, context);
      if (["p", "div", "section", "article", "figure", "header", "main", "details", "summary", "dl", "dt", "dd"].includes(tag)) {
        return value.trim() ? `\n\n${value.trim()}\n\n` : "";
      }
      return value;
    }

    return {
      markdown: normalizeMarkdown(serialize(root)),
      imageUrls: [...new Set(imageUrls)],
    };
  }

  function pageTitle() {
    return String(
      document.querySelector("meta[property='og:title']")?.content
      || document.querySelector("meta[name='twitter:title']")?.content
      || document.title
      || location.hostname
    ).trim().slice(0, 200);
  }

  function simpleText(root) {
    return normalizeMarkdown(String(root?.textContent || "").replace(/[\t ]+/g, " "));
  }

  const wechatAdapter = {
    id: "wechat_mp",
    label: "公众号",
    matches: () => location.hostname === "mp.weixin.qq.com" && Boolean(document.querySelector("#js_content")),
    extract: () => {
      const root = document.querySelector("#js_content");
      const copy = cloneForCapture(root, [
        ".js_ad_link", ".reward_area", ".rich_media_tool", ".qr_code_pc_outer",
        ".wx_profile_card", "[data-role='activity_link']",
      ]);
      const { markdown, imageUrls } = domToMarkdown(copy);
      const title = cleanText(document.querySelector("#activity-name")?.textContent).trim() || pageTitle();
      const author = cleanText(document.querySelector("#js_name")?.textContent).trim();
      const publishTime = cleanText(document.querySelector("#publish_time")?.textContent).trim();
      const meta = [author && `公众号:${author}`, publishTime].filter(Boolean).join(" · ");
      const body = normalizeMarkdown([meta ? `> ${meta}` : "", markdown || simpleText(copy)].filter(Boolean).join("\n\n"));
      return {
        extractor: "wechat_mp",
        site_label: "公众号",
        title,
        body,
        source_url: location.href,
        image_urls: imageUrls.slice(0, 50),
      };
    },
  };

  const xAdapter = {
    id: "x_status",
    label: "X",
    matches: () => ["x.com", "twitter.com"].includes(location.hostname) && /\/status\/\d+/.test(location.pathname),
    extract: () => {
      const statusId = location.pathname.match(/\/status\/(\d+)/)?.[1] || "";
      const article = [...document.querySelectorAll("article")]
        .find((node) => node.querySelector(`a[href*="/status/${statusId}"]`));
      const root = article?.querySelector('[data-testid="tweetText"]') || article;
      if (!root) throw new Error("未找到当前推文");
      const { markdown } = domToMarkdown(cloneForCapture(root));
      const imageUrls = [...(article?.querySelectorAll('[data-testid="tweetPhoto"] img') || [])]
        .map((img) => imageSource(img))
        .filter(Boolean)
        .map((src) => {
          try {
            const url = new URL(src);
            if (url.hostname === "pbs.twimg.com" && url.pathname.startsWith("/media/")) url.searchParams.set("name", "orig");
            return url.href;
          } catch { return src; }
        });
      return {
        extractor: "x_status",
        site_label: "X",
        title: pageTitle(),
        body: markdown || simpleText(root),
        source_url: location.href,
        image_urls: [...new Set(imageUrls)].slice(0, 9),
      };
    },
  };

  const genericAdapter = {
    id: "generic",
    label: "网页",
    matches: () => true,
    extract: () => {
      const candidates = [...document.querySelectorAll(
        "article,[itemprop='articleBody'],.article-content,.post-content,.entry-content,main,[role='main']"
      )];
      const root = candidates.sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0))[0] || document.body;
      const copy = cloneForCapture(root);
      const { markdown, imageUrls } = domToMarkdown(copy);
      const description = document.querySelector("meta[property='og:description']")?.content
        || document.querySelector("meta[name='description']")?.content
        || "";
      const body = markdown.length >= 40 ? markdown : normalizeMarkdown(simpleText(copy) || description);
      return {
        extractor: "generic",
        site_label: "网页",
        title: pageTitle(),
        body,
        source_url: location.href,
        image_urls: imageUrls.slice(0, 20),
      };
    },
  };

  const adapters = [wechatAdapter, xAdapter, genericAdapter];
  globalThis.JoyhousePageExtractors = {
    version: VERSION,
    register(adapter) {
      if (adapter?.id && typeof adapter.matches === "function" && typeof adapter.extract === "function") {
        adapters.unshift(adapter);
      }
    },
    extract() {
      const adapter = adapters.find((item) => item.matches());
      if (!adapter) throw new Error("没有可用的页面采集器");
      return adapter.extract();
    },
  };
})();
