// background.js — service worker (Manifest V3)

const MENU_ID = "ig-downloader-baixar-midia";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Baixar mídia do Instagram",
    contexts: ["image", "video"],
    targetUrlPatterns: [
      "*://*.cdninstagram.com/*",
      "*://*.fbcdn.net/*",
      "*://*.instagram.com/*"
    ]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.srcUrl) {
    console.log("[IG Downloader BG] Context menu download:", info.srcUrl);
    downloadMedia(info.srcUrl, guessTypeFromUrl(info.srcUrl)).catch((err) =>
      console.error("[IG Downloader BG]", err)
    );
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "download" && msg.url) {
    console.log("[IG Downloader BG] Download message:", msg.url, msg.type);
    downloadMedia(msg.url, msg.type)
      .then((downloadId) => {
        console.log("[IG Downloader BG] Download iniciado, ID:", downloadId);
        sendResponse({ ok: true });
      })
      .catch((err) => {
        console.error("[IG Downloader BG] Download falhou:", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // resposta assíncrona
  }

  if (msg?.action === "downloadBatch" && Array.isArray(msg.items) && msg.items.length) {
    console.log("[IG Downloader BG] Batch download:", msg.items.length, "itens");
    downloadBatch(msg.items)
      .then(() => {
        console.log("[IG Downloader BG] Batch download concluído");
        sendResponse({ ok: true });
      })
      .catch((err) => {
        console.error("[IG Downloader BG] Batch download falhou:", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }
});

function guessTypeFromUrl(url) {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|webm)$/.test(clean)) return "video";
  return "image";
}

function guessExtension(url, type) {
  const clean = url.split("?")[0].toLowerCase();
  const match = clean.match(/\.(jpg|jpeg|png|webp|mp4|mov|webm)$/);
  if (match) return match[1];
  return type === "video" ? "mp4" : "jpg";
}

function isValidUrl(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

function isBlobUrl(url) {
  return typeof url === "string" && url.startsWith("blob:");
}

function downloadMedia(url, type) {
  if (!isValidUrl(url)) {
    const err = "URL de mídia inválida ou vazia: " + url;
    console.error("[IG Downloader BG]", err);
    return Promise.reject(err);
  }

  const ext = guessExtension(url, type);
  const label = type === "video" ? "reel_ou_story" : "foto";
  const filename = `IG-Downloader/${label}_${Date.now()}.${ext}`;

  console.log("[IG Downloader BG] Iniciando download:", url, "=>", filename);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        const err = chrome.runtime.lastError?.message || "Falha ao iniciar o download";
        console.error("[IG Downloader BG]", err);
        reject(err);
      } else {
        console.log("[IG Downloader BG] Download iniciado com ID:", downloadId);
        resolve(downloadId);
      }
    });
  });
}

async function downloadBatch(items) {
  const stamp = Date.now();
  console.log("[IG Downloader BG] Iniciando batch de", items.length, "downloads");
  for (let i = 0; i < items.length; i++) {
    const { url, type } = items[i];
    if (!isValidUrl(url)) {
      console.warn("[IG Downloader BG] Item inválido #" + (i + 1) + ":", url);
      continue;
    }
    const ext = guessExtension(url, type);
    const filename = `IG-Downloader/lote_${stamp}_${String(i + 1).padStart(2, "0")}.${ext}`;
    console.log("[IG Downloader BG] Batch item #" + (i + 1) + ":", url, "=>", filename);
    await new Promise((resolve, reject) => {
      chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          console.error("[IG Downloader BG] Batch item #" + (i + 1) + " falhou:", chrome.runtime.lastError?.message);
          reject(chrome.runtime.lastError?.message || "Falha ao iniciar o download");
        } else {
          console.log("[IG Downloader BG] Batch item #" + (i + 1) + " OK, download ID:", downloadId);
          resolve(downloadId);
        }
      });
    });
  }
  console.log("[IG Downloader BG] Batch concluído");
}
