/*
 * Links individuais do "modo rápido".
 * O resultado de cada pessoa vai DENTRO do endereço, depois do "#". Essa parte do
 * endereço nunca é enviada a nenhum servidor (nem ao GitHub Pages): só o navegador de
 * quem abre o link a lê. Não há banco de dados nem conta.
 *
 * Atenção: é codificação, não criptografia. Quem tem o link consegue ler o resultado
 * daquela pessoa (é para isso que ele serve). Por isso cada link deve ir só para o dono.
 */
var Link = (function () {
  'use strict';

  function paraB64Url(texto) {
    var bytes = new TextEncoder().encode(texto), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function deB64Url(b64) {
    var s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function corta(s, max) { return String(s == null ? '' : s).trim().slice(0, max); }

  /** base: endereço da página de revelação (ex.: https://…/ver.html). */
  function criar(base, quem, tirou, evento) {
    evento = evento || {};
    var dados = {
      v: 1,
      p: corta(quem, 80),
      t: corta(tirou, 80),
      e: {
        n: corta(evento.nome, 80),
        d: corta(evento.dataFesta, 80),
        l: corta(evento.local, 120),
        v: corta(evento.valor, 40),
        o: corta(evento.organizador, 80),
        m: corta(evento.mensagem, 1000)
      }
    };
    return base + '#' + paraB64Url(JSON.stringify(dados));
  }

  /** Lê o "#…" de um link. Devolve null se estiver quebrado. */
  function ler(hash) {
    try {
      var d = JSON.parse(deB64Url(String(hash).replace(/^#/, '')));
      if (!d || d.v !== 1 || typeof d.p !== 'string' || typeof d.t !== 'string' || !d.t) return null;
      var e = d.e || {};
      return {
        quem: d.p, tirou: d.t,
        evento: { nome: e.n || '', dataFesta: e.d || '', local: e.l || '', valor: e.v || '', organizador: e.o || '', mensagem: e.m || '' }
      };
    } catch (err) {
      return null;
    }
  }

  return { criar: criar, ler: ler };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Link;
