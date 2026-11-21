#!/usr/bin/env node
/*
  tools/testar-missoes.js — confere as missões (div.vimtry) e os exercícios das páginas.

  Uso:
    node tools/testar-missoes.js                 # todas as páginas .html da raiz
    node tools/testar-missoes.js macros.html     # só estas páginas
    node tools/testar-missoes.js --vim-real      # também roda cada solução no Vim de verdade (vim.tiny)
    node tools/testar-missoes.js --detalhes      # mostra também as missões que passaram

  Para cada div.vimtry com pre.vim-meta (o motor é o mesmo assets/vimsim.js do site):
    - a missão precisa de data-solucao (as teclas, na notação de data-keys: <Esc>, <CR>, <C-v>…);
    - o texto inicial NÃO pode já ser a meta (a missão não pode começar cumprida);
    - casos negativos: nenhuma tecla, e digitar o texto da meta em modo de inserção
      (i + meta + <Esc>), não podem cumprir a missão;
    - digitando a data-solucao, o texto fica igual à meta (e salvo, se data-save="1");
    - com data-max-keys, a solução cabe no limite (o desafio precisa ser possível);
    - com --vim-real, a mesma solução roda no vim.tiny e o arquivo final tem de ser a meta.
  Para cada div.vimdemo: as teclas de data-keys rodam no motor sem erro.
  Para os exercícios:
    - input[data-answer]: nenhuma alternativa vazia (o campo vazio não pode ser aceito);
    - .mc[data-answer]: o número da resposta certa precisa existir entre as opções.
*/
"use strict";
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var RAIZ = path.join(__dirname, "..");
var Vim = require(path.join(RAIZ, "assets", "vimsim.js")).Vim;

