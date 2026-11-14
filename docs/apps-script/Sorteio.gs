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

  return { sortear: sortear, verificar: verificar, podeTirar: podeTirar, EMAIL_RE: EMAIL_RE };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sorteio;
