# IG Downloader — Fotos, Reels e Stories

Extensão para Google Chrome (Manifest V3) que adiciona um botão de download
sobre fotos, reels e stories do Instagram, além de uma opção no menu de
contexto (botão direito).

## Como instalar (modo desenvolvedor)

1. Baixe e descompacte esta pasta em algum lugar do seu PC.
2. Abra o Chrome e vá em `chrome://extensions`.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** (Load unpacked).
5. Selecione a pasta `ig-downloader`.
6. Pronto — o ícone da extensão vai aparecer na barra do Chrome.

## Como usar

- Abra uma foto, reel ou story no Instagram.
- Passe o mouse sobre a mídia: vai aparecer uma setinha ⬇ no canto.
  Clique nela para baixar.
- Ou clique com o botão direito em cima da foto/vídeo → **Baixar mídia do
  Instagram**.
- Os arquivos vão para `Downloads/IG-Downloader/` no seu computador.

## Como funciona (resumo técnico)

- `content.js` roda dentro das páginas do instagram.com, observa o DOM
  (a página é uma SPA que carrega conteúdo dinamicamente) e injeta um botão
  sobre cada `<img>`/`<video>` relevante, ignorando ícones e avatares
  pequenos.
- `background.js` (service worker) recebe a URL da mídia e usa
  `chrome.downloads.download` para salvar o arquivo, e também cadastra a
  opção no menu de contexto.
- Não há requisição a nenhum servidor externo além do próprio CDN do
  Instagram — tudo roda localmente no navegador.
