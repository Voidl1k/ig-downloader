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

  function log(...args) {
    console.log("[IG Downloader]", ...args);
  }
  function warn(...args) {
    console.warn("[IG Downloader]", ...args);
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
    // slides fora da tela (carrossel/stories) ficam transladados para o lado —
    // isso muda o retângulo real do elemento, então checamos se ele
    // realmente cruza a área visível da janela
    if (rect.right <= 0 || rect.left >= window.innerWidth || rect.bottom <= 0 || rect.top >= window.innerHeight) {
      return false;
    }
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  // menor ancestral comum entre dois elementos — usado para restringir buscas
  // (setas de avançar/voltar) apenas ao post em questão, nunca vazando para
  // outros posts / o perfil inteiro
  function commonAncestor(a, b) {
    let node = a;
    while (node && node !== document.documentElement) {
      if (node.contains(b)) return node;
      node = node.parentElement;
    }
    return document.body;
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

  function findNavButton(root, re) {
    const svg = Array.from(root.querySelectorAll("svg[aria-label]")).find((s) =>
      re.test(s.getAttribute("aria-label") || "")
    );
    if (!svg) return null;
    return svg.closest('button, div[role="button"]') || svg.parentElement;
  }

  // ---------- mecanismo de download com fallback ----------

  async function downloadViaFetch(url, type, filenameBase) {
    try {
      log("Tentando fetch direto:", url);
      const res = await fetch(url, { 
        mode: 'cors',
        credentials: 'include',
        headers: {
          'Accept': type === 'video' ? 'video/*' : 'image/*'
        }
      });
      if (!res.ok) {
        throw new Error("HTTP " + res.status + " " + res.statusText);
      }
      log("Fetch bem-sucedido, status:", res.status);
      const blob = await res.blob();
      log("Blob recebido, tamanho:", blob.size, "tipo:", blob.type);
      const guessedExt = (blob.type.split("/")[1] || (type === "video" ? "mp4" : "jpg")).replace("jpeg", "jpg");
      const filename = `${filenameBase}.${guessedExt}`;
      log("Criando download blob com nome:", filename);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      log("Download via fetch concluído com sucesso");
      return true;
    } catch (err) {
      warn("fetch direto também falhou:", err.message);
      return false;
    }
  }

  async function performDownload(url, type) {
    if (!url) {
      warn("URL vazia, não é possível baixar");
      return false;
    }

    // Blob URLs devem ser processadas localmente (content script tem acesso)
    if (url.startsWith("blob:")) {
      log("Detectado blob URL, processando localmente:", url);
      return downloadViaFetch(url, type, `instagram_${Date.now()}`);
    }

    if (!/^https?:\/\//.test(url)) {
      warn("URL inválida, não é possível baixar:", url);
      return false;
    }

    log("Iniciando download individual:", url, "tipo:", type);

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "download", url, type }, (response) => {
        log("Resposta do background:", response);
        resolve(response);
      });
    });

    if (resp?.ok) {
      log("Download individual concluído com sucesso");
      return true;
    }

    warn("Falha via chrome.downloads, tentando fetch direto:", resp?.error);
    return downloadViaFetch(url, type, `instagram_${Date.now()}`);
  }

  async function performDownloadBatch(items) {
    if (!items.length) {
      warn("Lista de downloads vazia");
      return false;
    }

    log("Iniciando download em lote de", items.length, "itens");

    // Separa blobs (processados localmente) de URLs normais (enviadas ao background)
    const blobItems = items.filter(item => item.url.startsWith("blob:"));
    const httpItems = items.filter(item => !item.url.startsWith("blob:") && /^https?:\/\//.test(item.url));
    
    if (blobItems.length > 0) {
      log("Processando", blobItems.length, "blob URLs localmente");
      const stamp = Date.now();
      for (let i = 0; i < blobItems.length; i++) {
        await downloadViaFetch(blobItems[i].url, blobItems[i].type, `instagram_${stamp}_${String(i + 1).padStart(2, "0")}`);
      }
    }

    if (httpItems.length === 0) {
      log("Todos os itens eram blobs, download concluído");
      return true;
    }

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "downloadBatch", items: httpItems }, (response) => {
        log("Resposta do background:", response);
        resolve(response);
      });
    });

    if (resp?.ok) {
      log("Lote baixado com sucesso via chrome.downloads");
      return true;
    }

    warn("Lote falhou via chrome.downloads, tentando fetch direto item a item:", resp?.error);
    const stamp = Date.now();
    let anyOk = false;
    for (let i = 0; i < httpItems.length; i++) {
      log("Baixando item", i + 1, "de", httpItems.length, ":", httpItems[i].url);
      const ok = await downloadViaFetch(httpItems[i].url, httpItems[i].type, `instagram_${stamp}_${String(i + 1).padStart(2, "0")}`);
      anyOk = anyOk || ok;
    }
    return anyOk;
  }

  function downloadSingle(btn, url, type) {
    btn.classList.add("ig-dl-loading");
    performDownload(url, type).then((ok) => {
      btn.classList.remove("ig-dl-loading");
      btn.classList.add(ok ? "ig-dl-ok" : "ig-dl-err");
      setTimeout(() => btn.classList.remove("ig-dl-ok", "ig-dl-err"), 1200);
    });
  }

  // ---------- menu genérico "baixar esta / baixar todas" ----------

  function showChoiceMenu(anchorBtn, labelCurrent, labelAll, onChoice) {
    document.querySelectorAll(".ig-dl-menu").forEach((m) => m.remove());

    const menu = document.createElement("div");
    menu.className = "ig-dl-menu";

    const optCurrent = document.createElement("button");
    optCurrent.type = "button";
    optCurrent.className = "ig-dl-menu-item";
    optCurrent.textContent = labelCurrent;

    const optAll = document.createElement("button");
    optAll.type = "button";
    optAll.className = "ig-dl-menu-item";
    optAll.textContent = labelAll;

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
    const top = Math.min(rect.bottom + window.scrollY + 6, document.documentElement.scrollHeight - 90);
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 220)}px`;

    setTimeout(() => document.addEventListener("click", outsideClick, true), 0);
  }

  // ---------- carrossel de posts (feed) ----------

  async function collectCarousel(scopedContainer) {
    // Encontra o índice do slide atual para retornar a ele ao final
    const initialMedia = getMediaForContainer(scopedContainer);
    const initialUrl = initialMedia 
      ? (initialMedia.type === "video" ? initialMedia.el.currentSrc || initialMedia.el.src : getBestImageUrl(initialMedia.el))
      : null;

    let currentIndex = 0;
    let backSteps = 0;
    let guard = 0;
    
    // Volta para o primeiro slide para começar a coleta
    while (guard++ < 20) {
      const prev = findNavButton(scopedContainer, PREV_RE);
      if (!prev) break;
      prev.click();
      backSteps++;
      await sleep(300);
    }

    const collected = [];
    const seenUrls = new Set();
    guard = 0;
    
    // Coleta todos os slides do carrossel
    while (guard++ < 20) {
      const media = getMediaForContainer(scopedContainer);
      if (media) {
        const url = media.type === "video" ? media.el.currentSrc || media.el.src : getBestImageUrl(media.el);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          collected.push({ url, type: media.type });
        }
      }
      const next = findNavButton(scopedContainer, NEXT_RE);
      if (!next) break;
      next.click();
      await sleep(350);
    }

    // Volta para a posição inicial (ou próxima a ela)
    for (let i = 0; i < backSteps; i++) {
      const next = findNavButton(scopedContainer, NEXT_RE);
      if (!next) break;
      next.click();
      await sleep(150);
    }

    return collected;
  }

  // Armazena o contexto do clique para identificar a mídia visível naquele momento
  let lastMediaSnapshot = null;

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
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const url = type === "video" ? mediaEl.currentSrc || mediaEl.src : getBestImageUrl(mediaEl);

      btn.textContent = "…";
      const ok = await performDownload(url, type);
      btn.textContent = ok ? "✓" : "✕";
      setTimeout(() => (btn.textContent = "⬇"), 1500);
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

      const broadContainer = findPostContainer(svg);
      const media = getMediaForContainer(broadContainer);
      if (!media) return;

      // restringe a busca de setas de navegação apenas a este post
      // (ancestral comum entre o ícone de salvar e a mídia encontrada)
      const scoped = commonAncestor(svg, media.el);

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

        // Captura a mídia visível NAQUELE MOMENTO do clique
        const currentMedia = getMediaForContainer(scoped) || media;
        const currentUrl = currentMedia.type === "video" ? currentMedia.el.currentSrc || currentMedia.el.src : getBestImageUrl(currentMedia.el);
        lastMediaSnapshot = { url: currentUrl, type: currentMedia.type, element: currentMedia.el };

        const hasCarousel = !!findNavButton(scoped, NEXT_RE) || !!findNavButton(scoped, PREV_RE);

        if (!hasCarousel) {
          downloadSingle(btn, currentUrl, currentMedia.type);
          return;
        }

        showChoiceMenu(btn, "Baixar só esta foto", "Baixar todas do carrossel", async (choice) => {
          if (choice === "current") {
            // Usa a captura feita no momento do clique, não busca novamente
            downloadSingle(btn, lastMediaSnapshot.url, lastMediaSnapshot.type);
            return;
          }

          btn.classList.add("ig-dl-loading");
          const items = await collectCarousel(scoped);
          btn.classList.remove("ig-dl-loading");

          if (!items.length) {
            btn.classList.add("ig-dl-err");
            setTimeout(() => btn.classList.remove("ig-dl-err"), 1200);
            return;
          }

          btn.classList.add("ig-dl-loading");
          const ok = await performDownloadBatch(items);
          btn.classList.remove("ig-dl-loading");
          btn.classList.add(ok ? "ig-dl-ok" : "ig-dl-err");
          setTimeout(() => btn.classList.remove("ig-dl-ok", "ig-dl-err"), 1200);
        });
      });

      clickable.insertAdjacentElement("afterend", btn);
    });
  }

  // ---------- botão fixo para Stories e Destaques (/stories/...) ----------

  let storyBtn = null;

  function isStoryOrHighlight() {
    const isStory = /\/stories\//.test(location.pathname);
    log("Verificando se é story/highlight:", location.pathname, "=>", isStory);
    return isStory;
  }

  // identifica a "sessão" atual de story (mesmo usuário ou mesmo destaque),
  // para nunca coletar mídia de outra pessoa ao navegar
  function getStoryOwnerKey() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "stories") return null;
    if (parts[1] === "highlights") return `highlights/${parts[2] || ""}`;
    return `user/${parts[1] || ""}`;
  }

  function getCurrentStoryMedia() {
    const candidates = [];

    document.querySelectorAll("video").forEach((el) => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > 0) {
        candidates.push({ el, type: "video", area });
        log("Video encontrado:", el.src || el.currentSrc, "área:", area);
      }
    });

    document.querySelectorAll('img[srcset], img[src]').forEach((el) => {
      if (isAvatarLike(el) || !isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > 0) {
        candidates.push({ el, type: "image", area });
        log("Imagem encontrada:", getBestImageUrl(el), "área:", area);
      }
    });

    if (!candidates.length) {
      warn("Nenhuma mídia encontrada neste story");
      return null;
    }
    candidates.sort((a, b) => b.area - a.area);
    const selected = candidates[0];
    log("Mídia de story selecionada:", selected.type, "área:", selected.area);
    return selected;
  }

  async function collectStorySet() {
    const ownerKey = getStoryOwnerKey();
    if (!ownerKey) return [];

    // volta para o primeiro item deste story/destaque
    let backSteps = 0;
    let guard = 0;
    while (guard++ < 40) {
      const prev = findNavButton(document, PREV_RE);
      if (!prev) break;
      prev.click();
      await sleep(380);
      if (getStoryOwnerKey() !== ownerKey) {
        const next = findNavButton(document, NEXT_RE);
        if (next) {
          next.click();
          await sleep(380);
        }
        break;
      }
      backSteps++;
    }

    const collected = [];
    const seenUrls = new Set();
    guard = 0;
    while (guard++ < 40) {
      if (getStoryOwnerKey() !== ownerKey) break;

      const media = getCurrentStoryMedia();
      if (media) {
        const url = media.type === "video" ? media.el.currentSrc || media.el.src : getBestImageUrl(media.el);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          collected.push({ url, type: media.type });
        }
      }

      const next = findNavButton(document, NEXT_RE);
      if (!next) break;
      next.click();
      await sleep(420);

      if (getStoryOwnerKey() !== ownerKey) break; // passou para o próximo usuário/destaque
    }

    // tenta voltar para a posição original
    for (let i = 0; i < backSteps; i++) {
      if (getStoryOwnerKey() !== ownerKey) break;
      const next = findNavButton(document, NEXT_RE);
      if (!next) break;
      next.click();
      await sleep(200);
    }

    return collected;
  }

  function ensureStoryButton() {
    if (!isStoryOrHighlight()) {
      if (storyBtn) {
        log("Removendo botão de story - não estamos em story/highlight");
        storyBtn.remove();
        storyBtn = null;
      }
      return;
    }

    if (storyBtn && document.body.contains(storyBtn)) {
      log("Botão de story já existe");
      return;
    }

    log("Criando novo botão de story");

    storyBtn = document.createElement("button");
    storyBtn.type = "button";
    storyBtn.className = "ig-dl-story-btn";
    storyBtn.title = "Baixar este story";
    storyBtn.innerHTML = DOWNLOAD_SVG;

    storyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Captura a mídia visível NAQUELE MOMENTO do clique
      const currentMedia = getCurrentStoryMedia();
      if (!currentMedia) return;
      const currentUrl = currentMedia.type === "video" ? currentMedia.el.currentSrc || currentMedia.el.src : getBestImageUrl(currentMedia.el);
      lastMediaSnapshot = { url: currentUrl, type: currentMedia.type, element: currentMedia.el };

      const hasMore = !!findNavButton(document, NEXT_RE) || !!findNavButton(document, PREV_RE);

      if (!hasMore) {
        downloadSingle(storyBtn, currentUrl, currentMedia.type);
        return;
      }

      showChoiceMenu(storyBtn, "Baixar apenas este story", "Baixar todos os stories do usuário", async (choice) => {
        if (choice === "current") {
          // Usa a captura feita no momento do clique
          downloadSingle(storyBtn, lastMediaSnapshot.url, lastMediaSnapshot.type);
          return;
        }

        storyBtn.classList.add("ig-dl-loading");
        const items = await collectStorySet();
        storyBtn.classList.remove("ig-dl-loading");

        if (!items.length) {
          storyBtn.classList.add("ig-dl-err");
          setTimeout(() => storyBtn.classList.remove("ig-dl-err"), 1200);
          return;
        }

        storyBtn.classList.add("ig-dl-loading");
        const ok = await performDownloadBatch(items);
        storyBtn.classList.remove("ig-dl-loading");
        storyBtn.classList.add(ok ? "ig-dl-ok" : "ig-dl-err");
        setTimeout(() => storyBtn.classList.remove("ig-dl-ok", "ig-dl-err"), 1200);
      });
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
