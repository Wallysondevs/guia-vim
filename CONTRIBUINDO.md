# Como escrever uma página do Guia Vim

O guia é uma **escola**: nenhuma tecla aparece sem explicação. O leitor vê o que cada tecla faz, o resultado na tela e o que fazer quando não funciona. A página-modelo é **`apagar.html`**: copie a estrutura dela.

O Vim é igual em qualquer sistema (Linux, macOS, Windows). Quando algo depender do sistema (instalação, área de transferência, atalhos do terminal), mostre as variações.

## 1. Esqueleto

Igual ao `apagar.html`: `head` com `<title>Vim — tema | Guia Vim</title>`, `meta description`, script de tema, `nav#sidebar`, `main > .content`, `div.pager` no topo e no fim, `h1` com `Vim <span class="hl">Tema</span>`, `script src="assets/site.js"`. O menu, o selo de nível e Anterior/Próximo vêm da lista `NIVEIS` em `assets/site.js`.

## 2. Ordem de uma aula

1. `p.intro` — o problema que o comando resolve.
2. `div.note` "Você vai aprender".
3. Lembrete de modo quando necessário (quase tudo é no modo normal).
4. Do simples ao completo, **uma tecla nova por vez**, cada comando novo com `dl.anatomy` (uma `dt` por tecla ou grupo de teclas).
5. Toda demonstração em `div.vimdemo`, seguida de uma frase dizendo o que mudou e onde o cursor ficou.
6. Mensagens do rodapé explicadas (elas aparecem no simulador iguais ao Vim real).
7. "Formas diferentes de fazer" com tabela "Teclas · O que acontece · Quando usar".
8. `div.vimtry` com missão em cada seção importante (o simulador confere o resultado).
9. "Quando não funciona" em `div.cenario`.
10. Tabela de referência, 3+ exercícios (`.exercise`, `.mc`), resumo.

## 3. Componentes do Vim

### Demonstração passo a passo
```html
<div class="vimdemo" data-file="lista.txt" data-line="2" data-col="3" data-keys="dw">
<pre class="vim-inicial">texto inicial
segunda linha</pre>
</div>
```
- `data-keys`: as teclas, com notação do Vim: `<Esc>`, `<CR>` (Enter), `<BS>`, `<Tab>`, `<C-r>`, `<C-v>`, `<lt>` para o próprio `<`. Em HTML escreva `&lt;Esc&gt;`.
- `data-line` / `data-col`: posição inicial do cursor (começando em 1).
- `data-set="number hlsearch"`: opções ligadas antes. `data-title`: título da janela.
- Sem `data-keys`, a caixa vira só uma tela parada (útil para "antes").
- O leitor clica em "Próxima tecla" e vê cada passo; o rodapé mostra o comando pendente (showcmd), o modo e a régua.

### Vim interativo com missão
```html
<div class="vimtry" data-file="compras.txt" data-line="1" data-max-keys="5" data-save="1">
<pre class="vim-inicial">texto inicial</pre>
<pre class="vim-meta">texto que o leitor precisa produzir</pre>
<p class="try-task"><strong>Missão:</strong> …</p>
</div>
```
- Sem `pre.vim-meta` = treino livre. `data-max-keys` = desafio de poucas teclas (Vim Golf). `data-save="1"` = exige `:w`.
- Teste toda missão no motor antes de publicar (veja a seção 5). A missão não pode começar cumprida.

### Outros
`dl.anatomy` (anatomia de teclas), `pre.term` (sessão de shell: `$ vim notas.txt`), `pre.file data-file="~/.vimrc"` (arquivos de configuração), `div.cenario`, `ol.passo`, `.note/.tip/.warning`, `table.ref`, `.exercise` com `input[data-answer="4dd|d3j"]`, `.mc`. Teclas avulsas em `<kbd>`, comandos em `<code>`.

## 4. O que o simulador faz

**Faz (igual ao Vim):** movimentos `h j k l w b e W B E ge 0 ^ $ g_ gg G H M L f F t T ; , % { } n N * # ' \` + -`; operadores `d c y > < g~ gu gU` com contagem; objetos `iw aw iW aW ip ap i" a" i' a' i( a( ib i{ iB i[ i< it at`; `x X s S r R J gJ ~ p P gp gP o O i a I A gI gi C D Y u U <C-r> . q @ @@ m <C-a> <C-x> <C-o> <C-g>`; visual `v V <C-v> gv o` com `d x y c s r > < ~ u U J I A p $`; inserção com `<Esc> <CR> <BS> <Tab> <C-w> <C-u> <C-r>{reg} <C-o>` e setas; registradores `" 0-9 a-z A-Z - _ . : /`; linha de comando `: / ?` com histórico; Ex: `:w :q :wq :x :q! :e! ZZ ZQ :{n} :s :%s` (flags `g i I n`), `:& :g :v :norm :d :y :m :t :co :j :> :< :sort :set :noh :reg :marks :undo :redo :p :nu :put`. Opções: `number relativenumber ignorecase smartcase hlsearch list shiftwidth tabstop expandtab autoindent incsearch`. Mensagens do Vim em pt-BR (E37, E486, "3 linhas a menos", "-- INSERÇÃO --"…).

**Não faz:** vários arquivos/buffers, janelas e abas, `:!`/`:r !` (shell), `:help`, Vimscript (`:let`, `:function`, `:map`, `autocmd`), plugins, cores de sintaxe, dobras, autocompletar, ortografia, área de transferência do sistema, flag `c` do `:s`. Nesses temas use `pre.term` e `pre.file` (nunca finja uma missão).

## 5. Fidelidade

- Mensagens: o Vim mostra em português quando o sistema está em pt-BR e o pacote completo está instalado (`vim`, não só `vim-tiny`). Use as do simulador (vêm da tradução oficial). Quando relevante, cite a versão em inglês.
- Configuração de referência: Vim 9.1 com `defaults.vim` (o que você tem ao abrir `vim` sem `.vimrc`): `showcmd`, `ruler`, `incsearch`, `backspace=indent,eol,start`. `shiftwidth` padrão é 8 e Tab insere tab de verdade.
- Gere e confira resultados com o motor:
  `node -e "const {Vim}=require('./assets/vimsim.js');const v=new Vim('texto\nlinha 2',{coluna:1});Vim.tokens('dw').forEach(k=>v.tecla(k));console.log(JSON.stringify(v.texto()),v.msg,(v.r+1)+','+(v.c+1))"`
- Compare com o Vim real desta máquina (`vim.tiny` 9.1, sem tela):
  `printf 'texto\n' > /tmp/x.txt; vim.tiny -u NONE -N -i NONE -n -es -c 'normal! gg0' -c 'normal! dw' -c 'w! /tmp/y.txt' -c 'qa!' /tmp/x.txt; cat /tmp/y.txt`
  (no `-es`, `\x1b` é Esc e `\r` é Enter; o `:normal` aborta no primeiro erro e agrupa o desfazer — para testar desfazer/macros use `script -qc "vim.tiny -u NONE -N -i NONE -n -s teclas.txt arq" /dev/null`).
- Recursos que o `vim.tiny` não tem (Vimscript, sintaxe, área de transferência, plugins): escreva com cuidado e diga quando a saída é ilustrativa.

## 6. Escrita

Português do Brasil, frases curtas. Diga a origem em inglês de cada tecla (`w` = *word*, `d` = *delete*, `y` = *yank*). Nunca mostre uma sequência longa (`ci"`) sem quebrar em partes antes. Em `<pre>`, escreva `&lt;` `&gt;` `&amp;`.
