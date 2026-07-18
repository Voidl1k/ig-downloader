// content.js — roda dentro das páginas do instagram.com

(function () {
  const MIN_SIZE = 150; // px — evita pegar avatares/ícones pequenos

  function getBestImageUrl(img) {
    if (img.srcset) {
      const candidates = img.srcset
        .split(",")
        .map((s) => s.trim().split(" "))
        .filter((c) => c[0]);
      if (candidates.length) {
        candidates.sort((a, b) => (parseInt(a[1]) || 0) - (parseInt(b[1]) || 0));
        return candidates[candidates.length - 1][0];
      }
    }
    return img.currentSrc || img.src;
  }

  function isInsideAvatar(el) {
    return !!el.closest(
      'header, nav, a[href*="/accounts/"] canvas, [role="button"] img[alt*="perfil" i], [role="button"] img[alt*="profile" i]'
    );
  }

  function findWrapper(mediaEl) {
    return (
      mediaEl.closest('article, div[role="dialog"], li, div[role="presentation"]') ||
      mediaEl.parentElement
    );
  }

  function makeButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ig-dl-btn";
    btn.title = "Baixar esta mídia";
    btn.textContent = "⬇";
    return btn;
  }

  function attach(mediaEl, type) {
    if (mediaEl.dataset.igDlDone) return;

    const w = type === "image" ? mediaEl.naturalWidth || mediaEl.width : mediaEl.videoWidth || mediaEl.clientWidth;
    if (w && w < MIN_SIZE) return;
    if (isInsideAvatar(mediaEl)) return;

    const wrapper = findWrapper(mediaEl);
    if (!wrapper) return;

    mediaEl.dataset.igDlDone = "1";

    const style = getComputedStyle(wrapper);
    if (style.position === "static") wrapper.style.position = "relative";

    const btn = makeButton();
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const url = type === "video" ? mediaEl.currentSrc || mediaEl.src : getBestImageUrl(mediaEl);
      if (!url) return;

      btn.textContent = "…";
      chrome.runtime.sendMessage({ action: "download", url, type }, (resp) => {
        btn.textContent = resp?.ok ? "✓" : "✕";
        setTimeout(() => (btn.textContent = "⬇"), 1500);
      });
    });

    wrapper.appendChild(btn);
  }

  function scan() {
    document.querySelectorAll("video").forEach((v) => attach(v, "video"));
    document.querySelectorAll('img[srcset], img[src]').forEach((img) => attach(img, "image"));
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__igDlScanTimer);
    window.__igDlScanTimer = setTimeout(scan, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  scan();
})();
