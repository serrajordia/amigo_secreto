/*
 * Contador de acessos anônimo (GoatCounter: sem cookies, sem dados pessoais).
 * Só funciona se `goatcounterUrl` estiver preenchido em config.js; caso contrário não faz nada.
 * NÃO inclua este arquivo em ver.html: o resultado de cada pessoa vai no endereço dessa página.
 * Os eventos registram apenas o NOME da ação (ex.: "sorteio-rapido"), nunca nomes, e-mails ou resultados.
 */
(function () {
  var cfg = window.AMIGO_CONFIG || {};
  var url = cfg.goatcounterUrl || '';
  if (!/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/.test(url)) {
    window.Contador = { contar: function () {} };
    return;
  }
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', url);
  document.head.appendChild(s);
  var aviso = document.getElementById('aviso-contador');
  if (aviso) aviso.hidden = false;
  window.Contador = {
    contar: function (nome) {
      try {
        if (window.goatcounter && window.goatcounter.count) {
          window.goatcounter.count({ path: nome, title: nome, event: true });
        }
      } catch (e) { /* contar nunca pode quebrar o app */ }
    }
  };
})();