function decodificar(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, function (m, e) {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", hellip: "…", mdash: "—", ndash: "–" }[e] || m;
  });
}
function atributos(tag) {
  var at = {}, re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g, m;
  tag = tag.replace(/^<\w+/, "").replace(/\/?>$/, "");
  while ((m = re.exec(tag))) at[m[1]] = decodificar(m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : "");
  return at;
}
function fimDiv(html, ini) {
  var re = /<div\b|<\/div>/gi, d = 0, m;
  re.lastIndex = ini;
  while ((m = re.exec(html))) { if (m[0][1] === "/") { d--; if (d === 0) return m.index; } else d++; }
  return html.length;
}
function linhaDe(html, i) { return html.slice(0, i).split("\n").length; }
// igual ao textContent do navegador (o HTML ignora a quebra de linha logo depois de <pre>),
// com o mesmo corte de \n do começo e do fim que o vimsim.js faz
function textoPre(corpo, classe) {
  var m = new RegExp('<pre\\b[^>]*class\\s*=\\s*["\'][^"\']*\\b' + classe + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)</pre>', "i").exec(corpo);
  return m ? decodificar(m[1].replace(/^\r?\n/, "").replace(/<[^>]+>/g, "")).replace(/^\n/, "").replace(/\n$/, "") : null;
}
function extrair(html, classe) {
  var res = [], re = /<div\b[^>]*class\s*=\s*["']([^"']*)["'][^>]*>/gi, m;
  while ((m = re.exec(html))) {
    if (m[1].split(/\s+/).indexOf(classe) < 0) continue;
    var corpo = html.slice(m.index + m[0].length, fimDiv(html, m.index));
    var t = /<p\b[^>]*class\s*=\s*["'][^"']*try-task[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(corpo);
    var at = atributos(m[0]);
    var ini = textoPre(corpo, "vim-inicial");
    if (ini === null) ini = (at["data-text"] || "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    res.push({ at: at, inicial: ini, meta: textoPre(corpo, "vim-meta"),
      tarefa: t ? decodificar(t[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() : "", linha: linhaDe(html, m.index) });
  }
  return res;
}

// mesma sequência do site (montar → inicia)
function abrir(m) {
  var v = new Vim(m.inicial, { arquivo: m.at["data-file"] || "exemplo.txt", linha: +(m.at["data-line"] || 0), coluna: +(m.at["data-col"] || 0) });
  if (m.at["data-set"]) v.executaEx("set " + m.at["data-set"]);
  return v;
}
function rodar(m, teclas) { var v = abrir(m); Vim.tokens(teclas).forEach(function (k) { v.tecla(k); }); return v; }
function cumpriu(m, v) { return v.texto() === m.meta && (m.at["data-save"] !== "1" || v.salvo === m.meta); }

// ---- Vim de verdade (vim.tiny), opcional ----
var VIM_REAL = null;
function temVimReal() {
  if (VIM_REAL !== null) return VIM_REAL;
  try { cp.execFileSync("vim.tiny", ["--version"], { stdio: "ignore" }); VIM_REAL = true; } catch (e) { VIM_REAL = false; }
  return VIM_REAL;
}
function bytesDe(teclas) {
  return Vim.tokens(teclas).map(function (k) {
    var e = { ArrowLeft: "\x1b[D", ArrowRight: "\x1b[C", ArrowUp: "\x1b[A", ArrowDown: "\x1b[B" }[k];
    return e || Vim.teclaParaChar(k);
  }).join("");
}
function rodarVimReal(m) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "vimtry-"));
  try {
    var arq = path.join(dir, path.basename(m.at["data-file"] || "exemplo.txt")), saida = path.join(dir, "saida.txt");
    fs.writeFileSync(arq, m.inicial === "" ? "" : m.inicial + "\n");
    fs.writeFileSync(path.join(dir, "teclas.txt"), bytesDe(m.at["data-solucao"]) + "\x1b\x1b:w! " + saida + "\r:qa!\r");
    var l = +(m.at["data-line"] || 1), c = +(m.at["data-col"] || 1);
    var args = ["-u", "NONE", "-N", "-i", "NONE", "-n", "-c", "set backspace=indent,eol,start nohlsearch" + (m.at["data-set"] ? " " + m.at["data-set"] : ""),
      "-c", "normal! " + l + "G0" + (c > 1 ? (c - 1) + "l" : ""), "-s", "teclas.txt", path.basename(arq)];
    var cmd = "vim.tiny " + args.map(function (a) { return "'" + a.replace(/'/g, "'\\''") + "'"; }).join(" ");
    cp.execFileSync("script", ["-qc", cmd, "/dev/null"], { cwd: dir, stdio: "ignore", timeout: 15000, env: Object.assign({}, process.env, { TERM: "xterm", LANG: "C.UTF-8" }) });
    var final = fs.existsSync(saida) ? fs.readFileSync(saida, "utf8") : fs.readFileSync(arq, "utf8");
    var salvo = fs.readFileSync(arq, "utf8");
    return { texto: final.replace(/\n$/, ""), salvo: salvo.replace(/\n$/, "") };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function testarMissao(m, real) {
  var erros = [], avisos = [], sol = m.at["data-solucao"];
  if (m.inicial === m.meta) erros.push("o texto inicial já é a meta (a missão começa cumprida)");
  if (cumpriu(m, abrir(m))) erros.push("sem digitar nada a missão já está cumprida");
  if (m.inicial !== "" && cumpriu(m, rodar(m, "i" + m.meta.replace(/</g, "<lt>").replace(/\n/g, "<CR>") + "<Esc>")))
    erros.push("digitar o texto da meta em modo de inserção cumpre a missão");
  if (!sol) { erros.push("falta data-solucao"); return { erros: erros, avisos: avisos }; }
  var v = rodar(m, sol);
  if (!cumpriu(m, v)) {
    erros.push(v.texto() === m.meta ? "a solução chega na meta, mas não salva (data-save=\"1\")" :
      "a solução não chega na meta. Texto final: " + JSON.stringify(v.texto()) + (v.msg ? " · mensagem: " + JSON.stringify(v.msg) : ""));
  }
  var max = +(m.at["data-max-keys"] || 0);
  if (max && v.teclas > max) erros.push("a solução usa " + v.teclas + " teclas e o desafio pede no máximo " + max);
  if (real && temVimReal()) {
    try {
      var r = rodarVimReal(m);
      // limites do vim.tiny (versão Tiny) rodando com -s: junta num só passo de desfazer tudo o que veio
      // do arquivo de teclas, e não tem os objetos de tag (it/at). Nesses casos a diferença vira aviso.
      var limiteTiny = /<C-r>/.test(sol) || /[cdyv][ia]t/.test(sol);
      if (r.texto !== m.meta && limiteTiny) avisos.push("no vim.tiny dá outro texto (" + JSON.stringify(r.texto) + "), mas a solução usa desfazer/refazer ou objeto de tag, que o vim.tiny com -s não reproduz; confira num Vim completo");
      else if (r.texto !== m.meta) erros.push("no Vim de verdade a solução dá outro texto: " + JSON.stringify(r.texto));
      else if (m.at["data-save"] === "1" && r.salvo !== m.meta) erros.push("no Vim de verdade a solução não salva o arquivo");
    } catch (e) { avisos.push("não deu para rodar no vim.tiny: " + e.message.split("\n")[0]); }
  }
  return { erros: erros, avisos: avisos };
}
function testarDemo(m) {
  try { rodar(m, m.at["data-keys"] || ""); return []; } catch (e) { return ["as teclas da demonstração quebram o motor: " + e.message]; }
}
function testarExercicios(html) {
  var erros = [], n = 0, m;
  var re = /<input\b[^>]*data-answer\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi;
  while ((m = re.exec(html))) {
    n++;
    var sep = atributos(m[0])["data-sep"] || "|";
    var alts = decodificar(m[2] !== undefined ? m[2] : m[3]).split(sep).map(function (s) { return s.trim().replace(/\s+/g, " "); });
    if (alts.some(function (a) { return a === ""; })) erros.push("linha " + linhaDe(html, m.index) + ": exercício aceita o campo vazio (data-answer=\"" + alts.join(sep) + "\")");
  }
  var reMc = /<div\b[^>]*class\s*=\s*["'][^"']*\bmc\b[^"']*["'][^>]*>/gi;
  while ((m = reMc.exec(html))) {
    n++;
    var at = atributos(m[0]), corpo = html.slice(m.index, fimDiv(html, m.index));
    var opcoes = (corpo.match(/<label\b/gi) || []).length, certa = parseInt(at["data-answer"], 10);
    if (!(certa >= 1 && certa <= opcoes)) erros.push("linha " + linhaDe(html, m.index) + ": múltipla escolha com data-answer=\"" + at["data-answer"] + "\" e " + opcoes + " opções");
  }
  return { n: n, erros: erros };
}

function main(argv) {
  var detalhes = argv.indexOf("--detalhes") >= 0, real = argv.indexOf("--vim-real") >= 0;
  if (real && !temVimReal()) console.log("(vim.tiny não encontrado: --vim-real ignorado)");
  var paginas = argv.filter(function (a) { return a[0] !== "-"; });
  if (!paginas.length) paginas = fs.readdirSync(RAIZ).filter(function (f) { return /\.html$/.test(f); }).sort();
  var total = 0, falhas = 0, livres = 0, nAvisos = 0, demos = 0, demoFalhas = 0, exTotal = 0, exFalhas = 0;
  paginas.forEach(function (pg) {
    var arq = fs.existsSync(pg) ? pg : path.join(RAIZ, pg);
    if (!fs.existsSync(arq)) { console.log(pg + "\n  ✗ arquivo não encontrado"); falhas++; return; }
    var html = fs.readFileSync(arq, "utf8"), linhas = [];
    extrair(html, "vimtry").forEach(function (m, ix) {
      if (m.meta === null) { livres++; return; }
      total++;
      var nome = "vimtry #" + (ix + 1) + " (linha " + m.linha + ")" + (m.tarefa ? ": " + m.tarefa.replace(/^(Missão|Desafio)[^:]*:\s*/, "").slice(0, 60) + (m.tarefa.length > 60 ? "…" : "") : "");
      var r;
      try { r = testarMissao(m, real); } catch (e) { r = { erros: ["erro no motor: " + e.message], avisos: [] }; }
      if (r.erros.length) { falhas++; linhas.push("  ✗ " + nome); r.erros.forEach(function (e) { linhas.push("      - " + e); }); }
      else if (r.avisos.length || detalhes) linhas.push("  ✔ " + nome);
      r.avisos.forEach(function (a) { nAvisos++; linhas.push("      ⚠ " + a); });
    });
    extrair(html, "vimdemo").forEach(function (m, ix) {
      demos++;
      var e = testarDemo(m);
      if (e.length) { demoFalhas++; linhas.push("  ✗ vimdemo #" + (ix + 1) + " (linha " + m.linha + ")"); e.forEach(function (x) { linhas.push("      - " + x); }); }
    });
    var ex = testarExercicios(html);
    exTotal += ex.n; exFalhas += ex.erros.length;
    ex.erros.forEach(function (e) { linhas.push("  ✗ exercício, " + e); });
    if (linhas.length) console.log(path.basename(arq) + "\n" + linhas.join("\n"));
  });
  console.log("\n" + (total - falhas) + " de " + total + " missões ok" + (falhas ? " — " + falhas + " com problema" : "") +
    (nAvisos ? " · " + nAvisos + " aviso(s)" : "") + (livres ? " · " + livres + " treino(s) livre(s) sem meta" : "") +
    (real && temVimReal() ? " · conferidas também no vim.tiny" : "") +
    "\n" + (demos - demoFalhas) + " de " + demos + " demonstrações ok" +
    "\n" + (exTotal - exFalhas) + " de " + exTotal + " exercícios ok" + (exFalhas ? " — " + exFalhas + " com problema" : ""));
  return falhas || demoFalhas || exFalhas ? 1 : 0;
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { extrair: extrair, testarMissao: testarMissao };
