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

## Testes

Precisa só do Node (18 ou mais novo) e do Bash. Rode na pasta do guia:

```
node tools/testar-missoes.js
node tools/testar-missoes.js --vim-real
PROIBIDO=/caminho/fora/do/repositorio/proibido.txt tools/checar-privacidade.sh
```

- `tools/testar-missoes.js` roda cada missão (`div.vimtry`) no mesmo Vim simulado do site: o texto inicial não pode já ser a meta, nem digitar a meta em modo de inserção pode cumprir a missão; com as teclas de `data-solucao` o texto tem de chegar na meta (salvo, se `data-save="1"`) e caber no `data-max-keys`. Também roda as demonstrações e confere os exercícios. Com `--vim-real`, cada solução roda também no `vim.tiny` de verdade.
- `tools/checar-privacidade.sh` procura, nas páginas e em todo o histórico do git, as strings da lista apontada por `PROIBIDO` (nomes, pastas e IPs reais, uma por linha; `re:` no começo = expressão regular). A lista fica fora do repositório.
