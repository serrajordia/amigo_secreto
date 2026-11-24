/* Página de revelação do modo rápido. O resultado vem do "#" do endereço (nunca vai a um servidor). */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  try { // preferência de tema, igual à página principal
    var t = localStorage.getItem('amigoSecreto.tema');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* ignora */ }

  var d = Link.ler(location.hash);
  if (!d) { $('#erro').hidden = false; return; }

  var ev = d.evento;
  document.title = (ev.nome || 'Amigo Secreto') + ' · seu amigo secreto';
  if (ev.nome) $('#titulo-evento').textContent = ev.nome;
  $('#ola').textContent = 'Olá, ' + d.quem + '!';
  $('#tirou').textContent = d.tirou;

  var dl = $('#detalhes');
  [['Data da festa', ev.dataFesta], ['Local', ev.local], ['Valor sugerido', ev.valor], ['Organização', ev.organizador]]
    .forEach(function (l) {
      if (!l[1]) return;
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = l[0]; dd.textContent = l[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
  $('#recado').textContent = ev.mensagem;
  if (d.apelido) { $('#apelido').textContent = 'Sorteio #' + d.apelido; $('#apelido').hidden = false; }

  /* convite da AMA: lembra (só neste navegador) quem já ativou, para não repetir */
  function convite(ativou) { $('#convite').hidden = ativou; $('#convite-ok').hidden = !ativou; }
  try { convite(localStorage.getItem('amigoSecreto.ativouNfp') === '1'); } catch (e) { /* ignora */ }
  $('#ja-ativei').addEventListener('click', function () {
    try { localStorage.setItem('amigoSecreto.ativouNfp', '1'); } catch (e) { /* ignora */ }
    convite(true);
  });
  $('#copiar-cnpj').addEventListener('click', function () {
    var b = this;
    navigator.clipboard.writeText('52.802.295/0001-13').then(function () {
      b.textContent = '✓ Copiado!';
    }).catch(function () { b.textContent = '52.802.295/0001-13'; });
  });

  $('#cartao').hidden = false;
  $('#revelar').addEventListener('click', function () {
    $('#escondido').hidden = true; $('#visivel').hidden = false;
  });
  $('#esconder').addEventListener('click', function () {
    $('#visivel').hidden = true; $('#escondido').hidden = false;
  });
})();
