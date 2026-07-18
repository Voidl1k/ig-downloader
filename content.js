// content.js — roda dentro das páginas do instagram.com

(function () {
  const MIN_RENDER_SIZE = 120; // px renderizados na tela — abaixo disso, é avatar/ícone

  const DOWNLOAD_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 3v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 19h16"></path></svg>';

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

  // detecta avatares/fotos de perfil (de quem postou, curtiu, comentou etc.)
  function isAvatarLike(img) {
    if (img.closest('header, nav')) return true;

    // renderizado pequeno na tela = quase certeza que é avatar/ícone,
    // mesmo que o arquivo original seja de alta resolução
    const rect = img.getBoundingClientRect();
    const renderedSize = Math.max(rect.width, rect.height);
    if (renderedSize > 0 && renderedSize < MIN_RENDER_SIZE) return true;

    // imagem dentro de um link para perfil (/usuario/) em vez de post (/p/, /reel/)
    const link = img.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href") || "";
      if (/^\/[^/]+\/?$/.test(href) && !/^\/(p|reel|reels|stories|explore|tv)\//.test(href)) {
        return true;
      }
    }

    // atributos comuns em avatares
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

  // ---------- botão flutuante sobre a mídia (fallback: stories etc.) ----------

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

  // ---------- botão ao lado do ícone de "Salvar" do Instagram ----------

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
      media.el.dataset.igDlDone = "1"; // evita duplicar com o botão flutuante

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ig-dl-inline-btn";
      btn.title = "Baixar esta mídia";
      btn.innerHTML = DOWNLOAD_SVG;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const url = media.type === "video" ? media.el.currentSrc || media.el.src : getBestImageUrl(media.el);
        if (!url) return;

        btn.classList.add("ig-dl-loading");
        chrome.runtime.sendMessage({ action: "download", url, type: media.type }, (resp) => {
          btn.classList.remove("ig-dl-loading");
          btn.classList.add(resp?.ok ? "ig-dl-ok" : "ig-dl-err");
          setTimeout(() => btn.classList.remove("ig-dl-ok", "ig-dl-err"), 1200);
        });
      });

      clickable.insertAdjacentElement("afterend", btn);
    });
  }

  // ---------- loop principal ----------

  function scan() {
    attachBesideSaveButtons();
    document.querySelectorAll("video").forEach((v) => attachOverlay(v, "video"));
    document.querySelectorAll('img[srcset], img[src]').forEach((img) => attachOverlay(img, "image"));
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__igDlScanTimer);
    window.__igDlScanTimer = setTimeout(scan, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  scan();
})();
