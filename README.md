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

## Limitações e avisos

- O Instagram muda o HTML do site com frequência; se o botão parar de
  aparecer em algum tipo de página, me avisa que eu ajusto os seletores.
- Stories somem da API do Instagram depois de um tempo — baixe na hora que
  estiver vendo.
- Algumas mídias em qualidade muito alta (carrosséis, certos reels) podem
  vir em resolução um pouco menor que a original, dependendo do que o
  Instagram carregou no navegador naquele momento.
- Baixar conteúdo de terceiros pode esbarrar nos Termos de Uso do Instagram
  e em direitos autorais de quem postou. Use para salvar posts seus, ou
  conteúdo de terceiros só quando tiver permissão / for para uso pessoal.
  A extensão não contorna login, privacidade ou autenticação — ela só
  baixa o que já está carregado e visível na tela.

## Publicar na Chrome Web Store (opcional)

Se quiser publicar, vai precisar de uma conta de desenvolvedor (taxa única
de US$5) e revisar a política da Google para extensões de download de
mídia de redes sociais — algumas categorias exigem justificativa extra na
descrição da loja.
