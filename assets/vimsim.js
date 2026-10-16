/* =========================================================
   Guia Vim — Vim simulado
   Um editor modal que imita o Vim 9 em pt-BR (configuração
   padrão, como "vim -u defaults.vim"). Roda no navegador e
   também no Node (para testes).
   ========================================================= */
(function (global) {
  "use strict";

  var MSG = {
    insert: "-- INSERÇÃO --",
    replace: "-- SUBSTITUIÇÃO --",
    visual: "-- VISUAL --",
    vline: "-- VISUAL/LINHA --",
    vblock: "-- VISUAL/BLOCO --",
    rec: "gravando @",
    E37: "E37: Alterações não foram gravadas (adicione ! para forçar)",
    E492: "E492: Não é um comando do editor",
    E486: "E486: Padrão não encontrado: ",
    E35: "E35: Nenhuma expressão regular anterior",
    E20: "E20: Marca não definida",
    E32: "E32: Nenhum nome de arquivo",
    E353: "E353: Não há nada no registrador ",
    E348: "E348: Nenhuma cadeia de caracteres sob o cursor",
    E518: "E518: Opção desconhecida: ",
    E16: "E16: Intervalo inválido",
    E14: "E14: Endereço inválido",
    E471: "E471: Argumento requerido",
    E488: "E488: Caracteres em excesso no final da linha: ",
    E384: "E384: busca atingiu o TOPO sem encontrar: ",
    E385: "E385: busca atingiu o FIM sem encontrar: ",
    wrapBot: "busca atingiu FIM; continuando do TOPO",
    wrapTop: "busca atingiu TOPO; continuando do FIM",
    oldest: "Já está na alteração mais antiga",
    newest: "Já está na alteração mais nova",
    semLinhas: "--Sem linhas no buffer--",
    sair: "Digite  :qa!  e aperte <Enter> para abandonar as alterações e sair do Vim"
  };

  function cloneLines(a) { return a.slice(); }
  function rep(s, n) { var r = ""; for (var i = 0; i < n; i++) r += s; return r; }
  function isWordCh(ch) { return /[\wÀ-ÖØ-öø-ÿ]/.test(ch); }
  function isBlank(ch) { return ch === " " || ch === "\t"; }
  function cls(ch, big) { // 0 espaço, 1 palavra, 2 pontuação
    if (ch === undefined || isBlank(ch)) return 0;
    if (big) return 1;
    return isWordCh(ch) ? 1 : 2;
  }
  function utf8len(s) { var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); n += c < 128 ? 1 : c < 2048 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; } return n; }
  function firstNonBlank(line) { var m = /^[ \t]*/.exec(line)[0].length; return m >= line.length ? Math.max(0, line.length - 1) : m; }

  /* Converte uma expressão regular do Vim (magic) para JavaScript */
  function vimRegex(pat, ic, scs) {
    var veryMagic = false, caso = null, out = "", i = 0;
    if (/\\c/.test(pat)) { caso = "i"; pat = pat.replace(/\\c/g, ""); }
    if (/\\C/.test(pat)) { caso = ""; pat = pat.replace(/\\C/g, ""); }
    if (pat.indexOf("\\v") === 0) { veryMagic = true; pat = pat.slice(2); }
    while (i < pat.length) {
      var ch = pat[i];
      if (ch === "\\") {
        var n = pat[i + 1]; i += 2;
        if (n === undefined) { out += "\\\\"; continue; }
        if (veryMagic) { out += "\\" + n; continue; }
        if (n === "(" || n === ")" || n === "|" || n === "+" || n === "?" ) { out += n; continue; }
        if (n === "=") { out += "?"; continue; }
        if (n === "{") { var f = pat.indexOf("}", i); var q = pat.slice(i, f).replace(/^-/, ""); out += "{" + (q || "0,") + "}" + (pat[i] === "-" ? "?" : ""); i = f + 1; continue; }
        if (n === "<") { out += "(?<![\\wÀ-ÿ])(?=[\\wÀ-ÿ])"; continue; }
        if (n === ">") { out += "(?<=[\\wÀ-ÿ])(?![\\wÀ-ÿ])"; continue; }
        var classes = { a: "[A-Za-z]", A: "[^A-Za-z]", l: "[a-z]", L: "[^a-z]", u: "[A-Z]", U: "[^A-Z]", x: "[0-9A-Fa-f]", X: "[^0-9A-Fa-f]", o: "[0-7]", O: "[^0-7]", h: "[A-Za-z_]", H: "[^A-Za-z_]", k: "[\\wÀ-ÿ]", K: "[A-Za-zÀ-ÿ_]", i: "[\\wÀ-ÿ]", f: "[\\w./\\-~]" };
        if (classes[n] && !veryMagic) { out += classes[n]; continue; }
        if (n === "s") { out += "[ \\t]"; continue; }
        if (n === "S") { out += "[^ \\t]"; continue; }
        if (n === "n") { out += "\\n"; continue; }
        if (n === "t") { out += "\\t"; continue; }
        out += "\\" + n; continue;
      }
      if (veryMagic) {
        if (ch === "<") { out += "(?<![\\wÀ-ÿ])(?=[\\wÀ-ÿ])"; i++; continue; }
        if (ch === ">") { out += "(?<=[\\wÀ-ÿ])(?![\\wÀ-ÿ])"; i++; continue; }
        if (ch === "=") { out += "?"; i++; continue; }
        out += ch; i++; continue;
      }
      if ("(){}|+?".indexOf(ch) !== -1) { out += "\\" + ch; i++; continue; }
      if (ch === "~") { out += "\\~"; i++; continue; }
      out += ch; i++;
    }
    var flags = caso !== null ? caso : (ic && !(scs && /[A-ZÀ-Ý]/.test(pat)) ? "i" : "");
    return new RegExp(out, "g" + flags);
  }
  function vimReplacement(rep_, re) {
    // \0 ou & = casamento inteiro; \1..\9; \n = quebra; \u \U \l \L \e simplificados
    return function () {
      var args = arguments, m = args[0], out = "", modo = null, umaVez = null;
      function aplica(s) {
        if (umaVez) { s = (umaVez === "u" ? s.charAt(0).toUpperCase() : s.charAt(0).toLowerCase()) + s.slice(1); umaVez = null; }
        if (modo === "U") s = s.toUpperCase(); else if (modo === "L") s = s.toLowerCase();
        return s;
      }
      for (var i = 0; i < rep_.length; i++) {
        var ch = rep_[i];
        if (ch === "\\") {
          var n = rep_[++i];
          if (/[0-9]/.test(n)) out += aplica(n === "0" ? m : (args[+n] || ""));
          else if (n === "n" || n === "r") out += "\n";
          else if (n === "t") out += "\t";
          else if (n === "u" || n === "l") umaVez = n;
          else if (n === "U" || n === "L") modo = n;
          else if (n === "e" || n === "E") modo = null;
          else if (n === "&") out += aplica("&");
          else out += aplica(n);
        } else if (ch === "&") out += aplica(m);
        else if (ch === "~") out += "";
        else out += aplica(ch);
      }
      return out;
    };
  }

  /* =========================================================
     Editor
     ========================================================= */
  function Vim(texto, opts) {
    opts = opts || {};
    this.arquivo = opts.arquivo || "";
    this.novo = !!opts.novo;
    this.lines = (texto == null ? "" : texto).replace(/\n$/, "").split("\n");
    this.salvo = this.lines.join("\n");
    this.r = 0; this.c = 0; this.want = 0;
    if (opts.linha) { this.r = Math.min(this.lines.length - 1, opts.linha - 1); }
    if (opts.coluna) { this.c = Math.min(Math.max(0, this.lines[this.r].length - 1), opts.coluna - 1); }
    this.want = this.c;
    this.mode = "normal";
    this.pend = [];
    this.regs = {};
    this.undo = []; this.redo = []; this.seq = 0; this.seqAtual = 0;
    this.marks = {};
    this.jumps = []; this.jumpIdx = -1;
    this.busca = null; this.buscaDir = 1;
    this.ultimoF = null;
    this.msg = ""; this.msgErro = false;
    this.cmd = null; // {tipo: ":" "/" "?", texto, op}
    this.vis = null; // {modo: 'v'|'V'|'b', r, c}
    this.ultimaVis = null;
    this.gravando = null; this.macroBuf = [];
    this.ultimaMacro = null;
    this.dot = null; this.dotRec = null;
    this.insercao = null;
    this.opts = { number: false, relativenumber: false, ignorecase: false, smartcase: false, hlsearch: false, list: false, shiftwidth: 8, tabstop: 8, expandtab: false, autoindent: false, incsearch: true, wrap: true };
    this.saiu = false;
    this.teclas = 0;
    this.ultimoSub = null;
    this.ultimoEx = null;
    this.modificado = false;
    this.tempo = function () { return Date.now(); };
  }

  Vim.prototype.texto = function () { return this.lines.join("\n"); };
  Vim.prototype.linha = function (r) { return this.lines[r == null ? this.r : r]; };
  Vim.prototype.setMsg = function (m, erro) { this.msg = m; this.msgErro = !!erro; };
  Vim.prototype.clamp = function (insert) {
    if (this.r < 0) this.r = 0;
    if (this.r > this.lines.length - 1) this.r = this.lines.length - 1;
    var len = this.lines[this.r].length, max = insert ? len : Math.max(0, len - 1);
    if (this.c > max) this.c = max;
    if (this.c < 0) this.c = 0;
  };

  /* ---------- desfazer ---------- */
  Vim.prototype.snapshot = function () {
    if (this._snapAberto) return;
    if (!this.linhaU || this.linhaU.r !== this.r) this.linhaU = { r: this.r, orig: this.lines[this.r] };
    this.undo.push({ lines: cloneLines(this.lines), r: this.r, c: this.c, t: this.tempo() });
    this.redo = [];
    this._snapAberto = true;
  };
  Vim.prototype.fechaSnap = function () {
    if (this._snapAberto) {
      this._snapAberto = false;
      var topo = this.undo[this.undo.length - 1];
      if (topo && topo.lines.join("\n") === this.lines.join("\n")) { this.undo.pop(); return; }
      this.seq++; this.seqAtual = this.seq;
      this.marks["."] = { r: this.r, c: this.c };
      this.modificado = this.texto() !== this.salvo;
    }
  };
  function difLinhas(a, b) { return a.length - b.length; }
  Vim.prototype.desfazer = function (n) {
    for (var i = 0; i < n; i++) {
      if (!this.undo.length) { this.setMsg(MSG.oldest); return; }
      var s = this.undo.pop();
      var antes = this.lines;
      this.redo.push({ lines: cloneLines(this.lines), r: this.r, c: this.c, t: this.tempo() });
      this.lines = s.lines; this.r = s.r; this.c = s.c;
      this.seqAtual--;
      var d = difLinhas(this.lines, antes);
      var oque = d === 0 ? "1 alteração" : d > 0 ? (d === 1 ? "1 linha a mais" : d + " linhas a mais") : (d === -1 ? "1 linha a menos" : (-d) + " linhas a menos");
      var seg = Math.max(0, Math.round((this.tempo() - s.t) / 1000));
      this.setMsg(oque + "; antes de #" + (this.seqAtual + 1) + "  " + (seg === 1 ? "1 second ago" : seg + " segundos atrás"));
    }
    this.clamp(); this.modificado = this.texto() !== this.salvo;
  };
  Vim.prototype.refazer = function (n) {
    for (var i = 0; i < n; i++) {
      if (!this.redo.length) { this.setMsg(MSG.newest); return; }
      var s = this.redo.pop();
      var antes = this.lines;
      this.undo.push({ lines: cloneLines(this.lines), r: this.r, c: this.c, t: this.tempo() });
      this.lines = s.lines;
      this.seqAtual++;
      var d = difLinhas(this.lines, antes);
      var oque = d === 0 ? "1 alteração" : d > 0 ? (d === 1 ? "1 linha a mais" : d + " linhas a mais") : (d === -1 ? "1 linha a menos" : (-d) + " linhas a menos");
      this.setMsg(oque + "; após #" + this.seqAtual + "  0 segundos atrás");
    }
    this.clamp(); this.modificado = this.texto() !== this.salvo;
  };

  /* ---------- registradores ---------- */
  Vim.prototype.guardaReg = function (nome, texto, linhas, tipo) {
    // tipo: 'y' (yank) ou 'd' (delete)
    var v = { t: texto, l: !!linhas };
    if (nome === "_") return;
    if (nome && /[A-Z]/.test(nome)) {
      var k = nome.toLowerCase(), ant = this.regs[k];
      if (ant) v = (ant.l || linhas) ? { t: ant.t + "\n" + texto, l: true } : { t: ant.t + texto, l: false };
      this.regs[k] = v; this.regs['"'] = v; return;
    }
    if (nome && /[a-z0-9+*]/.test(nome)) { this.regs[nome] = v; this.regs['"'] = v; return; }
    this.regs['"'] = v;
    if (tipo === "y") this.regs["0"] = v;
    else {
      if (linhas || texto.indexOf("\n") !== -1) {
        for (var i = 9; i > 1; i--) if (this.regs[String(i - 1)]) this.regs[String(i)] = this.regs[String(i - 1)];
        this.regs["1"] = v;
      } else this.regs["-"] = v;
    }
  };

  /* ---------- movimento por palavras ---------- */
  Vim.prototype.charAt = function (r, c) { var l = this.lines[r]; return l === undefined ? undefined : l[c]; };
  Vim.prototype.wordFwd = function (r, c, big, n) {
    for (var k = 0; k < n; k++) {
      var line = this.lines[r], k0 = cls(line[c], big);
      if (line.length === 0) { if (r < this.lines.length - 1) { r++; c = 0; } } else {
        // pula a classe atual
        if (k0 !== 0) while (c < line.length && cls(line[c], big) === k0) c++;
        // pula brancos (pode atravessar linhas; linha vazia conta como palavra)
        while (true) {
          line = this.lines[r];
          while (c < line.length && isBlank(line[c])) c++;
          if (c < line.length) break;
          if (r >= this.lines.length - 1) { c = Math.max(0, line.length); break; }
          r++; c = 0;
          if (this.lines[r].length === 0) break;
        }
      }
    }
    return { r: r, c: c };
  };
  Vim.prototype.wordEnd = function (r, c, big, n) {
    for (var k = 0; k < n; k++) {
      c++;
      while (true) {
        var line = this.lines[r];
        while (c < line.length && isBlank(line[c])) c++;
        if (c < line.length) break;
        if (r >= this.lines.length - 1) { c = line.length - 1; return { r: r, c: Math.max(0, c) }; }
        r++; c = 0;
      }
      var kk = cls(this.lines[r][c], big);
      while (c + 1 < this.lines[r].length && cls(this.lines[r][c + 1], big) === kk) c++;
    }
    return { r: r, c: c };
  };
  Vim.prototype.wordBack = function (r, c, big, n) {
    for (var k = 0; k < n; k++) {
      c--;
      while (true) {
        if (c < 0) { if (r === 0) { c = 0; return { r: 0, c: 0 }; } r--; c = this.lines[r].length - 1; if (c < 0) { c = 0; break; } continue; }
        if (isBlank(this.lines[r][c])) { c--; continue; }
        break;
      }
      if (this.lines[r].length === 0) continue;
      var kk = cls(this.lines[r][c], big);
      while (c > 0 && cls(this.lines[r][c - 1], big) === kk) c--;
    }
    return { r: r, c: c };
  };
  Vim.prototype.wordEndBack = function (r, c, big, n) {
    for (var k = 0; k < n; k++) {
      var kk = cls(this.lines[r][c], big);
      while (c >= 0 && this.lines[r].length && cls(this.lines[r][c], big) === kk && kk !== 0) c--;
      while (true) {
        if (c < 0) { if (r === 0) return { r: 0, c: 0 }; r--; c = this.lines[r].length - 1; if (c < 0) { c = 0; break; } continue; }
        if (isBlank(this.lines[r][c])) { c--; continue; }
        break;
      }
    }
    return { r: r, c: Math.max(0, c) };
  };

  /* ---------- busca ---------- */
  Vim.prototype.buscar = function (pat, dir, r, c, n, silencioso) {
    var re;
    try { re = vimRegex(pat, this.opts.ignorecase, this.opts.smartcase); } catch (e) { this.setMsg(MSG.E486 + pat, true); return null; }
    var total = this.lines.length, achou = null, voltou = false;
    for (var k = 0; k < n; k++) {
      achou = null;
      for (var i = 0; i <= total; i++) {
        var rr = ((r + dir * i) % total + total) % total;
        if (i > 0 && ((dir > 0 && rr < r) || (dir < 0 && rr > r)) || (i === total)) voltou = voltou || (i > 0 && ((dir > 0 && rr <= r) || (dir < 0 && rr >= r)));
        var line = this.lines[rr], ms = [], m;
        re.lastIndex = 0;
        while ((m = re.exec(line))) { ms.push(m.index); if (!m[0].length) re.lastIndex++; }
        if (!ms.length) continue;
        var cand = null;
        if (dir > 0) {
          for (var j = 0; j < ms.length; j++) if (i > 0 || ms[j] > c) { if (i === total && ms[j] > c) break; cand = ms[j]; break; }
          if (i === total) { cand = null; for (var j2 = 0; j2 < ms.length; j2++) if (ms[j2] <= c) { cand = ms[j2]; break; } }
        } else {
          for (var j3 = ms.length - 1; j3 >= 0; j3--) if (i > 0 || ms[j3] < c) { if (i === total && ms[j3] < c) break; cand = ms[j3]; break; }
          if (i === total) { cand = null; for (var j4 = ms.length - 1; j4 >= 0; j4--) if (ms[j4] >= c) { cand = ms[j4]; break; } }
        }
        if (cand !== null) { achou = { r: rr, c: cand }; if ((dir > 0 && (rr < r || (rr === r && cand <= c))) || (dir < 0 && (rr > r || (rr === r && cand >= c)))) voltou = true; break; }
      }
      if (!achou) { if (!silencioso) this.setMsg(MSG.E486 + pat, true); return null; }
      r = achou.r; c = achou.c;
    }
    if (!silencioso) {
      if (voltou) this.setMsg(dir > 0 ? MSG.wrapBot : MSG.wrapTop, true);
      else this.setMsg((dir > 0 ? "/" : "?") + pat);
    }
    return achou;
  };

  /* ---------- pares ( ) [ ] { } ---------- */
  Vim.prototype.parCorrespondente = function (r, c) {
    var line = this.lines[r], pares = { "(": ")", "[": "]", "{": "}", ")": "(", "]": "[", "}": "{" };
    var k = c; while (k < line.length && !pares[line[k]]) k++;
    if (k >= line.length) return null;
    var abre = line[k], fecha = pares[abre], dir = "([{".indexOf(abre) !== -1 ? 1 : -1, prof = 0, rr = r, cc = k;
    while (true) {
      var ch = this.lines[rr][cc];
      if (ch === abre) prof++; else if (ch === fecha) { prof--; if (prof === 0) return { r: rr, c: cc }; }
      cc += dir;
      while (cc < 0 || cc >= this.lines[rr].length) {
        rr += dir; if (rr < 0 || rr >= this.lines.length) return null;
        cc = dir > 0 ? 0 : this.lines[rr].length - 1;
        if (this.lines[rr].length) break;
      }
    }
  };

  /* ---------- movimentos ----------
     Retorna {r, c, tipo: 'excl'|'incl'|'linha', pulo} ou null */
  Vim.prototype.movimento = function (k, n, comOp) {
    var r = this.r, c = this.c, L = this.lines, cnt = n || 1, p;
    switch (k[0]) {
      case "h": case "ArrowLeft": case "Backspace": if (c === 0) return null; return { r: r, c: Math.max(0, c - cnt), tipo: "excl" };
      case "l": case "ArrowRight": case " ": { var len = L[r].length; if (c >= len - 1 && !(comOp && c < len)) return null; return { r: r, c: Math.min(comOp ? len : len - 1, c + cnt), tipo: "excl" }; }
      case "j": case "ArrowDown": case "<C-n>": if (r + cnt > L.length - 1 && !(r < L.length - 1)) return null; return { r: Math.min(L.length - 1, r + cnt), c: this.want, tipo: "linha", vert: true };
      case "k": case "ArrowUp": case "<C-p>": if (r === 0) return null; return { r: Math.max(0, r - cnt), c: this.want, tipo: "linha", vert: true };
      case "+": case "Enter": if (r + cnt > L.length - 1) return null; return { r: r + cnt, c: firstNonBlank(L[r + cnt]), tipo: "linha" };
      case "-": if (r - cnt < 0) return null; return { r: r - cnt, c: firstNonBlank(L[r - cnt]), tipo: "linha" };
      case "_": { var rr_ = Math.min(L.length - 1, r + cnt - 1); return { r: rr_, c: firstNonBlank(L[rr_]), tipo: "linha" }; }
      case "0": case "Home": return { r: r, c: 0, tipo: "excl" };
      case "^": return { r: r, c: firstNonBlank(L[r]), tipo: "excl" };
      case "$": case "End": { var rr = Math.min(L.length - 1, r + cnt - 1); return { r: rr, c: Math.max(0, L[rr].length - 1), tipo: "incl", fim: true }; }
      case "|": return { r: r, c: Math.min(Math.max(0, L[r].length - 1), cnt - 1), tipo: "excl" };
      case "w": case "W": {
        p = this.wordFwd(r, c, k[0] === "W", cnt);
        if (comOp && p.r > r) {
          // regra especial: a última palavra no fim da linha não leva à próxima linha
          var temNaoBranco = /\S/.test(L[r].slice(c));
          if (temNaoBranco) {
            var ultimaR = p.r; if (p.c === 0 && ultimaR > r) { ultimaR--; while (ultimaR > r && !/\S/.test(L[ultimaR])) ultimaR--; return { r: ultimaR, c: L[ultimaR].length, tipo: "excl" }; }
          }
        }
        if (!comOp && p.r === r && p.c >= L[r].length) { return { r: r, c: Math.max(0, L[r].length - 1), tipo: "excl" }; }
        return { r: p.r, c: p.c, tipo: "excl" };
      }
      case "b": case "B": if (r === 0 && c === 0) return null; p = this.wordBack(r, c, k[0] === "B", cnt); return { r: p.r, c: p.c, tipo: "excl" };
      case "e": case "E": p = this.wordEnd(r, c, k[0] === "E", cnt); return { r: p.r, c: p.c, tipo: "incl" };
      case "g":
        if (k[1] === "g") { var alvo = n ? Math.min(L.length, n) - 1 : 0; return { r: alvo, c: firstNonBlank(L[alvo]), tipo: "linha", pulo: true }; }
        if (k[1] === "e" || k[1] === "E") { p = this.wordEndBack(r, c, k[1] === "E", cnt); return { r: p.r, c: p.c, tipo: "incl" }; }
        if (k[1] === "_") { var r2 = Math.min(L.length - 1, r + cnt - 1); var m = /\s*$/.exec(L[r2]); return { r: r2, c: Math.max(0, L[r2].length - m[0].length - 1), tipo: "incl" }; }
        if (k[1] === "j") return this.movimento(["j"], n, comOp);
        if (k[1] === "k") return this.movimento(["k"], n, comOp);
        if (k[1] === "0") return { r: r, c: 0, tipo: "excl" };
        if (k[1] === "$") return this.movimento(["$"], n, comOp);
        if (k[1] === "m") return { r: r, c: Math.floor(L[r].length / 2), tipo: "excl" };
        return null;
      case "G": { var a2 = n ? Math.min(L.length, n) - 1 : L.length - 1; return { r: a2, c: firstNonBlank(L[a2]), tipo: "linha", pulo: true }; }
      case "H": { var h = Math.min(L.length - 1, cnt - 1); return { r: h, c: firstNonBlank(L[h]), tipo: "linha", pulo: true }; }
      case "L": { var lr = Math.max(0, L.length - cnt); return { r: lr, c: firstNonBlank(L[lr]), tipo: "linha", pulo: true }; }
      case "M": { var mr = Math.floor((L.length - 1) / 2); return { r: mr, c: firstNonBlank(L[mr]), tipo: "linha", pulo: true }; }
      case "f": case "F": case "t": case "T": {
        var alvoCh = k[1]; this.ultimoF = { tipo: k[0], ch: alvoCh };
        return this.achaChar(k[0], alvoCh, cnt, false);
      }
      case ";": case ",": {
        if (!this.ultimoF) return null;
        var t = this.ultimoF.tipo;
        if (k[0] === ",") t = { f: "F", F: "f", t: "T", T: "t" }[t];
        return this.achaChar(t, this.ultimoF.ch, cnt, true);
      }
      case "%": {
        if (n) { var lin = Math.floor((n * L.length + 99) / 100) - 1; return { r: lin, c: firstNonBlank(L[lin]), tipo: "linha", pulo: true }; }
        p = this.parCorrespondente(r, c); if (!p) return null; return { r: p.r, c: p.c, tipo: "incl", pulo: true };
      }
      case "}": case "{": {
        var dir = k[0] === "}" ? 1 : -1, cur = r;
        for (var q = 0; q < cnt; q++) {
          var pulou = false, primeiro = true;
          while (true) {
            if (L[cur].length) pulou = true;
            if (!primeiro && pulou && !L[cur].length) break;
            if (cur + dir < 0 || cur + dir > L.length - 1) { if (q === cnt - 1 || true) break; }
            cur += dir; primeiro = false;
          }
        }
        if (L[cur].length && (cur === 0 || cur === L.length - 1)) {
          // chegou ao começo/fim do arquivo sem achar linha vazia
          if (dir < 0) return { r: 0, c: 0, tipo: "excl", pulo: true };
          return { r: cur, c: Math.max(0, L[cur].length - (comOp ? 0 : 1)), tipo: comOp ? "excl" : "excl", pulo: true, fimArq: true };
        }
        return { r: cur, c: 0, tipo: "excl", pulo: true };
      }
      case "n": case "N": {
        if (!this.busca) { this.setMsg(MSG.E35, true); return null; }
        var d2 = (k[0] === "n" ? 1 : -1) * this.buscaDir;
        p = this.buscar(this.busca, d2, r, c, cnt);
        if (!p) return null; return { r: p.r, c: p.c, tipo: "excl", pulo: true };
      }
      case "*": case "#": {
        var w = this.palavraSob(r, c); if (!w) { this.setMsg(MSG.E348, true); return null; }
        this.busca = "\\<" + w.palavra.replace(/[\\\/.*$^~[\]]/g, "\\$&") + "\\>"; this.buscaDir = k[0] === "*" ? 1 : -1;
        this.regs["/"] = { t: this.busca, l: false };
        p = this.buscar(this.busca, this.buscaDir, r, k[0] === "*" ? w.ini : w.ini, cnt);
        if (!p) return null; if (!this.msgErro) this.setMsg((k[0] === "*" ? "/" : "?") + this.busca); return { r: p.r, c: p.c, tipo: "excl", pulo: true };
      }
      case "`": case "'": {
        var mk = k[1], pos = mk === "`" || mk === "'" ? this.marks["'"] : this.marks[mk];
        if (!pos) { this.setMsg(MSG.E20, true); return null; }
        if (pos.r >= L.length) return null;
        if (k[0] === "'") return { r: pos.r, c: firstNonBlank(L[pos.r]), tipo: "linha", pulo: true };
        return { r: pos.r, c: Math.min(pos.c, Math.max(0, L[pos.r].length - 1)), tipo: "excl", pulo: true };
      }
    }
    return null;
  };
  Vim.prototype.achaChar = function (tipo, ch, cnt, repetindo) {
    var line = this.lines[this.r], c = this.c;
    if (tipo === "f" || tipo === "t") {
      var ini = c + 1;
      if (tipo === "t" && repetindo && line[ini] === ch) ini++;
      for (var i = ini, k = 0; i < line.length; i++) if (line[i] === ch && ++k === cnt) return { r: this.r, c: tipo === "f" ? i : i - 1, tipo: "incl" };
    } else {
      var ini2 = c - 1;
      if (tipo === "T" && repetindo && line[ini2] === ch) ini2--;
      for (var j = ini2, k2 = 0; j >= 0; j--) if (line[j] === ch && ++k2 === cnt) return { r: this.r, c: tipo === "F" ? j : j + 1, tipo: "excl" };
    }
    return null;
  };
  Vim.prototype.palavraSob = function (r, c) {
    var line = this.lines[r], i = c;
    while (i < line.length && !isWordCh(line[i])) i++;
    if (i >= line.length) return null;
    var ini = i, fim = i;
    while (ini > 0 && isWordCh(line[ini - 1])) ini--;
    while (fim < line.length && isWordCh(line[fim])) fim++;
    return { palavra: line.slice(ini, fim), ini: ini, fim: fim };
  };

  /* ---------- objetos de texto ---------- */
  Vim.prototype.objeto = function (tipo, ch, cnt) {
    var r = this.r, c = this.c, L = this.lines, line = L[r];
    if (ch === "w" || ch === "W") {
      var big = ch === "W";
      if (!line.length) return { ini: { r: r, c: 0 }, fim: { r: r, c: 0 }, tipo: "excl" };
      var k = cls(line[c], big), ini = c, fim = c;
      while (ini > 0 && cls(line[ini - 1], big) === k) ini--;
      while (fim < line.length - 1 && cls(line[fim + 1], big) === k) fim++;
      for (var n = 1; n < cnt; n++) {
        if (fim >= line.length - 1) break;
        var k2 = cls(line[fim + 1], big); fim++;
        while (fim < line.length - 1 && cls(line[fim + 1], big) === k2) fim++;
      }
      if (tipo === "a") {
        if (k !== 0 && fim + 1 < line.length && isBlank(line[fim + 1])) { while (fim + 1 < line.length && isBlank(line[fim + 1])) fim++; }
        else if (k !== 0) { while (ini > 0 && isBlank(line[ini - 1])) ini--; }
        else { var k3 = cls(line[fim + 1], big); if (fim + 1 < line.length) { fim++; while (fim + 1 < line.length && cls(line[fim + 1], big) === k3) fim++; } }
      }
      return { ini: { r: r, c: ini }, fim: { r: r, c: fim }, tipo: "incl" };
    }
    if (ch === "p") {
      var a = r, b = r, vazia = !line.length;
      while (a > 0 && (!L[a - 1].length) === vazia) a--;
      while (b < L.length - 1 && (!L[b + 1].length) === vazia) b++;
      if (tipo === "a") { if (b < L.length - 1) { b++; var v2 = !L[b].length; while (b < L.length - 1 && (!L[b + 1].length) === v2) b++; } else { while (a > 0 && !L[a - 1].length) a--; } }
      return { ini: { r: a, c: 0 }, fim: { r: b, c: 0 }, tipo: "linha" };
    }
    if (ch === "s") {
      var txt = L[r], ini = 0, fim = txt.length - 1, re = /[.!?]+[)\]"']*(\s+|$)/g, m, cortes = [0];
      while ((m = re.exec(txt))) { cortes.push(m.index + m[0].length); if (!m[0].length) re.lastIndex++; }
      if (cortes[cortes.length - 1] < txt.length) cortes.push(txt.length);
      for (var q = 0; q + 1 < cortes.length; q++) if (c >= cortes[q] && c < cortes[q + 1]) { ini = cortes[q]; fim = cortes[q + 1] - 1; break; }
      if (tipo === "i") { while (fim > ini && /\s/.test(txt[fim])) fim--; }
      return { ini: { r: r, c: ini }, fim: { r: r, c: fim }, tipo: "incl" };
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      var pos = [];
      for (var i = 0; i < line.length; i++) if (line[i] === ch && line[i - 1] !== "\\") pos.push(i);
      var aIdx = -1, bIdx = -1, naAspa = pos.indexOf(c);
      if (naAspa !== -1) {
        if (naAspa % 2 === 0 && naAspa + 1 < pos.length) { aIdx = pos[naAspa]; bIdx = pos[naAspa + 1]; }
        else if (naAspa % 2 === 1) { aIdx = pos[naAspa - 1]; bIdx = pos[naAspa]; }
      } else {
        var antes = pos.filter(function (p) { return p < c; }), depois = pos.filter(function (p) { return p > c; });
        if (antes.length && depois.length) { aIdx = antes[antes.length - 1]; bIdx = depois[0]; }
        else if (!antes.length && depois.length > 1) { aIdx = depois[0]; bIdx = depois[1]; }
      }
      if (aIdx < 0) return null;
      if (tipo === "i") { if (bIdx === aIdx + 1) return { ini: { r: r, c: aIdx + 1 }, fim: { r: r, c: aIdx }, tipo: "vazio" }; return { ini: { r: r, c: aIdx + 1 }, fim: { r: r, c: bIdx - 1 }, tipo: "incl" }; }
      var e = bIdx; if (e + 1 < line.length && isBlank(line[e + 1])) { while (e + 1 < line.length && isBlank(line[e + 1])) e++; return { ini: { r: r, c: aIdx }, fim: { r: r, c: e }, tipo: "incl" }; }
      var s = aIdx; while (s > 0 && isBlank(line[s - 1])) s--;
      return { ini: { r: r, c: s }, fim: { r: r, c: bIdx }, tipo: "incl" };
    }
    var pares = { "(": "()", ")": "()", b: "()", "{": "{}", "}": "{}", B: "{}", "[": "[]", "]": "[]", "<": "<>", ">": "<>" };
    if (pares[ch]) {
      var ab = pares[ch][0], fe = pares[ch][1];
      // procura a abertura que envolve o cursor
      var rr = r, cc = c, prof = 0, achouIni = null;
      if (L[rr][cc] === ab) achouIni = { r: rr, c: cc };
      else {
        if (L[rr][cc] === fe) prof = 1;
        while (!achouIni) {
          cc--;
          while (cc < 0) { rr--; if (rr < 0) break; cc = L[rr].length - 1; }
          if (rr < 0) break;
          var x = L[rr][cc];
          if (x === fe) prof++;
          else if (x === ab) { if (prof === 0) achouIni = { r: rr, c: cc }; else prof--; }
        }
        if (!achouIni) { var fwd = L[r].indexOf(ab, c); if (fwd < 0) return null; achouIni = { r: r, c: fwd }; }
      }
      for (var nivel = 1; nivel < (cnt || 1); nivel++) {
        var rr4 = achouIni.r, cc4 = achouIni.c, prof4 = 0, prox = null;
        while (!prox) {
          cc4--;
          while (cc4 < 0) { rr4--; if (rr4 < 0) break; cc4 = L[rr4].length - 1; }
          if (rr4 < 0) break;
          var x4 = L[rr4][cc4];
          if (x4 === fe) prof4++; else if (x4 === ab) { if (prof4 === 0) prox = { r: rr4, c: cc4 }; else prof4--; }
        }
        if (!prox) break;
        achouIni = prox;
      }
      var fimP = this.parCorrespondenteDe(achouIni.r, achouIni.c, ab, fe);
      if (!fimP) return null;
      if (tipo === "a") return { ini: achouIni, fim: fimP, tipo: "incl" };
      var ini2 = { r: achouIni.r, c: achouIni.c + 1 }, fim2 = { r: fimP.r, c: fimP.c - 1 };
      if (ini2.c >= L[ini2.r].length && ini2.r < fimP.r) { ini2 = { r: ini2.r + 1, c: 0 }; }
      if (fim2.c < 0 || /^\s*$/.test(L[fimP.r].slice(0, fimP.c))) {
        if (fimP.r > ini2.r) { var lf = fimP.r - 1; if (ini2.c === 0 && ini2.r <= lf) return { ini: { r: ini2.r, c: 0 }, fim: { r: lf, c: 0 }, tipo: "linha" }; fim2 = { r: lf, c: Math.max(0, L[lf].length - 1) }; }
      }
      if (ini2.r === fim2.r && fim2.c < ini2.c) return { ini: ini2, fim: { r: ini2.r, c: ini2.c - 1 }, tipo: "vazio" };
      return { ini: ini2, fim: fim2, tipo: "incl" };
    }
    if (ch === "t") {
      var txt = L.join("\n"), off = 0;
      for (var q = 0; q < r; q++) off += L[q].length + 1;
      off += c;
      var re = /<([A-Za-z][\w-]*)[^>]*>([\s\S]*?)<\/\1>/g, m, melhor = null;
      while ((m = re.exec(txt))) {
        var s1 = m.index, e1 = m.index + m[0].length;
        if (off >= s1 && off < e1 && (!melhor || s1 > melhor.s)) melhor = { s: s1, e: e1, is: s1 + m[0].indexOf(">") + 1, ie: e1 - ("</" + m[1] + ">").length };
        re.lastIndex = s1 + 1;
      }
      if (!melhor) return null;
      var self = this;
      function p2rc(o) { var rr2 = 0; while (o > L[rr2].length) { o -= L[rr2].length + 1; rr2++; } return { r: rr2, c: o }; }
      if (tipo === "a") { var f1 = p2rc(melhor.e - 1); return { ini: p2rc(melhor.s), fim: f1, tipo: "incl" }; }
      if (melhor.ie === melhor.is) return { ini: p2rc(melhor.is), fim: p2rc(melhor.is), tipo: "vazio" };
      return { ini: p2rc(melhor.is), fim: p2rc(melhor.ie - 1), tipo: "incl" };
    }
    return null;
  };
  Vim.prototype.parCorrespondenteDe = function (r, c, ab, fe) {
    var prof = 0, L = this.lines;
    while (r < L.length) {
      for (; c < L[r].length; c++) { var x = L[r][c]; if (x === ab) prof++; else if (x === fe) { prof--; if (prof === 0) return { r: r, c: c }; } }
      r++; c = 0;
    }
    return null;
  };

  /* ---------- extrair / apagar faixas ---------- */
  function ordena(a, b) { return (a.r < b.r || (a.r === b.r && a.c <= b.c)) ? [a, b] : [b, a]; }
  Vim.prototype.textoFaixa = function (ini, fim, tipo) {
    var L = this.lines;
    if (tipo === "linha") return L.slice(ini.r, fim.r + 1).join("\n") + "\n";
    if (tipo === "bloco") {
      var c1 = Math.min(ini.c, fim.c), c2 = Math.max(ini.c, fim.c), out = [];
      for (var r = ini.r; r <= fim.r; r++) out.push(L[r].slice(c1, c2 + 1));
      return out.join("\n");
    }
    var fc = tipo === "incl" ? fim.c + 1 : fim.c;
    if (ini.r === fim.r) return L[ini.r].slice(ini.c, fc);
    var s = L[ini.r].slice(ini.c);
    for (var i = ini.r + 1; i < fim.r; i++) s += "\n" + L[i];
    return s + "\n" + L[fim.r].slice(0, fc);
  };
  Vim.prototype.apagaFaixa = function (ini, fim, tipo) {
    var L = this.lines;
    if (tipo === "linha") {
      L.splice(ini.r, fim.r - ini.r + 1);
      if (!L.length) L.push("");
      this.r = Math.min(ini.r, L.length - 1); this.c = firstNonBlank(L[this.r]);
      return;
    }
    if (tipo === "bloco") {
      var c1 = Math.min(ini.c, fim.c), c2 = Math.max(ini.c, fim.c);
      for (var r = ini.r; r <= fim.r; r++) L[r] = L[r].slice(0, c1) + L[r].slice(c2 + 1);
      this.r = ini.r; this.c = c1; this.clamp(); return;
    }
    var fc = tipo === "incl" ? fim.c + 1 : fim.c;
    var novo = L[ini.r].slice(0, ini.c) + L[fim.r].slice(fc);
    L.splice(ini.r, fim.r - ini.r + 1, novo);
    this.r = ini.r; this.c = ini.c;
  };

  /* ---------- operadores ---------- */
  Vim.prototype.aplicaOp = function (op, ini, fim, tipo, reg, cnt) {
    var L = this.lines, par = ordena(ini, fim); ini = par[0]; fim = par[1];
    if (tipo === "vazio") {
      if (op === "c") { this.snapshot(); this.r = ini.r; this.c = ini.c; this.entraInsercao(); }
      else { this.r = ini.r; this.c = ini.c; this.clamp(); }
      return;
    }
    // ajuste do movimento exclusivo que termina na coluna 0 (:help exclusive)
    if (tipo === "excl" && fim.c === 0 && fim.r > ini.r && !this._visOp) {
      var nb = /^\s*$/.test(L[ini.r].slice(0, ini.c));
      fim = { r: fim.r - 1, c: L[fim.r - 1].length };
      if (nb && ini.c <= firstNonBlank(L[ini.r]) ) { tipo = "linha"; }
      else tipo = "excl";
    }
    var linhas = tipo === "linha", texto = this.textoFaixa(ini, fim, tipo), nLinhas = fim.r - ini.r + 1;
    if (op === "y") {
      this.guardaReg(reg, linhas ? texto.replace(/\n$/, "") : texto, linhas, "y");
      if (tipo === "bloco") this.regs[reg && /[a-z]/.test(reg) ? reg : '"'].bloco = true;
      this.marks["["] = ini; this.marks["]"] = fim;
      if (linhas && nLinhas > 2) this.setMsg((tipo === "bloco" ? "bloco de " : "") + nLinhas + " linhas copiadas");
      else if (tipo === "bloco" && nLinhas > 2) this.setMsg("bloco de " + nLinhas + " linhas copiado");
      this.r = ini.r; this.c = linhas ? (this.vis ? 0 : this.c) : ini.c;
      if (linhas && !this.vis) { this.r = Math.min(this.r, ini.r); if (ini.r !== par[0].r) this.c = this.c; }
      if (linhas) { this.r = ini.r; if (this.vis) this.c = 0; }
      this.clamp();
      return;
    }
    if (op === "d" || op === "c") {
      this.snapshot();
      this.guardaReg(reg, linhas ? texto.replace(/\n$/, "") : texto, linhas, "d");
      if (tipo === "bloco" && reg !== "_") this.regs['"'].bloco = true;
      if (op === "c" && linhas) {
        var ind = this.opts.autoindent ? /^[ \t]*/.exec(L[ini.r])[0] : "";
        L.splice(ini.r, fim.r - ini.r + 1, ind);
        this.r = ini.r; this.c = ind.length;
        this.entraInsercao();
        return;
      }
      if (op === "c" && tipo === "bloco") {
        var c1 = Math.min(ini.c, fim.c);
        this.apagaFaixa(ini, fim, tipo);
        this.r = ini.r; this.c = c1;
        this.entraInsercao({ bloco: { r1: ini.r, r2: fim.r, c: c1 } });
        return;
      }
      this.apagaFaixa(ini, fim, tipo);
      if (linhas && nLinhas > 2) this.setMsg(nLinhas + " linhas a menos");
      if (op === "c") { this.entraInsercao(); return; }
      this.clamp();
      return;
    }
    if (op === ">" || op === "<") {
      this.snapshot();
      var sw = this.opts.shiftwidth, vezes = cnt || 1;
      for (var r = ini.r; r <= fim.r; r++) {
        if (!L[r].length && op === ">") continue;
        var m = /^[ \t]*/.exec(L[r])[0], larg = 0;
        for (var i = 0; i < m.length; i++) larg = m[i] === "\t" ? (Math.floor(larg / this.opts.tabstop) + 1) * this.opts.tabstop : larg + 1;
        var nova = op === ">" ? larg + sw * vezes : Math.max(0, (Math.ceil(larg / sw) - vezes) * sw);
        if (op === "<" && larg % sw) nova = Math.max(0, (Math.floor(larg / sw) - (vezes - 1)) * sw);
        var s = this.opts.expandtab ? rep(" ", nova) : rep("\t", Math.floor(nova / this.opts.tabstop)) + rep(" ", nova % this.opts.tabstop);
        L[r] = s + L[r].slice(m.length);
      }
      var n2 = fim.r - ini.r + 1;
      if (n2 > 2) this.setMsg(n2 + " linhas " + (op === ">" ? ">" : "<") + "adas " + (cnt > 1 ? cnt + " vezes" : "1 vez"));
      this.r = ini.r; this.c = firstNonBlank(L[ini.r]);
      return;
    }
    if (op === "~" || op === "g~" || op === "gu" || op === "gU") {
      this.snapshot();
      var f = op === "gu" ? function (s) { return s.toLowerCase(); } : op === "gU" ? function (s) { return s.toUpperCase(); } : function (s) { return s.split("").map(function (x) { return x === x.toUpperCase() ? x.toLowerCase() : x.toUpperCase(); }).join(""); };
      if (tipo === "bloco") {
        var b1 = Math.min(ini.c, fim.c), b2 = Math.max(ini.c, fim.c);
        for (var rb = ini.r; rb <= fim.r; rb++) L[rb] = L[rb].slice(0, b1) + f(L[rb].slice(b1, b2 + 1)) + L[rb].slice(b2 + 1);
        this.r = ini.r; this.c = b1; return;
      }
      for (var rr = ini.r; rr <= fim.r; rr++) {
        var a = linhas || rr > ini.r ? 0 : ini.c, b = linhas || rr < fim.r ? L[rr].length : (tipo === "incl" ? fim.c + 1 : fim.c);
        L[rr] = L[rr].slice(0, a) + f(L[rr].slice(a, b)) + L[rr].slice(b);
      }
      this.r = ini.r; this.c = linhas ? (this.vis ? 0 : this.c) : ini.c; this.clamp();
      return;
    }
    if (op === "J" || op === "gJ") { this.junta(ini.r, Math.max(2, fim.r - ini.r + 1), op === "gJ"); return; }
    if (op === "!" || op === "=" || op === "gq" || op === "zf") { this.setMsg("(simulador) o operador " + op + " não existe neste simulador", true); return; }
  };

  Vim.prototype.junta = function (r, n, cru) {
    var L = this.lines;
    if (r >= L.length - 1) return false;
    this.snapshot();
    var col = 0;
    for (var i = 1; i < n && r + 1 < L.length; i++) {
      var a = L[r], b = L[r + 1];
      if (cru) { col = a.length; L[r] = a + b; }
      else {
        var bb = b.replace(/^[ \t]+/, ""), aa = a.replace(/[ \t]+$/, "");
        var sep = (!aa.length || !bb.length || bb[0] === ")") ? "" : (/[.!?]$/.test(aa) ? " " : " ");
        if (/ $/.test(a) && aa === a.slice(0, -1)) sep = " ";
        col = aa.length + (sep && bb.length ? 0 : 0);
        L[r] = aa + sep + bb;
        col = aa.length + (sep ? 0 : 0) - (sep ? 0 : 1);
        if (sep) col = aa.length; else col = Math.max(0, aa.length - 1 + (bb.length && !aa.length ? 1 : 0));
        if (!aa.length) col = 0;
      }
      L.splice(r + 1, 1);
    }
    this.r = r; this.c = cru ? col - 0 : col; this.clamp();
    return true;
  };

  /* ---------- colar ---------- */
  Vim.prototype.colar = function (antes, reg, cnt, cursorFim) {
    var v = this.regs[reg || '"'];
    if (reg === ".") v = { t: this.regs["."] ? this.regs["."].t : "", l: false };
    if (!v || v.t === undefined) { this.setMsg(MSG.E353 + (reg || '"'), true); return; }
    this.snapshot();
    var L = this.lines, n = cnt || 1, i;
    if (v.bloco) {
      var partes = v.t.split("\n"), col = antes ? this.c : Math.min(this.c + 1, L[this.r].length), larg = Math.max.apply(null, partes.map(function (p) { return p.length; }));
      for (i = 0; i < partes.length; i++) {
        var rr = this.r + i; if (rr >= L.length) L.push("");
        var lin = L[rr]; while (lin.length < col) lin += " ";
        var pedaco = rep(partes[i] + rep(" ", larg - partes[i].length), n);
        if (col >= lin.length) pedaco = pedaco.replace(/\s+$/, "");
        L[rr] = lin.slice(0, col) + pedaco + lin.slice(col);
      }
      this.c = col; return;
    }
    if (v.l) {
      var novas = []; for (i = 0; i < n; i++) novas = novas.concat(v.t.split("\n"));
      var pos = antes ? this.r : this.r + 1;
      Array.prototype.splice.apply(L, [pos, 0].concat(novas));
      if (cursorFim) { this.r = pos + novas.length; if (this.r >= L.length) { this.r = L.length - 1; } this.c = 0; }
      else { this.r = pos; this.c = firstNonBlank(L[pos]); }
      if (novas.length > 2) this.setMsg(novas.length + " linhas a mais");
      return;
    }
    var t = rep(v.t, n), line = L[this.r], at = antes || !line.length ? this.c : this.c + 1;
    var novo = line.slice(0, at) + t + line.slice(at), partes2 = novo.split("\n");
    Array.prototype.splice.apply(L, [this.r, 1].concat(partes2));
    if (partes2.length > 1) {
      if (cursorFim) { this.r += partes2.length - 1; this.c = t.length - t.lastIndexOf("\n") - 1; }
      else { this.c = at; }
    } else { this.c = cursorFim ? at + t.length : at + t.length - 1; }
    this.clamp(cursorFim);
  };

  /* ---------- inserção ---------- */
  Vim.prototype.entraInsercao = function (extra) {
    this.snapshot();
    this.mode = "insert";
    this.insercao = { texto: "", bloco: extra && extra.bloco, repetir: extra && extra.repetir, r: this.r, c: this.c, abriu: extra && extra.abriu };
    this.setMsg(MSG.insert);
  };
  Vim.prototype.saiInsercao = function () {
    var ins = this.insercao;
    if (ins && ins.repetir > 1 && ins.texto) {
      for (var i = 1; i < ins.repetir; i++) {
        if (ins.abriu) { var nl = ins.abriu === "o" ? this.r + 1 : this.r; this.lines.splice(nl, 0, ""); this.r = nl; this.c = 0; this.digitar(ins.texto, true); }
        else this.digitar(ins.texto, true);
      }
    }
    if (ins && ins.bloco && ins.texto && ins.texto.indexOf("\n") === -1) {
      for (var r = ins.bloco.r1 + 1; r <= ins.bloco.r2; r++) {
        var lin = this.lines[r];
        if (ins.bloco.fimLinha) { this.lines[r] = lin + ins.texto; continue; }
        if (lin.length < ins.bloco.c) continue;
        this.lines[r] = lin.slice(0, ins.bloco.c) + ins.texto + lin.slice(ins.bloco.c);
      }
      this.r = ins.bloco.r1; this.c = (ins.bloco.esq != null ? ins.bloco.esq : ins.bloco.c) + 1;
    }
    if (ins) this.regs["."] = { t: ins.texto, l: false };
    this.mode = "normal";
    if (this.c > 0) this.c--;
    this.clamp();
    this.marks["^"] = { r: this.r, c: this.c + 1 };
    this.setMsg("");
    this.fechaSnap();
    this.insercao = null;
  };
  Vim.prototype.digitar = function (s, silencioso) {
    var L = this.lines;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === "\n") {
        var line = L[this.r], ind = this.opts.autoindent ? /^[ \t]*/.exec(line)[0] : "";
        var depois = line.slice(this.c);
        L[this.r] = line.slice(0, this.c).replace(this.opts.autoindent && /^\s*$/.test(line.slice(0, this.c)) ? /[ \t]+$/ : /(?!)/, "");
        L.splice(this.r + 1, 0, ind + depois.replace(this.opts.autoindent ? /^[ \t]+/ : /(?!)/, ""));
        this.r++; this.c = ind.length;
      } else {
        var l2 = L[this.r];
        if (this.mode === "replace" && this.c < l2.length) { this.substituidos.push(l2[this.c]); L[this.r] = l2.slice(0, this.c) + ch + l2.slice(this.c + 1); }
        else { if (this.mode === "replace") this.substituidos.push(null); L[this.r] = l2.slice(0, this.c) + ch + l2.slice(this.c); }
        this.c++;
      }
    }
    if (!silencioso && this.insercao) this.insercao.texto += s;
  };
  Vim.prototype.teclaInsercao = function (k) {
    var L = this.lines;
    if (k === "Escape" || k === "<C-[>" || k === "<C-c>") { if (this.mode === "replace") { this.mode = "insert"; } this.saiInsercao(); return; }
    if (k === "Enter" || k === "<C-m>" || k === "<C-j>") { this.digitar("\n"); return; }
    if (k === "Tab" || k === "<C-i>") { this.digitar(this.opts.expandtab ? rep(" ", this.opts.shiftwidth > 0 ? this.opts.tabstop : 8) : "\t"); return; }
    if (k === "Backspace" || k === "<C-h>") {
      if (this.mode === "replace") {
        if (this.substituidos.length) { var orig = this.substituidos.pop(); this.c--; var ln = L[this.r]; L[this.r] = orig === null ? ln.slice(0, this.c) + ln.slice(this.c + 1) : ln.slice(0, this.c) + orig + ln.slice(this.c + 1); }
        else if (this.c > 0) this.c--;
        return;
      }
      if (this.c > 0) { L[this.r] = L[this.r].slice(0, this.c - 1) + L[this.r].slice(this.c); this.c--; if (this.insercao) this.insercao.texto = this.insercao.texto.slice(0, -1); }
      else if (this.r > 0) { var ant = L[this.r - 1]; L[this.r - 1] = ant + L[this.r]; L.splice(this.r, 1); this.r--; this.c = ant.length; if (this.insercao) this.insercao.texto = this.insercao.texto.slice(0, -1); }
      return;
    }
    if (k === "Delete") { var l3 = L[this.r]; if (this.c < l3.length) L[this.r] = l3.slice(0, this.c) + l3.slice(this.c + 1); else if (this.r < L.length - 1) { L[this.r] = l3 + L[this.r + 1]; L.splice(this.r + 1, 1); } return; }
    if (k === "<C-w>") {
      var l4 = L[this.r], i = this.c;
      while (i > 0 && isBlank(l4[i - 1])) i--;
      var kk = cls(l4[i - 1]); while (i > 0 && cls(l4[i - 1]) === kk && kk !== 0) i--;
      L[this.r] = l4.slice(0, i) + l4.slice(this.c); this.c = i; return;
    }
    if (k === "<C-u>") { var ini = this.insercao && this.insercao.r === this.r ? this.insercao.c : 0; if (this.c <= ini) ini = firstNonBlank(L[this.r]) < this.c ? firstNonBlank(L[this.r]) : 0; L[this.r] = L[this.r].slice(0, ini) + L[this.r].slice(this.c); this.c = ini; return; }
    if (k === "ArrowLeft") { if (this.c > 0) this.c--; this.quebraInsercao(); return; }
    if (k === "ArrowRight") { if (this.c < L[this.r].length) this.c++; this.quebraInsercao(); return; }
    if (k === "ArrowUp") { if (this.r > 0) { this.r--; this.clamp(true); } this.quebraInsercao(); return; }
    if (k === "ArrowDown") { if (this.r < L.length - 1) { this.r++; this.clamp(true); } this.quebraInsercao(); return; }
    if (k === "Home") { this.c = 0; return; }
    if (k === "End") { this.c = L[this.r].length; return; }
    if (this.literal) { this.literal = false; this.digitar(Vim.teclaParaChar(k)); return; }
    if (k === "<C-v>" || k === "<C-q>") { this.literal = true; return; }
    if (k === "<C-r>") { this.esperandoReg = true; return; }
    if (k === "<C-o>") { this.umComando = true; this.mode = "normal"; if (this.c > L[this.r].length - 1 && this.c > 0) { this.c = L[this.r].length; this._cOFim = true; } return; }
    if (k.length === 1) { this.digitar(k); return; }
  };
  Vim.prototype.quebraInsercao = function () {
    // setas quebram a inserção em duas para o desfazer e o ponto
    if (this.insercao) { this.insercao.texto = ""; this.insercao.r = this.r; this.insercao.c = this.c; }
  };

  /* =========================================================
     Entrada de teclas
     ========================================================= */
  Vim.prototype.teclas_ = function (seq) { var self = this; Vim.tokens(seq).forEach(function (t) { self.tecla(t); }); return this; };
  // tecla -> caractere (como o Vim guarda macros e registradores)
  Vim.teclaParaChar = function (k) {
    if (k.length === 1) return k;
    var m = { Escape: "\x1b", Enter: "\r", Backspace: "\x08", Tab: "\t", Delete: "\x7f" };
    if (m[k]) return m[k];
    var c = /^<C-(.)>$/.exec(k); if (c) return String.fromCharCode(c[1].toUpperCase().charCodeAt(0) - 64);
    return "";
  };
  Vim.tokens = function (seq) {
    // "dw<Esc>:wq<CR>" -> ["d","w","Escape",":", "w","q","Enter"]
    var out = [], i = 0, map = { esc: "Escape", cr: "Enter", enter: "Enter", return: "Enter", bs: "Backspace", tab: "Tab", del: "Delete", space: " ", lt: "<", left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", home: "Home", end: "End" };
    while (i < seq.length) {
      var code = seq.charCodeAt(i);
      if (code < 32 || code === 127) {
        out.push(code === 27 ? "Escape" : code === 13 || code === 10 ? "Enter" : code === 8 ? "Backspace" : code === 9 ? "Tab" : code === 127 ? "Delete" : "<C-" + String.fromCharCode(code + 96) + ">");
        i++; continue;
      }
      if (seq[i] === "<") {
        var f = seq.indexOf(">", i);
        var nome = f > i ? seq.slice(i + 1, f) : "";
        var m = /^[cC]-(.)$/.exec(nome);
        if (m) { out.push("<C-" + m[1].toLowerCase() + ">"); i = f + 1; continue; }
        if (map[nome.toLowerCase()]) { out.push(map[nome.toLowerCase()]); i = f + 1; continue; }
      }
      out.push(seq[i]); i++;
    }
    return out;
  };

  Vim.prototype.tecla = function (k) {
    if (this.saiu) return;
    if (!this._replay) this.teclas++;
    if (this.gravando && !(this.mode === "normal" && !this.pend.length && k === "q" && !this.cmd)) this.macroBuf.push(k);
    if (this.dotRec) this.dotRec.push(k);
    if (this.cmd) return this.teclaCmd(k);
    if (this.mode === "insert" || this.mode === "replace") {
      if (this.esperandoReg) { this.esperandoReg = false; var v = this.regs[k === '"' ? '"' : k]; if (v) this.digitar(v.l ? v.t + "\n" : v.t); return; }
      this.teclaInsercao(k);
      if (this.mode === "normal") this.fimDot();
      return;
    }
    this.teclaNormal(k);
  };
  Vim.prototype.fimDot = function () {
    if (this.dotRec && this.mode === "normal" && !this.pend.length && !this.cmd) {
      this.dot = this.dotRec.slice(); this.dotRec = null;
    }
  };

  var MOVS = "hjklwbeWBE0^$GHLMfFtT;,%{}nN*#`'|+-_ ".split("").concat(["Enter", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "<C-n>", "<C-p>"]);
  var OPS = { d: 1, c: 1, y: 1, ">": 1, "<": 1, "!": 1, "=": 1 };
  var MUDA = { x: 1, X: 1, s: 1, S: 1, r: 1, J: 1, "~": 1, p: 1, P: 1, o: 1, O: 1, i: 1, a: 1, I: 1, A: 1, C: 1, D: 1, R: 1, "<C-a>": 1, "<C-x>": 1, "&": 1 };

  Vim.prototype.teclaNormal = function (k) {
    if (k === "<C-c>" && !this.vis && !this.pend.length) { this.setMsg(this.modificado ? MSG.sair : "Type  :qa  and press <Enter> to exit Vim"); this.dotRec = null; return; }
    if (k === "Escape" || k === "<C-c>" || k === "<C-[>") {
      if (this.vis) { this.saiVisual(); }
      this.pend = []; this.dotRec = null; return;
    }
    if (k === "Tab" && this.pend.length && /^[fFtTr]$/.test(this.pend[this.pend.length - 1])) k = "\t";
    var ks = this.pend.concat([k]);
    this.pend = [];
    var res = this.interpretar(ks);
    if (res === "incompleto") { this.pend = ks; return; }
    if (res === "invalido") { this.dotRec = null; return; }
    if (this.umComando && this.mode === "normal" && !this.vis) { this.umComando = false; this.mode = "insert"; this.setMsg(MSG.insert); if (this._cOFim) { this.c = this.lines[this.r].length; this._cOFim = false; } }
    this.fimDot();
  };

  Vim.prototype.pulo = function () {
    this.marks["'"] = { r: this.r, c: this.c };
    this.jumps = this.jumps.slice(0, this.jumpIdx + 1);
    this.jumps.push({ r: this.r, c: this.c });
    this.jumpIdx = this.jumps.length - 1;
  };

  // Interpreta a sequência pendente. Retorna "ok", "incompleto" ou "invalido".
  Vim.prototype.interpretar = function (ks) {
    var i = 0, n1 = "", reg = null, n2 = "";
    function prox() { return ks[i]; }
    while (i < ks.length && /^[1-9]$/.test(ks[i]) || (n1 && ks[i] === "0")) n1 += ks[i++];
    if (prox() === '"') { if (i + 1 >= ks.length) return "incompleto"; reg = ks[i + 1]; if (!/^[a-zA-Z0-9"\-_+*.:\/]$/.test(reg)) return "invalido"; i += 2; while (i < ks.length && /^[1-9]$/.test(ks[i]) || (n2 && ks[i] === "0")) n2 += ks[i++]; }
    if (i >= ks.length) return "incompleto";
    var cont = (n1 ? +n1 : 1) * (n2 ? +n2 : 1), temCont = !!(n1 || n2);
    var k = ks[i], resto = ks.slice(i);

    // começa a gravar para o "." os comandos que alteram texto
    var iniciaDot = function (self) { if (!self.dotRec && !self.repetindoDot) self.dotRec = ks.slice(); };

    /* ----- modo visual ----- */
    if (this.vis) return this.interpretarVisual(resto, cont, temCont, reg);

    /* ----- comandos de duas teclas que começam com g/z/Z/[/] ----- */
    if (k === "q" && this.gravando && resto.length === 1) { this.regs[this.gravando] = { t: this.macroBuf.map(Vim.teclaParaChar).join(""), l: false }; this.gravando = null; this.setMsg(""); return "ok"; }
    if (k === "g" || k === "z" || k === "Z" || k === "@" || k === "q" || k === "m" || k === "r" || k === "`" || k === "'" || k === "f" || k === "F" || k === "t" || k === "T") {
      if (resto.length < 2) return "incompleto";
    }
    var k2 = resto[1];

    if (k === ":") { this.abreCmd(":", temCont ? (cont === 1 ? "." : ".,.+" + (cont - 1)) : ""); return "ok"; }
    if (k === "/" || k === "?") { this.abreCmd(k, "", { cont: cont }); return "ok"; }
    if (k === "u") { this.desfazer(cont); return "ok"; }
    if (k === "<C-r>") { this.refazer(cont); return "ok"; }
    if (k === "U") {
      var lu = this.linhaU;
      if (!lu || lu.r >= this.lines.length) return "ok";
      this.snapshot();
      var atualU = this.lines[lu.r]; this.lines[lu.r] = lu.orig; lu.orig = atualU;
      this.r = lu.r; this.c = 0; this.fechaSnap();
      return "ok";
    }
    if (k === "." ) {
      if (!this.dot) return "ok";
      var seqDot = this.dot.slice();
      if (seqDot[0] === '"' && /^[1-8]$/.test(seqDot[1]) && /[pP]/.test(seqDot.join(""))) { seqDot[1] = String(+seqDot[1] + 1); this.dot[1] = seqDot[1]; }
      if (temCont) {
        var j = 0, semCont = [];
        while (j < seqDot.length && /^[0-9]$/.test(seqDot[j])) j++;
        if (seqDot[j] === '"') { semCont.push(seqDot[j], seqDot[j + 1]); j += 2; }
        while (j < seqDot.length && /^[0-9]$/.test(seqDot[j])) j++;
        var opk = seqDot[j];
        if (opk && (OPS[opk] || opk === "g")) {
          semCont.push(opk); j++;
          if (opk === "g" && seqDot[j]) { semCont.push(seqDot[j]); j++; }
          while (j < seqDot.length && /^[0-9]$/.test(seqDot[j]) && !(seqDot[j] === "0" && !/^[1-9]$/.test(seqDot[j - 1]))) j++;
        }
        seqDot = String(cont).split("").concat(semCont, seqDot.slice(j));
      }
      this.repetindoDot = true; this._replay = (this._replay || 0) + 1;
      var self = this; seqDot.forEach(function (t) { self.tecla(t); });
      this.repetindoDot = false; this._replay--;
      this.dot = this.dot; return "ok";
    }
    if (k === "q") {
      if (this.gravando) { this.regs[this.gravando] = { t: this.macroBuf.map(Vim.teclaParaChar).join(""), l: false }; this.gravando = null; this.setMsg(""); return "ok"; }
      if (!/^[a-zA-Z0-9"]$/.test(k2)) return "invalido";
      this.gravando = k2.toLowerCase(); this.macroBuf = []; this.setMsg(MSG.rec + this.gravando); return "ok";
    }
    if (k === "@") {
      var nome = k2 === "@" ? this.ultimaMacro : k2;
      if (nome === ":") { if (this.ultimoEx) for (var q = 0; q < cont; q++) this.executaEx(this.ultimoEx); return "ok"; }
      var mac = this.regs[nome];
      if (!mac) { this.setMsg(MSG.E353 + (nome || "@"), true); return "ok"; }
      this.ultimaMacro = nome;
      var teclasMac = Vim.tokens(mac.t.replace(/</g, "<lt>"));
      if (mac.l) teclasMac.push("Enter");
      this._replay = (this._replay || 0) + 1;
      for (var q2 = 0; q2 < cont; q2++) { var antesErro = this.msgErro; this.msgErro = false; for (var t = 0; t < teclasMac.length; t++) { this.tecla(teclasMac[t]); if (this.falhou) break; } if (this.falhou) { this.falhou = false; break; } }
      this._replay--;
      return "ok";
    }
    if (k === "m") { if (!/^[a-zA-Z'`\[\]<>]$/.test(k2)) return "invalido"; this.marks[k2] = { r: this.r, c: this.c }; return "ok"; }
    if (k === "v" || k === "V" || k === "<C-v>") { this.entraVisual(k === "v" ? "v" : k === "V" ? "V" : "b"); return "ok"; }
    if (k === "Z") { if (k2 === "Z") { this.executaEx("x"); return "ok"; } if (k2 === "Q") { this.executaEx("q!"); return "ok"; } return "invalido"; }
    if (k === "z") { return "ok"; } // zz zt zb: só rolagem
    if (k === "<C-o>") { if (this.jumpIdx > 0 || (this.jumps.length && this.jumpIdx === this.jumps.length - 1)) { if (this.jumpIdx === this.jumps.length - 1) { this.jumps.push({ r: this.r, c: this.c }); } var jj = this.jumps[this.jumpIdx]; this.jumpIdx--; if (jj) { this.r = jj.r; this.c = jj.c; this.clamp(); } } return "ok"; }
    if (k === "<C-i>" || k === "Tab") { if (this.jumpIdx + 2 < this.jumps.length) { this.jumpIdx++; var j2 = this.jumps[this.jumpIdx + 1]; this.r = j2.r; this.c = j2.c; this.clamp(); } return "ok"; }
    if (k === "<C-g>") { this.setMsg('"' + (this.arquivo || "[Sem Nome]") + '"' + (this.modificado ? " [Modificado]" : "") + " " + this.lines.length + (this.lines.length === 1 ? " linha --" : " linhas --") + Math.floor((this.r + 1) * 100 / this.lines.length) + "%--"); return "ok"; }
    if (k === "<C-l>") return "ok";

    /* ----- operadores ----- */
    var op = null, ini = 0;
    if (OPS[k]) { op = k; ini = 1; }
    else if (k === "g" && (k2 === "~" || k2 === "u" || k2 === "U" || k2 === "q")) { op = "g" + k2; ini = 2; }
    if (op) {
      var r2 = resto.slice(ini), m2 = "";
      var p = 0; while (p < r2.length && (/^[1-9]$/.test(r2[p]) || (m2 && r2[p] === "0"))) m2 += r2[p++];
      if (p >= r2.length) return "incompleto";
      var mk = r2[p], total = cont * (m2 ? +m2 : 1), temN = temCont || !!m2;
      iniciaDot(this);
      // operador repetido = linha inteira (dd, cc, yy, >>, g~~, gUU, guu)
      var dobro = (op.length === 1 && mk === op) || (op.length === 2 && (mk === op[1] || (mk === "g" && r2[p + 1] === op[1])));
      if (op === "g~" && mk === "~") dobro = true;
      if (dobro) {
        if (op.length === 2 && mk === "g" && r2.length < p + 2) return "incompleto";
        if (this.r + total - 1 > this.lines.length - 1 && op !== "y" && total > 1) { if (this.r === this.lines.length - 1 && total > 1) return "invalido"; }
        var fimR = Math.min(this.lines.length - 1, this.r + total - 1);
        var colAntes = this.c;
        this.aplicaOp(op, { r: this.r, c: 0 }, { r: fimR, c: 0 }, "linha", reg, op === ">" || op === "<" ? 1 : 0);
        if (op === "y") { this.c = colAntes; this.clamp(); }
        if (op !== "c") this.fechaSnap();
        return "ok";
      }
      if (mk === "i" || mk === "a") {
        if (p + 1 >= r2.length) return "incompleto";
        var obj = this.objeto(mk, r2[p + 1], total);
        if (!obj) { this.dotRec = null; return "invalido"; }
        this.aplicaOp(op, obj.ini, obj.fim, obj.tipo, reg, 1);
        if (op !== "c") this.fechaSnap();
        return "ok";
      }
      if (mk === "/" || mk === "?") { this.abreCmd(mk, "", { op: op, reg: reg, cont: total }); return "ok"; }
      if (mk === "v" || mk === "V") { // forçar tipo (dv, dV): simplificado
        return "invalido";
      }
      var movKeys = [mk];
      if ("fFtT`'g".indexOf(mk) !== -1) { if (p + 1 >= r2.length) return "incompleto"; movKeys.push(r2[p + 1]); }
      if (MOVS.indexOf(mk) === -1 && mk !== "g") { this.dotRec = null; return "invalido"; }
      var origem = { r: this.r, c: this.c };
      var mov;
      if (op === "c" && (mk === "w" || mk === "W") && this.lines[this.r].length && !isBlank(this.lines[this.r][this.c])) {
        // cw funciona como ce
        mov = this.movimento([mk === "w" ? "e" : "E"], total, true);
        var lin = this.lines[this.r];
        if (lin[this.c + 1] === undefined || cls(lin[this.c + 1], mk === "W") !== cls(lin[this.c], mk === "W")) {
          if (total === 1) mov = { r: this.r, c: this.c, tipo: "incl" };
          else { var antes2 = { r: this.r, c: this.c }; mov = this.movimento([mk === "w" ? "e" : "E"], total - 1, true); this.r = antes2.r; this.c = antes2.c; }
        }
      } else mov = this.movimento(movKeys, temN ? total : 0, true);
      if (!mov) { this.dotRec = null; this.falhou = true; return "ok"; }
      if (mov.pulo) this.marks["'"] = origem;
      this.aplicaOp(op, origem, { r: mov.r, c: mov.c }, mov.tipo, reg, 1);
      if (op === "y" && (mov.tipo !== "linha") && ordena(origem, mov)[0] !== origem) { /* cursor vai para o início */ }
      if (op !== "c") this.fechaSnap();
      return "ok";
    }

    /* ----- comandos de edição simples ----- */
    if (MUDA[k] || (k === "g" && (k2 === "J" || k2 === "p" || k2 === "P" || k2 === "I" || k2 === "i"))) {
      var L = this.lines, line = L[this.r];
      if (k === "r" && !this.repetindoDot) iniciaDot(this); else if (k !== "r") iniciaDot(this); else iniciaDot(this);
      switch (k) {
        case "x": if (!line.length) { this.dotRec = null; return "ok"; } this.aplicaOp("d", { r: this.r, c: this.c }, { r: this.r, c: Math.min(line.length, this.c + cont) }, "excl", reg); this.fechaSnap(); return "ok";
        case "X": if (this.c === 0) { this.dotRec = null; return "ok"; } this.aplicaOp("d", { r: this.r, c: Math.max(0, this.c - cont) }, { r: this.r, c: this.c }, "excl", reg); this.fechaSnap(); return "ok";
        case "D": this.aplicaOp("d", { r: this.r, c: this.c }, { r: Math.min(L.length - 1, this.r + cont - 1), c: L[Math.min(L.length - 1, this.r + cont - 1)].length }, "excl", reg); this.fechaSnap(); this.clamp(); return "ok";
        case "C": this.snapshot(); this.aplicaOp("c", { r: this.r, c: this.c }, { r: Math.min(L.length - 1, this.r + cont - 1), c: L[Math.min(L.length - 1, this.r + cont - 1)].length }, "excl", reg); return "ok";
        case "s": this.snapshot(); if (line.length) this.aplicaOp("c", { r: this.r, c: this.c }, { r: this.r, c: Math.min(line.length, this.c + cont) }, "excl", reg); else this.entraInsercao(); return "ok";
        case "S": this.aplicaOp("c", { r: this.r, c: 0 }, { r: Math.min(L.length - 1, this.r + cont - 1), c: 0 }, "linha", reg); return "ok";
        case "r": {
          var ch = k2; if (ch === "Escape") { this.dotRec = null; return "ok"; }
          if (this.c + cont > line.length) { this.dotRec = null; return "ok"; }
          this.snapshot();
          if (ch === "Enter") { L[this.r] = line.slice(0, this.c); L.splice(this.r + 1, 0, line.slice(this.c + cont)); this.r++; this.c = 0; }
          else { L[this.r] = line.slice(0, this.c) + rep(ch, cont) + line.slice(this.c + cont); this.c += cont - 1; }
          this.fechaSnap(); return "ok";
        }
        case "J": if (!this.junta(this.r, Math.max(2, cont), false)) { this.dotRec = null; } this.fechaSnap(); return "ok";
        case "~": {
          if (!line.length) return "ok";
          this.snapshot();
          var fimT = Math.min(line.length, this.c + cont), mid = line.slice(this.c, fimT).split("").map(function (x) { return x === x.toUpperCase() ? x.toLowerCase() : x.toUpperCase(); }).join("");
          L[this.r] = line.slice(0, this.c) + mid + line.slice(fimT); this.c = Math.min(fimT, L[this.r].length - 1); this.fechaSnap(); return "ok";
        }
        case "p": case "P": this.colar(k === "P", reg, cont, false); this.fechaSnap(); return "ok";
        case "i": this.entraInsercao({ repetir: cont }); return "ok";
        case "a": if (line.length) this.c++; this.entraInsercao({ repetir: cont }); return "ok";
        case "I": this.c = firstNonBlank(line); if (!/\S/.test(line)) this.c = line.length; this.entraInsercao({ repetir: cont }); return "ok";
        case "A": this.c = line.length; this.entraInsercao({ repetir: cont }); return "ok";
        case "o": case "O": {
          this.snapshot();
          var ind = this.opts.autoindent ? /^[ \t]*/.exec(line)[0] : "";
          var pos = k === "o" ? this.r + 1 : this.r;
          L.splice(pos, 0, ind); this.r = pos; this.c = ind.length;
          this.entraInsercao({ repetir: cont, abriu: k });
          return "ok";
        }
        case "R": this.snapshot(); this.mode = "replace"; this.substituidos = []; this.insercao = { texto: "", r: this.r, c: this.c }; this.setMsg(MSG.replace); return "ok";
        case "&": this.executaEx("s"); return "ok";
        case "<C-a>": case "<C-x>": {
          var re = /-?\d+/g, mm, alvo = null;
          while ((mm = re.exec(line))) { if (mm.index + mm[0].length > this.c) { alvo = mm; break; } }
          if (!alvo) { this.dotRec = null; return "ok"; }
          var neg = alvo[0][0] === "-" && !(alvo.index > 0 && /\w/.test(line[alvo.index - 1]));
          var num = neg ? parseInt(alvo[0], 10) : parseInt(alvo[0].replace(/^-/, ""), 10), ini2 = neg ? alvo.index : alvo.index + (alvo[0][0] === "-" ? 1 : 0);
          var novo = num + (k === "<C-a>" ? cont : -cont), txtN = String(novo);
          var origTxt = neg ? alvo[0] : alvo[0].replace(/^-/, "");
          if (/^0\d/.test(origTxt)) { while (txtN.length < origTxt.length) txtN = "0" + txtN; }
          this.snapshot();
          L[this.r] = line.slice(0, ini2) + txtN + line.slice(ini2 + origTxt.length);
          this.c = ini2 + txtN.length - 1; this.fechaSnap(); return "ok";
        }
        case "g": {
          if (k2 === "J") { this.junta(this.r, Math.max(2, cont), true); this.fechaSnap(); return "ok"; }
          if (k2 === "p" || k2 === "P") { this.colar(k2 === "P", reg, cont, true); this.fechaSnap(); return "ok"; }
          if (k2 === "I") { this.c = 0; this.entraInsercao({ repetir: cont }); return "ok"; }
          if (k2 === "i") { var mi = this.marks["^"]; if (mi) { this.r = Math.min(mi.r, L.length - 1); this.c = Math.min(mi.c, L[this.r].length); } this.entraInsercao(); return "ok"; }
        }
      }
    }
    if (k === "Y") { var fy = Math.min(this.lines.length - 1, this.r + cont - 1); var cc = this.c; this.aplicaOp("y", { r: this.r, c: 0 }, { r: fy, c: 0 }, "linha", reg); this.c = cc; this.clamp(); return "ok"; }
    if (k === "g" && k2 === "v") { if (this.ultimaVis) { this.vis = { modo: this.ultimaVis.modo, r: this.ultimaVis.r, c: this.ultimaVis.c }; this.r = this.ultimaVis.r2; this.c = this.ultimaVis.c2; this.mostraModoVisual(); } return "ok"; }
    if (k === "g" && (k2 === ";" || k2 === ",")) return "ok";

    /* ----- movimentos ----- */
    var keys = [k]; if ("fFtT`'g".indexOf(k) !== -1) keys.push(k2);
    if (MOVS.indexOf(k) === -1 && k !== "g") { return "invalido"; }
    var antes = { r: this.r, c: this.c };
    var mv = this.movimento(keys, temCont ? cont : 0, false);
    if (!mv) { this.falhou = true; return "ok"; }
    if (mv.pulo) this.pulo();
    this.r = mv.r;
    if (mv.vert) { this.c = this.want; this.clamp(); if (mv.fimDeLinha) this.c = this.lines[this.r].length - 1; if (this.wantFim) this.c = Math.max(0, this.lines[this.r].length - 1); }
    else { this.c = mv.c; this.clamp(); this.want = this.c; this.wantFim = !!mv.fim; }
    return "ok";
  };

  /* ---------- modo visual ---------- */
  Vim.prototype.entraVisual = function (modo) {
    this.vis = { modo: modo, r: this.r, c: this.c };
    this.mostraModoVisual();
  };
  Vim.prototype.mostraModoVisual = function () {
    this.mode = "visual";
    this.setMsg(this.vis.modo === "v" ? MSG.visual : this.vis.modo === "V" ? MSG.vline : MSG.vblock);
  };
  Vim.prototype.saiVisual = function () {
    if (!this.vis) return;
    var a = ordena({ r: this.vis.r, c: this.vis.c }, { r: this.r, c: this.c });
    this.ultimaVis = { modo: this.vis.modo, r: this.vis.r, c: this.vis.c, r2: this.r, c2: this.c };
    this.marks["<"] = a[0]; this.marks[">"] = a[1];
    this.vis = null; this.mode = "normal"; this.setMsg(""); this.visFimLinha = false;
  };
  Vim.prototype.selecao = function () {
    var a = { r: this.vis.r, c: this.vis.c }, b = { r: this.r, c: this.c };
    if (this.vis.modo === "V") { var o = ordena(a, b); return { ini: { r: o[0].r, c: 0 }, fim: { r: o[1].r, c: 0 }, tipo: "linha" }; }
    if (this.vis.modo === "b") {
      var r1 = Math.min(a.r, b.r), r2 = Math.max(a.r, b.r), c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c);
      if (this.blocoAteFim) c2 = Math.max.apply(null, this.lines.slice(r1, r2 + 1).map(function (l) { return l.length - 1; }));
      return { ini: { r: r1, c: c1 }, fim: { r: r2, c: c2 }, tipo: "bloco" };
    }
    var o2 = ordena(a, b);
    var fim = o2[1]; if (this.lines[fim.r].length === 0) fim = { r: fim.r, c: 0 };
    if (this.visFimLinha && fim === b && fim.r < this.lines.length - 1) return { ini: o2[0], fim: { r: fim.r + 1, c: 0 }, tipo: "excl", visual: true };
    return { ini: o2[0], fim: fim, tipo: "incl", fimLinhaVazia: this.lines[o2[1].r].length === 0 };
  };
  Vim.prototype.interpretarVisual = function (ks, cont, temCont, reg) {
    var k = ks[0], k2 = ks[1], self = this;
    if (("gfFtT`'riaq@m".indexOf(k) !== -1 || k === "\"") && ks.length < 2) return "incompleto";
    if (k === "v" || k === "V" || k === "<C-v>") {
      var novo = k === "v" ? "v" : k === "V" ? "V" : "b";
      if (this.vis.modo === novo) { this.saiVisual(); return "ok"; }
      this.vis.modo = novo; this.mostraModoVisual(); return "ok";
    }
    if (k === "o" || k === "O") { var t = { r: this.vis.r, c: this.vis.c }; this.vis.r = this.r; this.vis.c = this.c; this.r = t.r; this.c = t.c; return "ok"; }
    if (k === ":") { this.saiVisual(); this.abreCmd(":", "'<,'>"); return "ok"; }
    if (k === "$" && this.vis.modo === "b") { this.blocoAteFim = true; this.c = Math.max(0, this.lines[this.r].length - 1); return "ok"; }
    if (k !== "$" && this.visFimLinha && MOVS.indexOf(k) !== -1) this.visFimLinha = false;
    var sel = this.selecao(), op = null;
    var opMap = { d: "d", x: "d", "Delete": "d", y: "y", c: "c", s: "c", ">": ">", "<": "<", "~": "~", u: "gu", U: "gU", J: "J" };
    if (k === "g" && (k2 === "u" || k2 === "U" || k2 === "~" || k2 === "J")) op = k2 === "J" ? "gJ" : "g" + k2;
    else if (opMap[k]) op = opMap[k];
    if (k === "D" || k === "X") { op = "d"; sel = { ini: { r: sel.ini.r, c: 0 }, fim: { r: sel.fim.r, c: 0 }, tipo: "linha" }; if (this.vis.modo === "b" && k === "D") { sel = this.selecao(); sel.fim.c = Math.max.apply(null, this.lines.slice(sel.ini.r, sel.fim.r + 1).map(function (l) { return l.length - 1; })); sel.tipo = "bloco"; } }
    if (k === "Y") { op = "y"; sel = { ini: { r: sel.ini.r, c: 0 }, fim: { r: sel.fim.r, c: 0 }, tipo: "linha" }; }
    if (k === "C" || k === "S" || k === "R") { op = "c"; sel = { ini: { r: sel.ini.r, c: 0 }, fim: { r: sel.fim.r, c: 0 }, tipo: "linha" }; }
    if (k === "r") {
      if (k2 === "Escape") { this.saiVisual(); return "ok"; }
      this.snapshot(); var s2 = sel;
      for (var r = s2.ini.r; r <= s2.fim.r; r++) {
        var L = this.lines, a = s2.tipo === "linha" ? 0 : s2.tipo === "bloco" ? s2.ini.c : (r === s2.ini.r ? s2.ini.c : 0);
        var b = s2.tipo === "linha" ? L[r].length - 1 : s2.tipo === "bloco" ? s2.fim.c : (r === s2.fim.r ? s2.fim.c : L[r].length - 1);
        L[r] = L[r].slice(0, a) + L[r].slice(a, b + 1).replace(/[^\n]/g, k2) + L[r].slice(b + 1);
      }
      this.saiVisual(); this.r = sel.ini.r; this.c = sel.tipo === "linha" ? 0 : sel.ini.c; this.fechaSnap(); return "ok";
    }
    if ((k === "I" || k === "A") && this.vis.modo === "b") {
      var col = k === "I" ? sel.ini.c : sel.fim.c + 1, ate = this.blocoAteFim && k === "A";
      this.saiVisual(); this.blocoAteFim = false;
      this.r = sel.ini.r; this.c = ate ? this.lines[sel.ini.r].length : Math.min(col, this.lines[this.r].length);
      if (k === "A" && !ate) { for (var rr = sel.ini.r; rr <= sel.fim.r; rr++) while (this.lines[rr].length < col) this.lines[rr] += " "; this.c = col; }
      this.entraInsercao({ bloco: { r1: sel.ini.r, r2: sel.fim.r, c: col, esq: sel.ini.c, fimLinha: ate } });
      return "ok";
    }
    if (k === "p" || k === "P") {
      var v = this.regs[reg || '"']; if (!v) { this.setMsg(MSG.E353 + (reg || '"'), true); this.saiVisual(); return "ok"; }
      var copia = { t: v.t, l: v.l, bloco: v.bloco };
      this.snapshot();
      var tx = this.textoFaixa(sel.ini, sel.fim, sel.tipo);
      this.apagaFaixa(sel.ini, sel.fim, sel.tipo);
      this.saiVisual();
      if (k === "p") this.guardaReg(null, sel.tipo === "linha" ? tx.replace(/\n$/, "") : tx, sel.tipo === "linha", "d");
      this.regs["_tmp"] = copia;
      if (sel.tipo === "linha") { if (copia.l) this.colar(true, "_tmp", cont); else { this.lines.splice(sel.ini.r, 0, ""); this.r = sel.ini.r; this.c = 0; this.colar(true, "_tmp", cont); } }
      else { if (copia.l) { var lin2 = this.lines[this.r]; this.lines.splice(this.r, 1, lin2.slice(0, this.c), lin2.slice(this.c)); this.r++; this.c = 0; this.colar(true, "_tmp", cont); } else this.colar(this.c < this.lines[this.r].length, "_tmp", cont); }
      delete this.regs["_tmp"];
      this.fechaSnap(); return "ok";
    }
    if (op) {
      if (!this.dotRec && !this.repetindoDot) this.dotRec = null; // visual + operador: "." não é suportado aqui
      var vModo = this.vis.modo;
      this.saiVisual(); this.blocoAteFim = false;
      if (op === "J" || op === "gJ") { this.junta(sel.ini.r, Math.max(2, sel.fim.r - sel.ini.r + 1), op === "gJ"); this.fechaSnap(); return "ok"; }
      this.vis = null;
      var guardaVis = true;
      this._visOp = true;
      this.aplicaOp(op, sel.ini, sel.fim, sel.tipo, reg, temCont ? cont : 1);
      this._visOp = false;
      if (op === "y") { this.r = sel.ini.r; this.c = sel.tipo === "linha" ? (vModo === "V" ? Math.min(this.c, this.c) : 0) : sel.ini.c; if (sel.tipo === "linha") this.c = this.ultimaVis ? Math.min(this.ultimaVis.r <= this.ultimaVis.r2 ? this.ultimaVis.c : this.ultimaVis.c2, this.c) : this.c; this.clamp(); }
      if (op !== "c") this.fechaSnap();
      return "ok";
    }
    if (k === "i" || k === "a") {
      var obj = this.objeto(k, k2, cont); if (!obj) return "ok";
      var o = ordena(obj.ini, obj.fim);
      if (obj.tipo === "linha") { this.vis.modo = "V"; this.mostraModoVisual(); }
      this.vis.r = o[0].r; this.vis.c = o[0].c; this.r = o[1].r; this.c = obj.tipo === "linha" ? 0 : o[1].c;
      return "ok";
    }
    if (k === "\"") { return this.interpretarVisual(ks.slice(2), cont, temCont, k2); }
    // movimentos dentro do modo visual
    var keys = [k]; if ("fFtT`'g".indexOf(k) !== -1) keys.push(k2);
    if (MOVS.indexOf(k) === -1 && k !== "g") return "invalido";
    var mv = this.movimento(keys, temCont ? cont : 0, false);
    if (!mv) return "ok";
    if (k === "$") { this.r = mv.r; this.c = Math.max(0, this.lines[mv.r].length - 1); this.visFimLinha = true; return "ok"; }
    this.r = mv.r; if (mv.vert) { this.c = this.want; this.clamp(); } else { this.c = mv.c; this.clamp(); this.want = this.c; }
    return "ok";
  };

  /* ---------- linha de comando ---------- */
  Vim.prototype.abreCmd = function (tipo, texto, extra) {
    this.cmd = { tipo: tipo, texto: texto || "", extra: extra || {}, hi: -1 };
    this.cmdHist = this.cmdHist || { ":": [], "/": [] };
  };
  Vim.prototype.teclaCmd = function (k) {
    var c = this.cmd;
    if (k === "Escape" || k === "<C-c>" || k === "<C-[>") { this.cmd = null; this.dotRec = null; this.setMsg(""); return; }
    if (k === "Backspace" || k === "<C-h>") { if (!c.texto.length) { this.cmd = null; this.setMsg(""); return; } c.texto = c.texto.slice(0, -1); return; }
    if (k === "<C-u>") { c.texto = ""; return; }
    if (k === "<C-w>") { c.texto = c.texto.replace(/\w+\s*$|\W\s*$/, ""); return; }
    if (k === "ArrowUp" || k === "ArrowDown") {
      var h = this.cmdHist[c.tipo === ":" ? ":" : "/"]; if (!h.length) return;
      if (c.hi === -1) c.hi = h.length;
      c.hi = Math.max(0, Math.min(h.length, c.hi + (k === "ArrowUp" ? -1 : 1)));
      c.texto = c.hi === h.length ? "" : h[c.hi]; return;
    }
    if (c.literal) { c.literal = false; c.texto += Vim.teclaParaChar(k); return; }
    if (k === "<C-v>" || k === "<C-q>") { c.literal = true; return; }
    if (k === "<C-r>") { c.esperaReg = true; return; }
    if (c.esperaReg) { c.esperaReg = false; if (k === "<C-w>") { var w = this.palavraSob(this.r, this.c); if (w) c.texto += w.palavra; return; } var v = this.regs[k]; if (v) c.texto += v.t.replace(/\n$/, ""); return; }
    if (k === "Tab" && c.tipo === ":") { this.completarCmd(); return; }
    if (k === "Enter" || k === "<C-m>" || k === "<C-j>") {
      this.cmd = null;
      var t = c.texto;
      if (c.tipo === ":") {
        if (t.trim()) { this.cmdHist[":"].push(t); this.regs[":"] = { t: t, l: false }; }
        this.setMsg("");
        this.executaEx(t);
        if (this.dotRec) { this.dotRec = null; }
        return;
      }
      // busca
      if (t) this.cmdHist["/"].push(t);
      var pat = t || this.busca, offset = "";
      if (!pat) { this.setMsg(MSG.E35, true); return; }
      var sep = c.tipo, mOff = new RegExp("^(.*?[^\\\\])\\" + sep + "(.*)$").exec(pat);
      if (mOff && t) { pat = mOff[1]; offset = mOff[2]; }
      this.busca = pat; this.buscaDir = c.tipo === "/" ? 1 : -1; this.regs["/"] = { t: pat, l: false };
      var origem = { r: this.r, c: this.c };
      var achou = this.buscar(pat, this.buscaDir, this.r, this.c, c.extra.cont || 1);
      if (!achou) { this.dotRec = null; return; }
      if (offset && !this.msgErro) this.setMsg(c.tipo + pat + c.tipo + offset);
      var alvo = { r: achou.r, c: achou.c }, tipo = "excl";
      if (offset === "e") { var re = vimRegex(pat, this.opts.ignorecase, this.opts.smartcase); re.lastIndex = achou.c; var mm = re.exec(this.lines[achou.r]); if (mm) alvo.c = achou.c + mm[0].length - 1; tipo = "incl"; }
      else if (/^[+-]?\d+$/.test(offset)) { alvo.r = Math.max(0, Math.min(this.lines.length - 1, achou.r + parseInt(offset, 10))); alvo.c = firstNonBlank(this.lines[alvo.r]); tipo = "linha"; }
      if (c.extra.op) {
        this.marks["'"] = origem;
        this.aplicaOp(c.extra.op, origem, alvo, tipo, c.extra.reg, 1);
        if (c.extra.op !== "c") this.fechaSnap();
        this.fimDot();
        return;
      }
      this.pulo();
      this.r = alvo.r; this.c = alvo.c; this.want = this.c;
      return;
    }
    if (k.length === 1) c.texto += k;
  };
  Vim.prototype.completarCmd = function () {
    var cmds = ["write", "quit", "wq", "xit", "substitute", "global", "set", "normal", "sort", "delete", "yank", "move", "copy", "registers", "marks", "undo", "redo", "nohlsearch", "help", "edit"];
    var t = this.cmd.texto, m = /^(\S*)$/.exec(t);
    if (m) { var op = cmds.filter(function (x) { return x.indexOf(m[1]) === 0; }); if (op.length === 1) this.cmd.texto = op[0]; return; }
    var s = /^set? (no)?(\w*)$/.exec(t);
    if (s) { var nomes = Object.keys(this.opts).filter(function (x) { return x.indexOf(s[2]) === 0; }); if (nomes.length === 1) this.cmd.texto = "set " + (s[1] || "") + nomes[0]; }
  };

  /* ---------- comandos Ex ---------- */
  var OPC = { nu: "number", number: "number", rnu: "relativenumber", relativenumber: "relativenumber", ic: "ignorecase", ignorecase: "ignorecase", scs: "smartcase", smartcase: "smartcase", hls: "hlsearch", hlsearch: "hlsearch", list: "list", sw: "shiftwidth", shiftwidth: "shiftwidth", ts: "tabstop", tabstop: "tabstop", et: "expandtab", expandtab: "expandtab", ai: "autoindent", autoindent: "autoindent", is: "incsearch", incsearch: "incsearch", wrap: "wrap", sts: "softtabstop", softtabstop: "softtabstop", tw: "textwidth", textwidth: "textwidth", ul: "undolevels", nocp: "compatible" };

  Vim.prototype.endereco = function (s, i) {
    // lê um endereço de linha a partir de s[i]; retorna {linha, i}
    var L = this.lines, n = null, m;
    var resto = s.slice(i);
    if ((m = /^\d+/.exec(resto))) { n = parseInt(m[0], 10) - 1; i += m[0].length; }
    else if (resto[0] === ".") { n = this.r; i++; }
    else if (resto[0] === "$") { n = L.length - 1; i++; }
    else if (resto[0] === "'" && resto[1]) { var mk = resto[1] === "<" ? this.marks["<"] : resto[1] === ">" ? this.marks[">"] : this.marks[resto[1]]; if (!mk) { this.setMsg(MSG.E20, true); return null; } n = mk.r; i += 2; }
    else if (resto[0] === "/" || resto[0] === "?") {
      var f = resto.indexOf(resto[0], 1); if (f < 0) f = resto.length;
      var pat = resto.slice(1, f) || this.busca;
      var a = this.buscar(pat, resto[0] === "/" ? 1 : -1, this.r, resto[0] === "/" ? this.lines[this.r].length : 0, 1, true);
      if (!a) { this.setMsg(MSG.E486 + pat, true); return null; }
      n = a.r; i += f + 1;
    }
    while ((m = /^\s*([+-])(\d*)/.exec(s.slice(i))) && m[0].length) {
      if (n === null) n = this.r;
      n += (m[1] === "+" ? 1 : -1) * (m[2] ? +m[2] : 1); i += m[0].length;
    }
    return { linha: n, i: i };
  };

  Vim.prototype.executaEx = function (linhaCmd) {
    var s = linhaCmd.replace(/^[:\s]+/, ""), i = 0, a = null, b = null, L = this.lines;
    if (!s) return;
    this.ultimoEx = s;
    if (s[0] === "%") { a = 0; b = L.length - 1; i = 1; }
    else {
      var e1 = this.endereco(s, 0); if (!e1) return;
      if (e1.linha !== null) { a = e1.linha; i = e1.i; }
      if (s[i] === "," || s[i] === ";") {
        if (s[i] === ";" && a !== null) this.r = a;
        i++;
        var e2 = this.endereco(s, i); if (!e2) return;
        b = e2.linha === null ? this.r : e2.linha; i = e2.i;
        if (a === null) a = this.r;
      }
    }
    var temFaixa = a !== null;
    if (a !== null && b === null) b = a;
    if (temFaixa && (a < 0 || b < 0 || a >= L.length || b >= L.length)) { this.setMsg(MSG.E16, true); return; }
    if (temFaixa && a > b) { var t = a; a = b; b = t; }
    var resto = s.slice(i).replace(/^\s+/, ""), m;
    var nome = (/^[a-zA-Z]+|^[&~<>!=#@*]/.exec(resto) || [""])[0], bang = false, arg = resto.slice(nome.length);
    if (arg[0] === "!") { bang = true; arg = arg.slice(1); }
    arg = arg.replace(/^\s+/, "");
    var self = this;

    if (!nome && temFaixa) { // :42
      this.pulo(); this.r = b; this.c = firstNonBlank(L[b]); return;
    }
    function e(abrev, cheio) { return nome.length >= abrev.length && cheio.indexOf(nome) === 0; }

    // :s/a/b/g  (o separador pode ser qualquer caractere)
    if (e("s", "substitute") && !e("se", "set") && !e("sor", "sort") && !e("sp", "split") || nome === "&" || nome === "~") {
      var r1 = temFaixa ? a : this.r, r2 = temFaixa ? b : this.r;
      var pat, rep_, flags = "", sep;
      if (nome === "&" || nome === "~" || (!arg && resto.length === nome.length)) {
        if (!this.ultimoSub) { this.setMsg(MSG.E35, true); return; }
        pat = this.ultimoSub.pat; rep_ = this.ultimoSub.rep; flags = (nome === "&" ? arg : "").replace(/&/, this.ultimoSub.flags);
      } else {
        var corpo = resto.slice(resto.match(/^s(u(b(s(t(i(t(u(t(e)?)?)?)?)?)?)?)?)?/)[0].length);
        sep = corpo[0];
        if (!sep || /[\w\s"|\\]/.test(sep)) {
          if (/^[&cegiInp#lr]*$/.test(corpo.trim())) { if (!this.ultimoSub) { this.setMsg(MSG.E35, true); return; } pat = this.ultimoSub.pat; rep_ = this.ultimoSub.rep; flags = corpo.trim(); }
          else { this.setMsg(MSG.E492 + ": " + s, true); return; }
        } else {
          var partes = [], atual = "", j = 1;
          for (; j < corpo.length; j++) {
            if (corpo[j] === "\\" && corpo[j + 1] === sep) { atual += sep; j++; continue; }
            if (corpo[j] === "\\") { atual += "\\" + (corpo[j + 1] || ""); j++; continue; }
            if (corpo[j] === sep && partes.length < 2) { partes.push(atual); atual = ""; continue; }
            atual += corpo[j];
          }
          partes.push(atual);
          pat = partes[0] || this.busca; rep_ = partes.length > 1 ? partes[1] : ""; flags = partes.length > 2 ? partes[2].trim() : "";
          if (rep_ === "~" && this.ultimoSub) rep_ = this.ultimoSub.rep;
        }
      }
      if (!pat) { this.setMsg(MSG.E35, true); return; }
      this.ultimoSub = { pat: pat, rep: rep_, flags: flags.replace(/[0-9\s]/g, "") };
      this.busca = pat; this.regs["/"] = { t: pat, l: false };
      if (/c/.test(flags)) { this.setMsg("(simulador) a flag c (confirmar) não é suportada aqui; rode sem ela", true); return; }
      var nCont = /(\d+)\s*$/.exec(flags); if (nCont) { r1 = r2; r2 = Math.min(L.length - 1, r1 + +nCont[1] - 1); }
      var re;
      try { re = vimRegex(pat, /I/.test(flags) ? false : (/i/.test(flags) ? true : this.opts.ignorecase), this.opts.smartcase && !/[iI]/.test(flags)); } catch (er) { this.setMsg(MSG.E486 + pat, true); return; }
      if (!/g/.test(flags)) re = new RegExp(re.source, re.flags.replace("g", ""));
      var nSub = 0, nLin = 0, ultima = -1, contar = /n/.test(flags);
      this.snapshot();
      var novo = [];
      for (var r = 0; r < L.length; r++) {
        if (r < r1 || r > r2) { novo.push(L[r]); continue; }
        var linha = L[r], achou = 0;
        re.lastIndex = 0;
        var substituido = linha.replace(re, function () { achou++; return contar ? arguments[0] : vimReplacement(rep_)(arguments[0], arguments[1], arguments[2], arguments[3], arguments[4], arguments[5], arguments[6], arguments[7], arguments[8], arguments[9]); });
        if (achou) { nSub += achou; nLin++; ultima = novo.length + substituido.split("\n").length - 1; }
        substituido.split("\n").forEach(function (x) { novo.push(x); });
      }
      if (!nSub) { this._snapAberto = false; this.undo.pop(); if (!/e/.test(flags)) { this.setMsg(MSG.E486 + pat, true); this.falhou = true; } return; }
      if (contar) { this._snapAberto = false; this.undo.pop(); this.setMsg((nSub === 1 ? "1 correspondência" : nSub + " correspondências") + (nLin === 1 ? " em 1 linha" : " em " + nLin + " linhas")); return; }
      this.lines = novo; L = novo;
      this.r = ultima; this.c = firstNonBlank(L[ultima]);
      this.fechaSnap();
      if (nSub > 2) this.setMsg(nSub + " substituições" + (nLin === 1 ? " em 1 linha" : " em " + nLin + " linhas"));
      return;
    }
    if (e("g", "global") || e("v", "vglobal")) {
      var inverso = nome[0] === "v" || bang, sepG = arg[0], fimG = arg.indexOf(sepG, 1);
      var patG = arg.slice(1, fimG < 0 ? undefined : fimG) || this.busca, cmdG = fimG < 0 ? "p" : arg.slice(fimG + 1) || "p";
      var reG; try { reG = vimRegex(patG, this.opts.ignorecase, this.opts.smartcase); } catch (er2) { return; }
      var g1 = temFaixa ? a : 0, g2 = temFaixa ? b : L.length - 1, marcadas = [];
      for (var rg = g1; rg <= g2; rg++) { reG.lastIndex = 0; if (reG.test(L[rg]) !== inverso) marcadas.push(L[rg]); }
      if (!marcadas.length) { this.setMsg("Padrão não encontrado: " + patG, true); return; }
      this.busca = patG;
      this.snapshot();
      // marca as linhas pela posição e acompanha deslocamentos a cada comando
      var marc = [];
      for (var rg2 = g1; rg2 <= g2; rg2++) { reG.lastIndex = 0; if (reG.test(L[rg2]) !== inverso) marc.push(rg2); }
      var saida = [];
      for (var mi = 0; mi < marc.length; mi++) {
        var idx = marc[mi];
        if (idx < 0 || idx >= this.lines.length) continue;
        if (/^\s*(p(rint)?|#|nu(mber)?)\s*$/.test(cmdG)) { saida.push(this.lines[idx]); continue; }
        var antesG = this.lines.slice();
        this.r = idx; this.c = 0;
        this._dentroGlobal = true;
        this.executaEx(cmdG);
        this._dentroGlobal = false;
        var depoisG = this.lines, pre = 0, suf = 0;
        while (pre < antesG.length && pre < depoisG.length && antesG[pre] === depoisG[pre]) pre++;
        if (depoisG.length < antesG.length && idx < pre) pre = idx; // apagou a própria linha: a mudança começa nela
        while (suf < antesG.length - pre && suf < depoisG.length - pre && antesG[antesG.length - 1 - suf] === depoisG[depoisG.length - 1 - suf]) suf++;
        var fimVelho = antesG.length - suf, delta = depoisG.length - antesG.length, apagouAtual = depoisG.length < antesG.length && idx >= pre && idx < fimVelho;
        for (var mj = mi + 1; mj < marc.length; mj++) {
          if (marc[mj] >= fimVelho) marc[mj] += delta;
          else if (marc[mj] >= pre && delta < 0 && marc[mj] < pre - delta) marc[mj] = -1;
        }
      }
      if (!this.lines.length) this.lines = [""];
      if (!this.lines.length) this.lines = [""];
      this.clamp();
      if (saida.length) this.setMsg(saida.join("\n"));
      this.fechaSnap();
      var dif = L.length - this.lines.length; if (dif > 2) this.setMsg(dif + " linhas a menos");
      return;
    }
    if (e("norm", "normal")) {
      var n1 = temFaixa ? a : this.r, n2 = temFaixa ? b : this.r, teclas = Vim.tokens(arg.replace(/^\s/, ""));
      if (!this._dentroGlobal) this.snapshot();
      var marcaObjs = this.lines.map(function (x) { return { t: x }; }), alvo2 = marcaObjs.slice(n1, n2 + 1);
      var salvaSnap = this._snapAberto;
      for (var q = 0; q < alvo2.length; q++) {
        var pos = -1; for (var z2 = 0; z2 < marcaObjs.length; z2++) if (marcaObjs[z2] === alvo2[q]) { pos = z2; break; }
        if (pos < 0 && temFaixa) pos = n1 + q;
        if (pos < 0 || pos >= this.lines.length) continue;
        this.r = pos; this.c = 0; this.mode = "normal"; this.pend = [];
        var antesN = this.lines.slice();
        this._snapAberto = true;
        this._replay = (this._replay || 0) + 1;
        for (var tq = 0; tq < teclas.length; tq++) this.tecla(teclas[tq]);
        this._replay--;
        if (this.mode === "insert" || this.mode === "replace") this.saiInsercao();
        if (this.vis) this.saiVisual();
        this.cmd = null; this.pend = [];
        this._snapAberto = true;
        // atualiza os objetos de linha
        var depois = this.lines;
        if (depois.length === antesN.length) { for (var w = 0; w < depois.length; w++) marcaObjs[w].t = depois[w]; }
        else { var novos = []; for (var w2 = 0; w2 < depois.length; w2++) novos.push(w2 < pos ? marcaObjs[w2] : (w2 === pos ? marcaObjs[pos] : { t: depois[w2] })); for (var w3 = 0; w3 < novos.length; w3++) novos[w3].t = depois[w3]; var deslocado = depois.length - antesN.length; for (var w4 = pos + 1; w4 < marcaObjs.length; w4++) if (w4 + deslocado < novos.length && w4 + deslocado > pos) novos[w4 + deslocado] = marcaObjs[w4], novos[w4 + deslocado].t = depois[w4 + deslocado]; marcaObjs = novos; }
      }
      if (!this._dentroGlobal) { this._snapAberto = true; this.fechaSnap(); }
      this.clamp();
      return;
    }
    if (e("d", "delete")) {
      var d1 = temFaixa ? a : this.r, d2 = temFaixa ? b : this.r, regD = /^[a-zA-Z"]/.test(arg) ? arg[0] : null;
      var nD = /(\d+)\s*$/.exec(arg); if (nD) { d1 = d2; d2 = Math.min(L.length - 1, d1 + +nD[1] - 1); }
      if (!this._dentroGlobal) this.snapshot();
      this.guardaReg(regD, L.slice(d1, d2 + 1).join("\n"), true, "d");
      L.splice(d1, d2 - d1 + 1); if (!L.length) { L.push(""); this.setMsg(MSG.semLinhas); }
      this.r = Math.min(d1, L.length - 1); this.c = firstNonBlank(L[this.r]);
      if (!this._dentroGlobal) this.fechaSnap();
      if (d2 - d1 + 1 > 2 && !this._dentroGlobal) this.setMsg((d2 - d1 + 1) + " linhas a menos");
      return;
    }
    if (e("y", "yank")) {
      var y1 = temFaixa ? a : this.r, y2 = temFaixa ? b : this.r, regY = /^[a-zA-Z"]/.test(arg) ? arg[0] : null;
      this.guardaReg(regY, L.slice(y1, y2 + 1).join("\n"), true, "y");
      if (y2 - y1 + 1 > 2) this.setMsg((y2 - y1 + 1) + " linhas copiadas");
      return;
    }
    if (e("m", "move") || e("t", "t") || e("co", "copy")) {
      var mv1 = temFaixa ? a : this.r, mv2 = temFaixa ? b : this.r, dest = this.endereco(arg.trim() || ".", 0);
      if (!dest) return;
      var dl = arg.trim() === "0" ? -1 : dest.linha;
      if (dl === null) { this.setMsg(MSG.E14, true); return; }
      var bloco = L.slice(mv1, mv2 + 1);
      if (!this._dentroGlobal) this.snapshot();
      if (nome[0] === "m") {
        if (dl >= mv1 && dl < mv2) { this.setMsg("E134: Impossível mover uma faixa de linhas para dentro dela mesma", true); return; }
        L.splice(mv1, bloco.length);
        var ins = dl >= mv2 ? dl - bloco.length + 1 : dl + 1;
        Array.prototype.splice.apply(L, [ins, 0].concat(bloco));
        this.r = ins + bloco.length - 1;
        if (bloco.length > 2 && !this._dentroGlobal) this.setMsg(bloco.length + " linhas movidas");
      } else {
        Array.prototype.splice.apply(L, [dl + 1, 0].concat(bloco));
        this.r = dl + bloco.length;
      }
      this.c = firstNonBlank(L[this.r]);
      if (!this._dentroGlobal) this.fechaSnap();
      return;
    }
    if (e("j", "join")) { var j1 = temFaixa ? a : this.r, j2 = temFaixa ? (b > a ? b : a + 1) : this.r + 1; if (!this._dentroGlobal) this.snapshot(); this.junta(j1, j2 - j1 + 1, bang); if (!this._dentroGlobal) this.fechaSnap(); return; }
    if (nome === ">" || nome === "<") { var sh1 = temFaixa ? a : this.r, sh2 = temFaixa ? b : this.r; var vezes = 1 + (/^[<>]+/.exec(arg) || [""])[0].length; this.aplicaOp(nome, { r: sh1, c: 0 }, { r: sh2, c: 0 }, "linha", null, vezes); this.fechaSnap(); return; }
    if (e("sor", "sort")) {
      var so1 = temFaixa ? a : 0, so2 = temFaixa ? b : L.length - 1, parte = L.slice(so1, so2 + 1);
      var numerico = /n/.test(arg), ic = /i/.test(arg), unico = /u/.test(arg);
      var chave = function (x) { if (!numerico) return ic ? x.toLowerCase() : x; var mm2 = /-?\d+/.exec(x); return mm2 ? parseInt(mm2[0], 10) : -Infinity; };
      parte.sort(function (x, y) { var a1 = chave(x), b1 = chave(y); return a1 < b1 ? -1 : a1 > b1 ? 1 : 0; });
      if (bang) parte.reverse();
      if (unico) parte = parte.filter(function (x, idx) { return idx === 0 || (ic ? x.toLowerCase() !== parte[idx - 1].toLowerCase() : x !== parte[idx - 1]); });
      this.snapshot();
      Array.prototype.splice.apply(L, [so1, so2 - so1 + 1].concat(parte));
      this.r = so1; this.c = 0; this.fechaSnap();
      var dif2 = (so2 - so1 + 1) - parte.length; if (dif2 > 2) this.setMsg(dif2 + " linhas a menos");
      return;
    }
    if (e("w", "write") || e("wq", "wq") || e("x", "xit") || e("up", "update") || e("wa", "wall") || e("wqa", "wqall") || e("xa", "xall") || e("exi", "exit")) {
      var arqNome = arg.trim() || this.arquivo;
      if (!arqNome) { this.setMsg(MSG.E32, true); return; }
      var sair = nome !== "w" && nome !== "write" && nome !== "up" && nome !== "update" && nome !== "wa" && nome !== "wall";
      if ((nome === "x" || nome === "xit" || nome === "exi" || nome === "exit" || nome === "xa") && !this.modificado && !this.novo) { this.sair(); return; }
      if ((nome === "up" || nome === "update") && !this.modificado) return;
      var conteudo = this.texto(), nl = this.lines.length, bytes = utf8len(conteudo) + 1;
      if (this.lines.length === 1 && this.lines[0] === "") { nl = 0; bytes = 0; }
      var eraNovo = this.novo || (arg.trim() && arg.trim() !== this.arquivo);
      if (!this.arquivo) this.arquivo = arqNome;
      if (arqNome === this.arquivo) { this.salvo = conteudo; this.novo = false; this.modificado = false; }
      this.gravou = true;
      this.setMsg('"' + arqNome + '"' + (eraNovo ? " [Novo]" : "") + " " + nl + "L, " + bytes + "B gravado(s)");
      if (sair) this.sair();
      return;
    }
    if (e("q", "quit") || e("qa", "qall") || e("quita", "quitall") || e("clo", "close")) {
      if (this.modificado && !bang) { this.setMsg(MSG.E37, true); return; }
      this.sair(); return;
    }
    if (e("e", "edit")) {
      if (bang || !this.modificado) { if (!arg.trim() || arg.trim() === this.arquivo) { this.snapshot(); this.lines = this.salvo.split("\n"); this.fechaSnap(); this.modificado = false; this.clamp(); this.setMsg('"' + this.arquivo + '" ' + this.lines.length + "L, " + (utf8len(this.salvo) + 1) + "B"); return; } }
      if (this.modificado && !bang) { this.setMsg(MSG.E37, true); return; }
      this.setMsg("(simulador) este Vim tem um arquivo só; abrir outros arquivos funciona no Vim real", true); return;
    }
    if (e("u", "undo")) { this.desfazer(1); return; }
    if (e("red", "redo")) { this.refazer(1); return; }
    if (e("noh", "nohlsearch")) { this.semDestaque = true; return; }
    if (e("se", "set") || e("setl", "setlocal")) {
      if (!arg.trim()) return;
      var self2 = this, erro = false;
      arg.trim().split(/\s+/).forEach(function (op) {
        if (erro) return;
        var mm3 = /^(no|inv)?(\w+)([!?&]?)(?:([+^-]?=)(.*))?$/.exec(op);
        if (!mm3) { self2.setMsg(MSG.E518 + op, true); erro = true; return; }
        var chaveOp = OPC[mm3[2]];
        if (!chaveOp) { self2.setMsg(MSG.E518 + op, true); erro = true; return; }
        if (chaveOp === "compatible" || chaveOp === "softtabstop" || chaveOp === "textwidth" || chaveOp === "undolevels") return;
        var atual = self2.opts[chaveOp];
        if (mm3[3] === "?" || (typeof atual === "number" && !mm3[4] && !mm3[1])) { self2.setMsg(typeof atual === "boolean" ? (atual ? "  " : "no") + chaveOp : "  " + chaveOp + "=" + atual); return; }
        if (typeof atual === "boolean") {
          if (mm3[4]) { self2.setMsg("E474: Argumento inválido: " + op, true); erro = true; return; }
          if (mm3[3] === "!" || mm3[1] === "inv") self2.opts[chaveOp] = !atual; else self2.opts[chaveOp] = mm3[1] !== "no";
          if (chaveOp === "hlsearch") self2.semDestaque = false;
        } else {
          var v = parseInt(mm3[5], 10); if (isNaN(v)) { self2.setMsg("E521: Número requerido após =: " + op, true); erro = true; return; }
          self2.opts[chaveOp] = mm3[4] === "+=" ? atual + v : mm3[4] === "-=" ? atual - v : v;
        }
      });
      return;
    }
    if (e("reg", "registers") || e("di", "display")) {
      var lin = ["Type Name Content"], ordem = ['"', "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "-", ".", ":", "%", "/"];
      if (this.arquivo) this.regs["%"] = { t: this.arquivo, l: false };
      var so = arg.trim() ? arg.replace(/\s/g, "").split("") : null;
      ordem.forEach(function (rn) {
        if (so && so.indexOf(rn) === -1) return;
        var v2 = self.regs[rn]; if (!v2 || v2.t === undefined || v2.t === "") return;
        var mostra = v2.t.replace(/\n/g, "^J").replace(/[\x00-\x08\x0b-\x1f]/g, function (c) { return "^" + String.fromCharCode(c.charCodeAt(0) + 64); });
        lin.push("  " + (v2.bloco ? "b" : v2.l ? "l" : "c") + "  \"" + rn + "   " + mostra + (v2.l ? "^J" : ""));
      });
      this.setMsg(lin.join("\n")); return;
    }
    if (e("marks", "marks")) {
      var lm = ["marca linha  col arquivo/texto"];
      var nomes = Object.keys(this.marks).filter(function (x) { return /[a-z'\[\]^.<>]/.test(x); }).sort();
      nomes.forEach(function (x) { var p = self.marks[x]; if (p.r < self.lines.length) lm.push(" " + x + "  " + pad(p.r + 1, 6) + " " + pad(p.c, 4) + " " + self.lines[p.r]); });
      this.setMsg(lm.join("\n")); return;
    }
    if (e("h", "help")) { this.setMsg("(simulador) no Vim real, :help " + (arg || "") + " abre o manual numa janela. Feche com :q.", false); return; }
    if (nome === "!" || e("r", "read") || e("sh", "shell") || e("te", "terminal")) { this.setMsg("(simulador) comandos do shell não rodam aqui; experimente no seu terminal", true); return; }
    if (e("ls", "ls") || e("buffers", "buffers") || e("bn", "bnext") || e("bp", "bprevious") || e("sp", "split") || e("vs", "vsplit") || e("tabnew", "tabnew") || e("files", "files")) { this.setMsg("(simulador) este simulador tem um arquivo e uma janela só; buffers, janelas e abas funcionam no Vim real", true); return; }
    if (e("p", "print") || e("nu", "number") || nome === "#") { var p1 = temFaixa ? a : this.r, p2 = temFaixa ? b : this.r; var outP = []; for (var rp = p1; rp <= p2; rp++) outP.push((nome === "#" || nome[0] === "n" ? pad(rp + 1, 3) + " " : "") + L[rp]); this.setMsg(outP.join("\n")); this.r = p2; return; }
    if (e("ec", "echo")) { this.setMsg(arg.replace(/^["']|["']$/g, "")); return; }
    if (e("pu", "put")) { var antesP = temFaixa ? b : this.r; this.r = antesP; var vv = this.regs[/^[a-z"0-9]/.test(arg) ? arg[0] : '"']; if (!vv) { this.setMsg(MSG.E353 + (arg[0] || '"'), true); return; } var guarda = vv.l; vv.l = true; this.colar(bang, arg[0] && /^[a-z"0-9]/.test(arg) ? arg[0] : '"', 1); vv.l = guarda; this.fechaSnap(); return; }
    if (e("a", "append") || e("i", "insert") || e("c", "change")) { this.setMsg("(simulador) use o modo de inserção (i, a, o) para inserir texto", true); return; }
    this.setMsg(MSG.E492 + ": " + s, true);
  };
  function pad(s, n) { s = String(s); while (s.length < n) s = " " + s; return s; }

  Vim.prototype.sair = function () { this.saiu = true; this.setMsg(""); };

  /* =========================================================
     Desenho na tela (navegador)
     ========================================================= */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  Vim.prototype.visivel = function (line, ts) {
    // expande tabs e devolve {txt, mapa: índice -> coluna visual}
    var out = "", mapa = [], col = 0;
    for (var i = 0; i < line.length; i++) {
      mapa.push(col);
      if (line.charCodeAt(i) < 32 && line[i] !== "\t") { out += "^" + String.fromCharCode(line.charCodeAt(i) + 64); col += 2; continue; }
      if (line[i] === "\t") {
        var w = ts - (col % ts);
        out += this.opts.list ? "^I" : rep(" ", w); col += this.opts.list ? 2 : w;
      } else { out += line[i]; col++; }
    }
    mapa.push(col);
    return { txt: out + (this.opts.list ? "$" : ""), mapa: mapa };
  };
  Vim.prototype.regua = function () {
    var line = this.lines[this.r], ins = this.mode === "insert" || this.mode === "replace";
    var cByte = utf8len(line.slice(0, this.c)) + 1, vis = this.visivel(line, this.opts.tabstop).mapa[this.c] + 1;
    var col = !line.length ? "0-1" : (cByte === vis ? String(cByte) : cByte + "-" + vis);
    var total = this.lines.length, pos = total <= this.alturaTela ? "Tudo" : this.topo === 0 ? "Topo" : this.topo + this.alturaTela >= total ? "Fim" : Math.round(this.topo * 100 / (total - this.alturaTela)) + "%";
    return (this.r + 1) + "," + col + rep(" ", Math.max(1, 14 - String(this.r + 1).length - col.length)) + pos;
  };
  Vim.prototype.html = function (altura) {
    altura = altura || 12;
    this.alturaTela = altura;
    if (this.topo === undefined) this.topo = 0;
    if (this.r < this.topo) this.topo = this.r;
    if (this.r >= this.topo + altura) this.topo = this.r - altura + 1;
    var L = this.lines, out = [], sel = this.vis ? this.selecao() : null, larguraNum = Math.max(3, String(L.length).length) + 1;
    var reBusca = null;
    if (this.opts.hlsearch && this.busca && !this.semDestaque) { try { reBusca = vimRegex(this.busca, this.opts.ignorecase, this.opts.smartcase); } catch (e) { reBusca = null; } }
    var mostraCursor = !this.saiu && !this.cmd;
    for (var i = 0; i < altura; i++) {
      var r = this.topo + i;
      if (r >= L.length) { out.push('<span class="v-til">~</span>'); continue; }
      var line = L[r], vis = this.visivel(line, this.opts.tabstop), num = "";
      if (this.opts.number || this.opts.relativenumber) {
        var nn = this.opts.relativenumber ? (r === this.r ? (this.opts.number ? r + 1 : 0) : Math.abs(r - this.r)) : r + 1;
        var alinhar = this.opts.relativenumber && r === this.r && this.opts.number ? -1 : 1;
        var ns = String(nn); ns = alinhar < 0 ? (ns + rep(" ", larguraNum - 1 - ns.length)) : pad(ns, larguraNum - 1);
        num = '<span class="v-num' + (r === this.r ? " v-num-atual" : "") + '">' + ns + " </span>";
      }
      // marca cada caractere: seleção, busca, cursor
      var marcas = [];
      for (var c = 0; c < line.length; c++) marcas.push("");
      if (reBusca) { reBusca.lastIndex = 0; var m; while ((m = reBusca.exec(line))) { for (var q = m.index; q < m.index + Math.max(1, m[0].length); q++) if (q < line.length) marcas[q] += " v-busca"; if (!m[0].length) reBusca.lastIndex++; } }
      var selVazia = false;
      if (sel) {
        for (var c2 = 0; c2 < line.length; c2++) {
          var dentro = false;
          if (sel.tipo === "linha") dentro = r >= sel.ini.r && r <= sel.fim.r;
          else if (sel.tipo === "bloco") dentro = r >= sel.ini.r && r <= sel.fim.r && c2 >= sel.ini.c && c2 <= sel.fim.c;
          else dentro = (r > sel.ini.r || (r === sel.ini.r && c2 >= sel.ini.c)) && (r < sel.fim.r || (r === sel.fim.r && c2 <= sel.fim.c));
          if (dentro) marcas[c2] += " v-sel";
        }
        if (!line.length && r >= sel.ini.r && r <= sel.fim.r) selVazia = true;
      }
      var html = "";
      for (var c3 = 0; c3 < line.length; c3++) {
        var ch = line[c3] === "\t" ? (this.opts.list ? "^I" : rep(" ", vis.mapa[c3 + 1] - vis.mapa[c3])) : line.charCodeAt(c3) < 32 ? "^" + String.fromCharCode(line.charCodeAt(c3) + 64) : line[c3];
        var classe = marcas[c3];
        var cur = mostraCursor && r === this.r && c3 === this.c && !(this.mode === "insert" || this.mode === "replace");
        var curIns = mostraCursor && r === this.r && c3 === this.c && (this.mode === "insert" || this.mode === "replace");
        if (cur) classe += " v-cur"; if (curIns) classe += this.mode === "replace" ? " v-cur-sub" : " v-cur-ins";
        html += classe ? '<span class="' + classe.trim() + '">' + esc(ch) + "</span>" : esc(ch);
      }
      if (mostraCursor && r === this.r && this.c >= line.length) html += '<span class="' + (this.mode === "insert" || this.mode === "replace" ? "v-cur-ins" : "v-cur") + '"> </span>';
      else if (selVazia) html += '<span class="v-sel"> </span>';
      if (this.opts.list) html += '<span class="v-til">$</span>';
      out.push(num + html);
    }
    var base = "";
    if (this.cmd) base = esc(this.cmd.tipo + this.cmd.texto) + '<span class="v-cur-ins"> </span>';
    else if (this.msg && this.msg.indexOf("\n") !== -1) base = esc(this.msg).replace(/\n/g, "<br>") + '<br><span class="v-mais">Aperte ENTER ou digite um comando para continuar</span>';
    else if (this.msg) base = this.msgErro ? '<span class="v-erro">' + esc(this.msg) + "</span>" : (/^-- /.test(this.msg) ? '<span class="v-modo">' + esc(this.msg) + "</span>" : esc(this.msg));
    if (this.gravando && !this.cmd) base = (this.msg && /^-- /.test(this.msg) ? '<span class="v-modo">' + esc(this.msg) + "</span>" : "") + (this.msg && /^-- /.test(this.msg) ? "" : "") + (base && !/^-- /.test(this.msg) && this.msg !== MSG.rec + this.gravando ? base + " " : "") + '<span class="v-modo">' + (this.msg && /^-- /.test(this.msg) ? "" : "") + "gravando @" + this.gravando + "</span>";
    var showcmd = this.pend.join("").replace(/Escape/g, "^[").replace(/<C-(.)>/g, function (m, x) { return "^" + x.toUpperCase(); });
    if (this.vis && !this.pend.length) {
      var s2 = this.selecao(); showcmd = s2.tipo === "linha" ? String(s2.fim.r - s2.ini.r + 1) : s2.tipo === "bloco" ? (s2.fim.r - s2.ini.r + 1) + "x" + (s2.fim.c - s2.ini.c + 1) : (s2.ini.r === s2.fim.r ? String(s2.fim.c - s2.ini.c + 1) : String(s2.fim.r - s2.ini.r + 1));
    }
    return { linhas: out, base: base, regua: this.cmd ? "" : this.regua(), showcmd: this.cmd ? "" : esc(showcmd) };
  };

  /* ---------- componente: Vim interativo ----------
     <div class="vimtry" data-file="notas.txt" data-goal="texto final" data-text="texto inicial"> */
  function decodifica(s) { return (s || "").replace(/\\n/g, "\n").replace(/\\t/g, "\t"); }
  function montar(el) {
    if (el.getAttribute("data-montado")) return;
    el.setAttribute("data-montado", "1");
    var preIni = el.querySelector("pre.vim-inicial"), preMeta = el.querySelector("pre.vim-meta");
    var inicial = preIni ? preIni.textContent.replace(/^\n/, "").replace(/\n$/, "") : decodifica(el.getAttribute("data-text"));
    var meta = preMeta ? preMeta.textContent.replace(/^\n/, "").replace(/\n$/, "") : (el.hasAttribute("data-goal") ? decodifica(el.getAttribute("data-goal")) : null);
    if (preIni) preIni.style.display = "none";
    if (preMeta) preMeta.style.display = "none";
    var arquivo = el.getAttribute("data-file") || "exemplo.txt", altura = +(el.getAttribute("data-height") || 0);
    var exigeSalvar = el.getAttribute("data-save") === "1", maxTeclas = +(el.getAttribute("data-max-keys") || 0), setOpts = el.getAttribute("data-set") || "";
    var linhaIni = +(el.getAttribute("data-line") || 0), colIni = +(el.getAttribute("data-col") || 0);
    var vim;
    var caixa = document.createElement("div");
    caixa.className = "vimsim";
    caixa.tabIndex = 0;
    caixa.setAttribute("role", "application");
    caixa.setAttribute("aria-label", "Vim simulado: clique e use o teclado");
    caixa.innerHTML = '<div class="vim-bar"><span class="sim-dots"><i></i><i></i><i></i></span><span class="vim-titulo"></span>' +
      '<button type="button" class="sim-btn vim-esc" title="Tecla Esc (útil no celular)">Esc</button>' +
      '<button type="button" class="sim-btn vim-reset" title="Volta o texto ao começo">Reiniciar</button></div>' +
      '<div class="vim-tela"><div class="vim-linhas"></div><div class="vim-base"><span class="vim-msg"></span><span class="vim-showcmd"></span><span class="vim-regua"></span></div></div>' +
      '<textarea class="vim-input" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" aria-hidden="true"></textarea>' +
      '<div class="vim-foco">Clique aqui para usar o teclado</div>';
    el.appendChild(caixa);
    var status = document.createElement("p"); status.className = "sim-status";
    if (meta !== null) el.appendChild(status);
    var linhasEl = caixa.querySelector(".vim-linhas"), msgEl = caixa.querySelector(".vim-msg"), scEl = caixa.querySelector(".vim-showcmd"), reguaEl = caixa.querySelector(".vim-regua"), titulo = caixa.querySelector(".vim-titulo"), inp = caixa.querySelector(".vim-input");
    var alt = altura || Math.min(14, Math.max(6, inicial.split("\n").length + 3));

    function desenha() {
      var h = vim.html(alt);
      linhasEl.innerHTML = h.linhas.map(function (l) { return "<div>" + (l || " ") + "</div>"; }).join("");
      msgEl.innerHTML = h.base; scEl.innerHTML = h.showcmd; reguaEl.textContent = vim.saiu ? "" : h.regua;
      titulo.textContent = (vim.modificado ? "+ " : "") + arquivo + " — Vim";
      caixa.classList.toggle("vim-saiu", vim.saiu);
      if (vim.saiu) linhasEl.innerHTML = '<div class="vim-fora">Você saiu do Vim. ' + (vim.gravou ? "O arquivo foi salvo." : "") + " Clique em Reiniciar para abrir de novo.</div>";
      if (meta !== null) {
        var ok = vim.texto() === meta && (!exigeSalvar || (vim.salvo === meta));
        if (ok) { status.className = "sim-status ok"; status.textContent = "✔ Missão cumprida com " + vim.teclas + " teclas" + (maxTeclas ? (vim.teclas <= maxTeclas ? " — dentro do desafio de " + maxTeclas + "!" : " (desafio: " + maxTeclas + " ou menos)") : "") + "."; }
        else { status.className = "sim-status"; status.textContent = (exigeSalvar && vim.texto() === meta ? "Quase: falta salvar com :w" : "Missão em andamento…") + " Teclas: " + vim.teclas; }
      }
    }
    function inicia() {
      vim = new Vim(inicial, { arquivo: arquivo, linha: linhaIni, coluna: colIni });
      if (setOpts) vim.executaEx("set " + setOpts);
      vim.setMsg(inicial === "" ? '"' + arquivo + '" 0L, 0B' : '"' + arquivo + '" ' + vim.lines.length + "L, " + (utf8len(inicial) + 1) + "B");
      desenha();
    }
    function nomeTecla(e) {
      var k = e.key;
      if (e.ctrlKey && !e.altKey && k.length === 1) return "<C-" + k.toLowerCase() + ">";
      if (k === "Escape" || k === "Enter" || k === "Backspace" || k === "Tab" || k === "Delete" || /^Arrow/.test(k) || k === "Home" || k === "End") return k;
      if (k.length === 1) return k;
      return null;
    }
    caixa.addEventListener("keydown", function (e) {
      if (e.metaKey || (e.ctrlKey && (e.key === "c" || e.key === "v") && e.shiftKey)) return;
      var k = nomeTecla(e);
      if (!k) return;
      e.preventDefault();
      vim.msgErro = false;
      if (vim.msg && vim.msg.indexOf("\n") !== -1) { vim.setMsg(""); if (k === "Enter" || k === " ") { desenha(); return; } }
      vim.tecla(k);
      desenha();
    });
    inp.addEventListener("input", function () {
      // teclado virtual (celular): envia o texto digitado
      var v = inp.value; inp.value = "";
      for (var i = 0; i < v.length; i++) vim.tecla(v[i] === "\n" ? "Enter" : v[i]);
      desenha();
    });
    caixa.addEventListener("click", function () { if (/Mobi|Android/i.test(navigator.userAgent)) inp.focus(); else caixa.focus(); });
    caixa.querySelector(".vim-reset").addEventListener("click", function (e) { e.stopPropagation(); inicia(); caixa.focus(); });
    caixa.querySelector(".vim-esc").addEventListener("click", function (e) { e.stopPropagation(); vim.tecla("Escape"); desenha(); caixa.focus(); });
    inicia();
  }

  /* ---------- componente: demonstração passo a passo ----------
     <div class="vimdemo" data-keys="dw" data-file="x.txt"><pre class="vim-inicial">texto</pre></div> */
  function montarDemo(el) {
    if (el.getAttribute("data-montado")) return;
    el.setAttribute("data-montado", "1");
    var preIni = el.querySelector("pre.vim-inicial");
    var inicial = preIni ? preIni.textContent.replace(/^\n/, "").replace(/\n$/, "") : decodifica(el.getAttribute("data-text"));
    if (preIni) preIni.style.display = "none";
    var teclas = Vim.tokens(el.getAttribute("data-keys") || ""), grupos = [], gi = 0;
    while (gi < teclas.length) {
      if ((teclas[gi] === ":" || teclas[gi] === "/" || teclas[gi] === "?") && teclas.indexOf("Enter", gi) > gi) {
        var fimG = teclas.indexOf("Enter", gi); grupos.push(teclas.slice(gi, fimG + 1)); gi = fimG + 1;
      } else grupos.push([teclas[gi++]]);
    }
    var arquivo = el.getAttribute("data-file") || "exemplo.txt";
    var linhaIni = +(el.getAttribute("data-line") || 0), colIni = +(el.getAttribute("data-col") || 0), setOpts = el.getAttribute("data-set") || "";
    var alt = +(el.getAttribute("data-height") || 0) || Math.min(12, Math.max(4, inicial.split("\n").length + 1));
    var passo = 0, vim;
    var caixa = document.createElement("div");
    caixa.className = "vimsim vimsim-demo";
    caixa.innerHTML = '<div class="vim-bar"><span class="sim-dots"><i></i><i></i><i></i></span><span class="vim-titulo"></span></div>' +
      '<div class="vim-tela"><div class="vim-linhas"></div><div class="vim-base"><span class="vim-msg"></span><span class="vim-showcmd"></span><span class="vim-regua"></span></div></div>';
    var barra = document.createElement("div");
    barra.className = "demo-controles";
    barra.innerHTML = '<button type="button" class="demo-volta" title="Voltar ao início">⏮</button><button type="button" class="demo-passo">Próxima tecla ▶</button><button type="button" class="demo-tudo">Tudo ▶▶</button><span class="demo-teclas"></span>';
    el.appendChild(caixa); if (grupos.length) el.appendChild(barra);
    if (el.getAttribute("data-title")) caixa.querySelector(".vim-titulo").setAttribute("data-fixo", el.getAttribute("data-title"));
    var linhasEl = caixa.querySelector(".vim-linhas"), msgEl = caixa.querySelector(".vim-msg"), scEl = caixa.querySelector(".vim-showcmd"), reguaEl = caixa.querySelector(".vim-regua"), titulo = caixa.querySelector(".vim-titulo"), tecEl = barra.querySelector(".demo-teclas");
    function nomeVisivel(t) { return t === "Escape" ? "Esc" : t === "Enter" ? "Enter" : t === " " ? "Espaço" : t === "Backspace" ? "⌫" : t === "Tab" ? "Tab" : /^<C-/.test(t) ? "Ctrl+" + t[3].toUpperCase() : t; }
    function desenha() {
      var h = vim.html(alt);
      linhasEl.innerHTML = h.linhas.map(function (l) { return "<div>" + (l || " ") + "</div>"; }).join("");
      msgEl.innerHTML = h.base; scEl.innerHTML = h.showcmd; reguaEl.textContent = vim.saiu ? "" : h.regua;
      titulo.textContent = titulo.getAttribute("data-fixo") || (arquivo + " — Vim");
      tecEl.innerHTML = grupos.map(function (g, i) { var nome = g.length > 1 ? g.slice(0, -1).join("") + " Enter" : nomeVisivel(g[0]); return '<kbd class="' + (i < passo ? "feita" : i === passo ? "proxima" : "") + '">' + esc(nome) + "</kbd>"; }).join("");
      barra.querySelector(".demo-passo").disabled = passo >= grupos.length;
      barra.querySelector(".demo-tudo").disabled = passo >= grupos.length;
    }
    function inicia() { vim = new Vim(inicial, { arquivo: arquivo, linha: linhaIni, coluna: colIni }); if (setOpts) vim.executaEx("set " + setOpts); vim.setMsg(""); passo = 0; desenha(); }
    barra.querySelector(".demo-passo").addEventListener("click", function () { if (passo < grupos.length) { grupos[passo++].forEach(function (t) { vim.tecla(t); }); desenha(); } });
    barra.querySelector(".demo-tudo").addEventListener("click", function () { while (passo < grupos.length) grupos[passo++].forEach(function (t) { vim.tecla(t); }); desenha(); });
    barra.querySelector(".demo-volta").addEventListener("click", inicia);
    inicia();
  }

  global.VimSim = { Vim: Vim, montar: montar, montarDemo: montarDemo, vimRegex: vimRegex, MSG: MSG };
  if (typeof document !== "undefined") {
    var go = function () { document.querySelectorAll(".vimtry").forEach(montar); document.querySelectorAll(".vimdemo").forEach(montarDemo); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  }
  if (typeof module !== "undefined") module.exports = global.VimSim;
})(typeof window !== "undefined" ? window : globalThis);
