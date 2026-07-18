// content.js — roda dentro das páginas do instagram.com

(function () {
  const MIN_RENDER_SIZE = 120; // px renderizados na tela — abaixo disso, é avatar/ícone
  const NEXT_RE = /^(avançar|próximo|next)/i;
  const PREV_RE = /^(voltar|anterior|go back|previous)/i;

  const DOWNLOAD_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 3v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 19h16"></path></svg>';

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

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

  function isVisible(el) {
    if (!el) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function isAvatarLike(img) {
    if (img.closest("header, nav")) return true;

    const rect = img.getBoundingClientRect();
    const renderedSize = Math.max(rect.width, rect.height);
    if (renderedSize > 0 && renderedSize < MIN_RENDER_SIZE) return true;

    const link = img.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href") || "";
      if (/^\/[^/]+\/?$/.test(href) && !/^\/(p|reel|reels|stories|explore|tv)\//.test(href)) {
        return true;
      }
    }

    const alt = (img.getAttribute("alt") || "").toLowerCase();
    if (/foto do perfil|profile photo|profile picture/.test(alt)) return true;

    return false;
  }

  function findWrapper(mediaEl) {
    return (
      mediaEl.closest('article, div[role="dialog"], li, div[role="presentation"]') ||
      mediaEl.parentElement
    );
  }

  function findPostContainer(el) {
    return (
      el.closest('div[role="dialog"]') ||
      el.closest("article") ||
      el.closest("li") ||
      el.closest("section") ||
      document.body
    );
  }

  function findNavButton(container, re) {
    const svg = Array.from(container.querySelectorAll("svg[aria-label]")).find((s) =>
      re.test(s.getAttribute("aria-label") || "")
    );
    if (!svg) return null;
    return svg.closest('button, div[role="button"]') || svg.parentElement;
  }

  function downloadSingle(btn, url, type) {
    if (!url) return;
    btn.classList.add("ig-dl-loading");
    chrome.runtime.sendMessage({ action: "download", url, type }, (resp) => {
      btn.classList.remove("ig-dl-loading");
      btn.classList.add(resp?.ok ? "ig-dl-ok" : "ig-dl-err");
      setTimeout(() => btn.classList.remove("ig-dl-ok", "ig-dl-err"), 1200);
    });
  }

  // ---------- menu "baixar esta / baixar todas" para carrossel ----------

  function showCarouselMenu(anchorBtn, onChoice) {
    document.querySelectorAll(".ig-dl-menu").forEach((m) => m.remove());

    const menu = document.createElement("div");
    menu.className = "ig-dl-menu";

    const optCurrent = document.createElement("button");
    optCurrent.type = "button";
    optCurrent.className = "ig-dl-menu-item";
    optCurrent.textContent = "Baixar só esta foto";

    const optAll = document.createElement("button");
    optAll.type = "button";
    optAll.className = "ig-dl-menu-item";
    optAll.textContent = "Baixar todas do carrossel";

    const close = () => {
      menu.remove();
      document.removeEventListener("click", outsideClick, true);
    };

    optCurrent.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      onChoice("current");
    });
    optAll.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      onChoice("all");
    });

    function outsideClick(e) {
      if (!menu.contains(e.target) && e.target !== anchorBtn) close();
    }

    menu.appendChild(optCurrent);
    menu.appendChild(optAll);
    document.body.appendChild(menu);

    const rect = anchorBtn.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
    menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 210)}px`;

    setTimeout(() => document.addEventListener("click", outsideClick, true), 0);
  }

  async function collectCarousel(container) {
    let backSteps = 0;
    let guard = 0;
    while (guard++ < 20) {
      const prev = findNavButton(container, PREV_RE);
      if (!prev) break;
      prev.click();
      backSteps++;
      await sleep(300);
    }

    const collected = [];
    const seenUrls = new Set();
    guard = 0;
    while (guard++ < 20) {
      const media = getMediaForContainer(container);
      if (media) {
        const url = media.type === "video" ? media.el.currentSrc || media.el.src : getBestImageUrl(media.el);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          collected.push({ url, type: media.type });
        }
      }
      const next = findNavButton(container, NEXT_RE);
      if (!next) break;
      next.click();
      await sleep(350);
    }

    for (let i = 0; i < backSteps; i++) {
      const next = findNavButton(container, NEXT_RE);
      if (!next) break;
      next.click();
      await sleep(150);
    }

    return collected;
  }

  // ---------- botão flutuante sobre a mídia (feed / reels sem ícone de salvar) ----------

  function makeOverlayButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ig-dl-btn";
    btn.title = "Baixar esta mídia";
    btn.textContent = "⬇";
    return btn;
  }

  function attachOverlay(mediaEl, type) {
    if (mediaEl.dataset.igDlDone) return;

    if (type === "image" && isAvatarLike(mediaEl)) return;
    if (type === "video") {
      const rect = mediaEl.getBoundingClientRect();
      if (Math.max(rect.width, rect.height) < MIN_RENDER_SIZE) return;
    }

    const wrapper = findWrapper(mediaEl);
    if (!wrapper) return;

    mediaEl.dataset.igDlDone = "1";

    const style = getComputedStyle(wrapper);
    if (style.position === "static") wrapper.style.position = "relative";

    const btn = makeOverlayButton();
    btn.addEventListener("click", (e) => {
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

  // ---------- botão ao lado do ícone de "Salvar" do Instagram (posts / reels) ----------

  function getMediaForContainer(container) {
    const videos = Array.from(container.querySelectorAll("video")).filter(isVisible);
    if (videos.length) {
      videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
      return { el: videos[0], type: "video" };
    }
    const imgs = Array.from(container.querySelectorAll('img[srcset], img[src]'))
      .filter((img) => !isAvatarLike(img))
      .filter(isVisible);
    if (imgs.length) {
      imgs.sort((a, b) => a.clientWidth * a.clientHeight - b.clientWidth * b.clientHeight);
      return { el: imgs[imgs.length - 1], type: "image" };
    }
    return null;
  }

  function findSaveIcons() {
    return Array.from(document.querySelectorAll("svg[aria-label]")).filter((svg) =>
      /^(salvar|save|remover dos salvos|remove from saved)/i.test(svg.getAttribute("aria-label") || "")
    );
  }

  function attachBesideSaveButtons() {
    findSaveIcons().forEach((svg) => {
      const clickable = svg.closest('button, div[role="button"], span[role="button"]') || svg.parentElement;
      if (!clickable || clickable.dataset.igDlSibling || !clickable.parentNode) return;

      const container = findPostContainer(svg);
      const media = getMediaForContainer(container);
      if (!media) return;

      clickable.dataset.igDlSibling = "1";
      media.el.dataset.igDlDone = "1";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ig-dl-inline-btn";
      btn.title = "Baixar esta mídia";
      btn.innerHTML = DOWNLOAD_SVG;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const hasCarousel = !!findNavButton(container, NEXT_RE) || !!findNavButton(container, PREV_RE);

        if (!hasCarousel) {
          const current = getMediaForContainer(container) || media;
          const url =
            current.type === "video" ? current.el.currentSrc || current.el.src : getBestImageUrl(current.el);
          downloadSingle(btn, url, current.type);
          return;
        }

        showCarouselMenu(btn, async (choice) => {
          if (choice === "current") {
            const current = getMediaForContainer(container) || media;
            const url =
              current.type === "video" ? current.el.currentSrc || current.el.src : getBestImageUrl(current.el);
            downloadSingle(btn, url, current.type);
            return;
          }

          btn.classList.add("ig-dl-loading");
          const items = await collectCarousel(container);
          btn.classList.remove("ig-dl-loading");

          if (!items.length) {
            btn.classList.add("ig-dl-err");
            setTimeout(() => btn.classList.remove("ig-dl-err"), 1200);
            return;
          }

          chrome.runtime.sendMessage({ action: "downloadBatch", items }, (resp) => {
            btn.classList.add(resp?.ok ? "ig-dl-ok" : "ig-dl-err");
            setTimeout(() => btn.classList.remove("ig-dl-ok", "ig-dl-err"), 1200);
          });
        });
      });

      clickable.insertAdjacentElement("afterend", btn);
    });
  }

  // ---------- botão fixo para Stories e Destaques (/stories/...) ----------

  let storyBtn = null;

  function isStoryOrHighlight() {
    return /\/stories\//.test(location.pathname);
  }

  function getCurrentStoryMedia() {
    const candidates = [];

    document.querySelectorAll("video").forEach((el) => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      candidates.push({ el, type: "video", area: rect.width * rect.height });
    });

    document.querySelectorAll('img[srcset], img[src]').forEach((el) => {
      if (isAvatarLike(el) || !isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      candidates.push({ el, type: "image", area: rect.width * rect.height });
    });

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0];
  }

  function ensureStoryButton() {
    if (!isStoryOrHighlight()) {
      if (storyBtn) {
        storyBtn.remove();
        storyBtn = null;
      }
      return;
    }

    if (storyBtn && document.body.contains(storyBtn)) return;

    storyBtn = document.createElement("button");
    storyBtn.type = "button";
    storyBtn.className = "ig-dl-story-btn";
    storyBtn.title = "Baixar este story";
    storyBtn.innerHTML = DOWNLOAD_SVG;

    storyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const media = getCurrentStoryMedia();
      if (!media) return;

      const url = media.type === "video" ? media.el.currentSrc || media.el.src : getBestImageUrl(media.el);
      downloadSingle(storyBtn, url, media.type);
    });

    document.body.appendChild(storyBtn);
  }

  // ---------- loop principal ----------

  function scan() {
    ensureStoryButton();
    if (isStoryOrHighlight()) return;

    attachBesideSaveButtons();
    document.querySelectorAll("video").forEach((v) => attachOverlay(v, "video"));
    document.querySelectorAll('img[srcset], img[src]').forEach((img) => attachOverlay(img, "image"));
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__igDlScanTimer);
    window.__igDlScanTimer = setTimeout(scan, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  scan();
})();
