# Guia Vim

Curso de Vim em português, do zero ao avançado, organizado em **3 níveis + projetos**. Vale para qualquer sistema (Linux, macOS, Windows).

Cada aula explica as teclas parte por parte (anatomia), mostra **demonstrações passo a passo** (clique em "Próxima tecla" e veja o Vim reagir) e traz **missões num Vim simulado** que roda no navegador e confere se você chegou ao resultado. O simulador foi comparado caso a caso com o Vim 9.1 real e usa as mensagens oficiais em pt-BR.

Site 100% estático (HTML + CSS + JS, sem build e sem dependências externas): abre direto no navegador e funciona no GitHub Pages.

## Estrutura

```
index.html            página inicial
<tema>.html           uma aula por tema (apagar.html, objetos.html, macros.html…)
assets/style.css      visual (tema claro/escuro automático)
assets/site.js        níveis/menu, Anterior/Próximo, anatomia, exercícios
assets/vimsim.js      o Vim simulado (demonstrações e missões)
CONTRIBUINDO.md       como escrever uma aula
.nojekyll             faz o GitHub Pages servir os arquivos como estão
```

## Publicar no GitHub Pages

Envie a pasta para um repositório e ative **Settings → Pages → Deploy from a branch → main / (root)**.

## Adicionar uma aula

Leia `CONTRIBUINDO.md`, copie `apagar.html` (a página-modelo) e inclua a página na lista `NIVEIS` de `assets/site.js`.
