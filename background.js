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
    downloadMedia(info.srcUrl, guessTypeFromUrl(info.srcUrl)).catch((err) =>
      console.error("[IG Downloader]", err)
    );
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "download" && msg.url) {
    downloadMedia(msg.url, msg.type)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // resposta assíncrona
  }

  if (msg?.action === "downloadBatch" && Array.isArray(msg.items) && msg.items.length) {
    downloadBatch(msg.items)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
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

function downloadMedia(url, type) {
  if (!isValidUrl(url)) {
    return Promise.reject("URL de mídia inválida ou vazia: " + url);
  }

  const ext = guessExtension(url, type);
  const label = type === "video" ? "reel_ou_story" : "foto";
  const filename = `IG-Downloader/${label}_${Date.now()}.${ext}`;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        reject(chrome.runtime.lastError?.message || "Falha ao iniciar o download");
      } else {
        resolve(downloadId);
      }
    });
  });
}

async function downloadBatch(items) {
  const stamp = Date.now();
  for (let i = 0; i < items.length; i++) {
    const { url, type } = items[i];
    if (!isValidUrl(url)) {
      console.warn("[IG Downloader] item inválido no lote, pulando:", url);
      continue;
    }
    const ext = guessExtension(url, type);
    const filename = `IG-Downloader/lote_${stamp}_${String(i + 1).padStart(2, "0")}.${ext}`;
    await new Promise((resolve, reject) => {
      chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          reject(chrome.runtime.lastError?.message || "Falha ao iniciar o download");
        } else {
          resolve(downloadId);
        }
      });
    });
  }
}
