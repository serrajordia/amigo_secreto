/*
 * Algoritmo do sorteio de amigo secreto — mesma lógica de amigo_secreto/sorteio.py.
 * Este arquivo é usado em dois lugares e deve ser IDÊNTICO nos dois:
 *   docs/js/sorteio.js       (interface web: checagem de viabilidade)
 *   docs/apps-script/Sorteio.gs (Apps Script: sorteio de verdade + envio)
 * Sem import/export para funcionar no navegador e no Apps Script.
 */
var Sorteio = (function () {
  'use strict';

  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var TENTATIVAS_REJEICAO = 20000;

  // Lê números aleatórios criptográficos em lotes (muito mais rápido que um getRandomValues por número).
  var lote = null, usados = 0;
  function aleatorio() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      if (!lote || usados >= lote.length) {
        lote = lote || new Uint32Array(4096);
        crypto.getRandomValues(lote);
        usados = 0;
      }
      return lote[usados++] / 4294967296;
    }
    return Math.random(); // Apps Script (servidor)
  }

  function embaralha(v, rnd) {
    for (var i = v.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = v[i]; v[i] = v[j]; v[j] = t;
    }
    return v;
  }

  function grupo(p) { return String(p.grupo || '').trim().toLowerCase(); }

  function normalizaRegras(r) {
    r = r || {};
    return {
      permitirAutossorteio: !!r.permitirAutossorteio,
      permitirMesmoGrupo: !!r.permitirMesmoGrupo,
      correnteUnica: !!r.correnteUnica
    };
  }

  function podeTirar(ps, i, j, r) {
    if (i === j) return r.permitirAutossorteio && r.permitirMesmoGrupo;
    if (r.permitirMesmoGrupo) return true;
    var gi = grupo(ps[i]), gj = grupo(ps[j]);
    return !(gi && gi === gj);
  }

  function vizinhos(ps, r) {
    var viz = [];
    for (var i = 0; i < ps.length; i++) {
      viz.push([]);
      for (var j = 0; j < ps.length; j++) if (podeTirar(ps, i, j, r)) viz[i].push(j);
    }
    return viz;
  }

  /**
   * Algoritmo de Kuhn (iterativo, sem recursão): dá a cada pessoa um destino permitido.
   * Devolve destino[i] ou null se não existe atribuição completa. Com `rnd`, embaralha a ordem das
   * pessoas e das opções: sorteio válido e imprevisível (aproximadamente uniforme; só a
   * amostragem por rejeição é exata).
   */
  function emparelhar(viz, rnd) {
    var n = viz.length, i, k, a;
    var v = viz.map(function (x) { return x.slice(); });
    var ordem = [], dono = [];
    for (i = 0; i < n; i++) { ordem.push(i); dono.push(-1); }
    if (rnd) {
      embaralha(ordem, rnd);
      for (i = 0; i < n; i++) embaralha(v[i], rnd);
    }
    for (var o = 0; o < n; o++) {
      var visto = [];
      for (k = 0; k < n; k++) visto.push(false);
      var pilha = [ordem[o]], pos = [0], escolhas = [], achou = false;
      while (pilha.length) {
        var topo = pilha.length - 1, pessoa = pilha[topo];
        if (pos[topo] < v[pessoa].length) {
          var j = v[pessoa][pos[topo]++];
          if (visto[j]) continue;
          visto[j] = true;
          escolhas.push(j);
          if (dono[j] === -1) { achou = true; break; }
          pilha.push(dono[j]); // tenta fazer o atual dono de j trocar de destino
          pos.push(0);
        } else {
          pilha.pop(); pos.pop();
          if (escolhas.length) escolhas.pop();
        }
      }
      if (!achou) return null;
      for (a = 0; a < pilha.length; a++) dono[escolhas[a]] = pilha[a]; // aplica a cadeia de trocas
    }
    var destino = [];
    for (i = 0; i < n; i++) destino.push(0);
    for (var d = 0; d < n; d++) destino[dono[d]] = d;
    return destino;
  }

  function temEmparelhamento(viz) { return emparelhar(viz) !== null; }

  /** opcoes.exigirEmail (padrão true): no modo "links" o e-mail é opcional (mas, se vier, tem de ser válido). */
  function verificar(ps, regras, opcoes) {
    var r = normalizaRegras(regras), erros = [], avisos = [], n = ps.length, i;
    var exigirEmail = !(opcoes && opcoes.exigirEmail === false);
    if (n < 2) erros.push('Cadastre pelo menos 2 participantes.');
    for (i = 0; i < n; i++) {
      var p = ps[i], nome = String(p.nome || '').trim();
      if (!nome) erros.push('Linha ' + (i + 1) + ': nome vazio.');
      var mail = String(p.email || '').trim();
      if ((exigirEmail || mail) && !EMAIL_RE.test(mail))
        erros.push('Linha ' + (i + 1) + ' (' + (nome || '?') + '): e-mail inválido.');
    }
    var vistos = {};
    for (i = 0; i < n; i++) {
      var e = String(ps[i].email || '').trim().toLowerCase();
      if (!e) continue;
      if (vistos[e] !== undefined)
        avisos.push(vistos[e] + ' e ' + ps[i].nome + ' usam o mesmo e-mail — esse e-mail verá os dois resultados.');
      else vistos[e] = ps[i].nome;
    }
    if (!erros.length) {
      if (!r.permitirMesmoGrupo) {
        var tam = {}, rotulo = {};
        for (i = 0; i < n; i++) {
          var g = grupo(ps[i]);
          if (!g) continue;
          tam[g] = (tam[g] || 0) + 1;
          rotulo[g] = String(ps[i].grupo).trim();
        }
        for (var k in tam) {
          if (tam[k] > n - tam[k])
            erros.push("O grupo '" + rotulo[k] + "' tem " + tam[k] + ' de ' + n +
              ' pessoas: não há gente suficiente de fora para todos tirarem alguém de outro grupo.');
        }
      }
      if (!erros.length && !temEmparelhamento(vizinhos(ps, r)))
        erros.push('Com essas regras não existe sorteio possível.');
    }
    return { viavel: !erros.length, erros: erros, avisos: avisos };
  }

  function valido(ps, destino, r) {
    for (var i = 0; i < destino.length; i++) if (!podeTirar(ps, i, destino[i], r)) return false;
    return true;
  }

  function deCorrente(ordem) {
    var d = [];
    for (var k = 0; k < ordem.length; k++) d[ordem[k]] = ordem[(k + 1) % ordem.length];
    return d;
  }

  /** Busca com retrocesso, usada só para "corrente única" (um único ciclo), que o Kuhn não garante. */
  function backtracking(ps, r, rnd) {
    var n = ps.length, viz = vizinhos(ps, r), usado = [], i;
    for (i = 0; i < n; i++) usado.push(false);
    var ordem = [0];
    usado[0] = true;
    var anda = function (k) {
      if (k === n) return podeTirar(ps, ordem[n - 1], ordem[0], r);
      var op = embaralha(viz[ordem[k - 1]].filter(function (j) { return !usado[j]; }), rnd);
      for (var a = 0; a < op.length; a++) {
        usado[op[a]] = true; ordem.push(op[a]);
        if (anda(k + 1)) return true;
        ordem.pop(); usado[op[a]] = false;
      }
      return false;
    };
    return anda(1) ? deCorrente(ordem) : null;
  }

  /** Devolve destino[i] = índice de quem ps[i] tirou. Lança Error se impossível. */
  function sortear(ps, regras, rnd, opcoes) {
    var r = normalizaRegras(regras);
    rnd = rnd || aleatorio;
    var v = verificar(ps, r, opcoes);
    if (!v.viavel) throw new Error(v.erros.join(' '));
    var n = ps.length, base = [], i;
    for (i = 0; i < n; i++) base.push(i);
    for (var t = 0; t < TENTATIVAS_REJEICAO; t++) {
      var perm = embaralha(base.slice(), rnd);
      var destino = r.correnteUnica ? deCorrente(perm) : perm;
      if (valido(ps, destino, r)) return destino;
    }
    // Rede de segurança (casos apertados, ex.: poucos grupos enormes): sorteio válido em tempo polinomial.
    var d = r.correnteUnica ? backtracking(ps, r, rnd) : emparelhar(vizinhos(ps, r), rnd);
    if (!d) throw new Error('Com essas regras não existe sorteio possível.');
    return d;
  }

  /* ------------------------------------------------------------------------------------------
   * Sorteio reprodutível ("código de recuperação"), versão 1. Mesma lógica em amigo_secreto/sorteio.py.
   *
   * Código: 1-SSSS-SSSS-SSSS-SSSS-CCCC-AAAAMMDD-HHMM
   *   1     versão (o algoritmo da v1 fica congelado: mudanças futuras viram v2)
   *   S×16  segredo aleatório (80 bits, alfabeto Crockford base32)
   *   C×4   conferência = hash(segredo + data + lista + regras): pega erro de digitação e lista alterada
   *   data  data-hora local do sorteio, legível (só identifica o sorteio; não muda o resultado).
   *         Códigos antigos, sem a data, continuam valendo.
   * Números aleatórios: SHA-256("amigo-secreto/v1/<segredo>/<contador>"), 8 palavras de 32 bits por bloco.
   * Com o mesmo código e a mesma lista (mesma ordem, grupos e regras) o resultado é idêntico no
   * navegador, no Apps Script e no Python. Quem tem o código E a lista consegue refazer o sorteio inteiro.
   * ---------------------------------------------------------------------------------------- */
  var ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function ror(x, n) { return (x >>> n) | (x << (32 - n)); }

  function utf8(s) {
    var b = unescape(encodeURIComponent(s)), r = [];
    for (var i = 0; i < b.length; i++) r.push(b.charCodeAt(i));
    return r;
  }

  /** SHA-256 síncrono (crypto.subtle é assíncrono e não existe no Apps Script). Devolve 8 palavras de 32 bits. */
  function sha256(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var m = bytes.slice(), bits = bytes.length * 8, w = [], t;
    m.push(0x80);
    while (m.length % 64 !== 56) m.push(0);
    m.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
    for (var o = 0; o < m.length; o += 64) {
      for (t = 0; t < 16; t++) w[t] = (m[o + 4 * t] << 24) | (m[o + 4 * t + 1] << 16) | (m[o + 4 * t + 2] << 8) | m[o + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        w[t] = (w[t - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + w[t - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10))) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[t] + w[t]) | 0;
        var t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return v >>> 0; });
  }

  /** Primeiros n caracteres base32 (5 bits cada, do bit mais alto) de um hash. */
  function base32(palavras, n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var v = 0;
      for (var k = 0; k < 5; k++) {
        var bit = 5 * i + k;
        v = (v << 1) | ((palavras[bit >> 5] >>> (31 - (bit & 31))) & 1);
      }
      s += ALFABETO.charAt(v);
    }
    return s;
  }

  function hashTexto(txt) { return sha256(utf8(txt)); }

  function bytesAleatorios(n) {
    var b = [], i;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var u = new Uint8Array(n);
      crypto.getRandomValues(u);
      for (i = 0; i < n; i++) b.push(u[i]);
      return b;
    }
    var semente = '';
    if (typeof Utilities !== 'undefined' && Utilities.getUuid) { // Apps Script: UUID v4 vem de SecureRandom
      for (i = 0; i < 4; i++) semente += Utilities.getUuid();
    } else {
      for (i = 0; i < 16; i++) semente += Math.random();
    }
    var h = hashTexto(semente);
    for (i = 0; i < n; i++) b.push((h[i >> 2] >>> (24 - 8 * (i & 3))) & 255);
    return b;
  }

  /** Forma canônica de nomes (sem acento, minúsculo, espaços simples): só para a conferência. */
  function canonico(s) {
    return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Data-hora local do sorteio como 12 dígitos "AAAAMMDDHHMM" (aceita Date, string de 12 dígitos ou nada = agora). */
  function carimbo(quando) {
    if (typeof quando === 'string' && /^\d{12}$/.test(quando)) return quando;
    var d = quando instanceof Date ? quando : new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes());
  }

  function carimboValido(c) {
    if (!/^\d{12}$/.test(c)) return false;
    var m = +c.slice(4, 6), d = +c.slice(6, 8), h = +c.slice(8, 10), mi = +c.slice(10, 12);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 && h < 24 && mi < 60;
  }

  /** "202611241432" → "24/11/2026 às 14h32". */
  function descreverData(c) {
    if (!c || !carimboValido(c)) return '';
    return c.slice(6, 8) + '/' + c.slice(4, 6) + '/' + c.slice(0, 4) + ' às ' + c.slice(8, 10) + 'h' + c.slice(10, 12);
  }

  // Sem data (códigos antigos) a conferência é exatamente a original; com data, ela também protege a data.
  function conferencia(segredo, ps, regras, quando) {
    var r = normalizaRegras(regras);
    var txt = 'amigo-secreto/v1/conferencia/' + segredo + (quando ? '@' + quando : '') + '|' +
      (r.permitirAutossorteio && r.permitirMesmoGrupo ? 1 : 0) + (r.permitirMesmoGrupo ? 1 : 0) + (r.correnteUnica ? 1 : 0) + '|' +
      ps.map(function (p) { return canonico(p.nome) + '\u001f' + grupo(p); }).join('\u001e');
    return base32(hashTexto(txt), 4);
  }

  function formataCodigo(c) { // c normalizado: 21 caracteres, ou 33 com a data-hora no fim
    return c.charAt(0) + '-' + c.slice(1, 21).match(/.{4}/g).join('-') +
      (c.length > 21 ? '-' + c.slice(21, 29) + '-' + c.slice(29) : '');
  }

  function normalizaCodigo(codigo) {
    return String(codigo == null ? '' : codigo).toUpperCase().replace(/[\s\-–—.]/g, '')
      .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  }

  /** Gerador determinístico a partir do segredo (16 caracteres). */
  function geradorDoSegredo(segredo) {
    var bloco = null, usadas = 8, contador = 0;
    return function () {
      if (usadas >= 8) { bloco = hashTexto('amigo-secreto/v1/' + segredo + '/' + contador++); usadas = 0; }
      return bloco[usadas++] / 4294967296;
    };
  }

  /** Apelido curto e público do sorteio (aparece no link/e-mail): ajuda a distinguir sorteios. */
  function apelidoDoSegredo(segredo) { return base32(hashTexto('amigo-secreto/v1/apelido/' + segredo), 4); }

  /**
   * Cria um código novo para esta lista e estas regras, com a data-hora do sorteio no fim
   * (1-SSSS-SSSS-SSSS-SSSS-CCCC-AAAAMMDD-HHMM). `quando`: Date ou "AAAAMMDDHHMM"; padrão = agora.
   */
  function novoCodigo(ps, regras, quando) {
    var b = bytesAleatorios(16), segredo = '', q = carimbo(quando);
    for (var i = 0; i < 16; i++) segredo += ALFABETO.charAt(b[i] & 31);
    return formataCodigo('1' + segredo + conferencia(segredo, ps, regras, q) + q);
  }

  /**
   * Lê um código e confere com a lista/regras. Devolve {ok, codigo, apelido, quando, data, rnd} ou {ok:false, erro}.
   * `quando` = "AAAAMMDDHHMM" e `data` = "24/11/2026 às 14h32" (vazios em códigos antigos, sem data).
   * Use o `rnd` em sortear(ps, regras, rnd) para obter o resultado daquele código.
   */
  function lerCodigo(codigo, ps, regras) {
    var c = normalizaCodigo(codigo);
    var quando = c.length === 33 ? c.slice(21) : '';
    if (!/^1[0-9A-HJKMNP-TV-Z]{20}(\d{12})?$/.test(c) || (quando && !carimboValido(quando)))
      return { ok: false, erro: 'Código incompleto ou inválido. O formato é 1-XXXX-XXXX-XXXX-XXXX-XXXX-AAAAMMDD-HHMM.' };
    var segredo = c.slice(1, 17);
    if (c.slice(17, 21) !== conferencia(segredo, ps, regras, quando))
      return {
        ok: false,
        erro: 'Este código não confere com a lista atual. Confira se o código foi digitado certo e se os participantes ' +
          '(na mesma ordem), os grupos e as regras estão exatamente como no dia do sorteio.'
      };
    return {
      ok: true, codigo: formataCodigo(c), apelido: apelidoDoSegredo(segredo),
      quando: quando, data: descreverData(quando), rnd: geradorDoSegredo(segredo)
    };
  }

  /** Apelido curto aleatório para sorteios sem código (só para distinguir sorteios). */
  function apelidoAleatorio() {
    var b = bytesAleatorios(4), s = '';
    for (var i = 0; i < 4; i++) s += ALFABETO.charAt(b[i] & 31);
    return s;
  }

  return {
    sortear: sortear, verificar: verificar, podeTirar: podeTirar, EMAIL_RE: EMAIL_RE,
    novoCodigo: novoCodigo, lerCodigo: lerCodigo, apelidoAleatorio: apelidoAleatorio,
    carimbo: carimbo, descreverData: descreverData, _sha256: sha256
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sorteio;
