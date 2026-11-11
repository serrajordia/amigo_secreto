/* Interface do Amigo Secreto — assistente em 5 passos. Sem dependências. */
(function () {
  'use strict';

  var CHAVE_DADOS = 'amigoSecreto.v1';
  var CHAVE_TOKEN = 'amigoSecreto.token';
  var CHAVE_TEMA = 'amigoSecreto.tema';
  var CORES_GRUPO = ['#0071BC', '#29ABE2', '#3D4653', '#71798A', '#1B7F86', '#6D4DB0', '#B8561B', '#2E7D32', '#A0306E', '#4A5DC4'];

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ------------------------------------------------------------ estado */
  var estado = {
    url: '',
    evento: { nome: '', dataFesta: '', local: '', valor: '', organizador: '', mensagem: '' },
    participantes: [],
    regras: { grupo: true, auto: true, corrente: false },
    etapa: 1
  };
  var conexao = { ok: false, cota: null, remetente: '' };
  var idPedido = null;

  function armazenamento(tipo) {
    try { var s = window[tipo]; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch (e) { return null; }
  }
  var local = armazenamento('localStorage');
  var sessao = armazenamento('sessionStorage');

  function carregar() {
    try {
      var d = local && JSON.parse(local.getItem(CHAVE_DADOS) || 'null');
      if (d) {
        estado.url = d.url || '';
        Object.assign(estado.evento, d.evento || {});
        estado.participantes = Array.isArray(d.participantes) ? d.participantes : [];
        Object.assign(estado.regras, d.regras || {});
        estado.etapa = d.etapa || 1;
      }
    } catch (e) { /* dados corrompidos: começa do zero */ }
  }
  function salvar() {
    try { local && local.setItem(CHAVE_DADOS, JSON.stringify(estado)); } catch (e) { /* cheio/bloqueado */ }
  }
  function lerToken() {
    try { return (sessao && sessao.getItem(CHAVE_TOKEN)) || (local && local.getItem(CHAVE_TOKEN)) || ''; } catch (e) { return ''; }
  }
  function gravarToken(t, lembrar) {
    try {
      if (sessao) sessao.removeItem(CHAVE_TOKEN);
      if (local) local.removeItem(CHAVE_TOKEN);
      if (!t) return;
      var alvo = lembrar ? local : sessao;
      if (alvo) alvo.setItem(CHAVE_TOKEN, t);
    } catch (e) { /* ignora */ }
  }

  /* --------------------------------------------------------- utilidades */
  function aviso(el, tipo, html) {
    el.hidden = !html;
    el.className = 'aviso ' + (tipo || 'info');
    el.innerHTML = html || '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lista(itens) { return '<ul>' + itens.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function corGrupo(g) {
    var h = 0, s = String(g).trim().toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return CORES_GRUPO[h % CORES_GRUPO.length];
  }
  function regrasSorteio() {
    return {
      permitirMesmoGrupo: !estado.regras.grupo,
      permitirAutossorteio: !estado.regras.auto,
      correnteUnica: !!estado.regras.corrente
    };
  }
  function mudouDados() { idPedido = null; salvar(); }

  /* --------------------------------------------------------- navegação */
  function irPara(n) {
    n = Number(n);
    estado.etapa = n;
    $$('.etapa').forEach(function (s) { s.hidden = Number(s.dataset.etapa) !== n; });
    $$('#passos button').forEach(function (b) {
      var k = Number(b.dataset.ir);
      if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.classList.toggle('feito', k < n);
    });
    if (n === 4) atualizarViabilidade();
    if (n === 5) atualizarResumo();
    if (n <= 5) salvar();
    var titulo = $('.etapa[data-etapa="' + n + '"] h2');
    if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ir]');
    if (b) irPara(b.dataset.ir);
  });

  /* ------------------------------------------------------------- tema */
  function aplicarTema(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  $('#tema').addEventListener('click', function () {
    var atual = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var novo = atual === 'dark' ? 'light' : 'dark';
    aplicarTema(novo);
    try { local && local.setItem(CHAVE_TEMA, novo); } catch (e) { /* ignora */ }
  });

  /* ------------------------------------------------- 1. conectar Gmail */
  var URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/(exec|dev)$/;

  function urlValida() {
    var u = $('#url').value.trim();
    if (!u) return 'Cole a URL do App da Web.';
    if (/\/dev$/.test(u)) return 'Essa é a URL de teste (/dev). Use a URL de implantação, que termina em /exec.';
    if (!URL_RE.test(u)) return 'A URL deve ser parecida com https://script.google.com/macros/s/…/exec';
    return '';
  }

  function chamar(acao, extra) {
    var corpo = Object.assign({ acao: acao, token: $('#token').value.trim() }, extra || {});
    // Corpo em texto puro = requisição "simples" (sem preflight CORS), aceita pelo Apps Script.
    return fetch($('#url').value.trim(), { method: 'POST', body: JSON.stringify(corpo), redirect: 'follow' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) {
        if (e instanceof SyntaxError || /HTTP|fetch|network|Failed/i.test(String(e)))
          throw new Error('Não consegui falar com o script. Confira se a URL termina em /exec e se a implantação está com acesso "Qualquer pessoa".');
        throw e;
      });
  }

  function marcarConexao(ok, info) {
    conexao.ok = ok;
    if (info) { conexao.cota = info.cota; conexao.remetente = info.remetente || ''; }
    $('#email-teste').disabled = !ok;
    atualizarBotaoSortear();
  }

  $('#testar').addEventListener('click', function () {
    var st = $('#status-conexao'), erro = urlValida();
    if (erro) return aviso(st, 'erro', esc(erro));
    if (!$('#token').value.trim()) return aviso(st, 'erro', 'Cole o token gerado pela função <code>gerarToken</code>.');
    estado.url = $('#url').value.trim();
    gravarToken($('#token').value.trim(), $('#lembrar').checked);
    salvar();
    aviso(st, 'info', 'Testando…');
    chamar('ping').then(function (r) {
      if (!r.ok) { marcarConexao(false); return aviso(st, 'erro', esc(r.erro)); }
      marcarConexao(true, r);
      aviso(st, 'ok', '✓ Conectado' + (r.remetente ? ' como <strong>' + esc(r.remetente) + '</strong>' : '') +
        '. Você ainda pode enviar <strong>' + esc(r.cota) + '</strong> e-mails hoje.');
    }).catch(function (e) { marcarConexao(false); aviso(st, 'erro', esc(e.message)); });
  });

  $('#email-teste').addEventListener('click', function () {
    var st = $('#status-conexao');
    aviso(st, 'info', 'Enviando…');
    chamar('teste', { logoUrl: urlLogo() }).then(function (r) {
      if (!r.ok) return aviso(st, 'erro', esc(r.erro));
      conexao.cota = r.cota;
      aviso(st, 'ok', '✓ E-mail de teste enviado para <strong>' + esc(r.para) + '</strong>. Confira sua caixa de entrada.');
    }).catch(function (e) { aviso(st, 'erro', esc(e.message)); });
  });

  $('#esquecer').addEventListener('click', function () {
    $('#token').value = '';
    $('#url').value = '';
    estado.url = '';
    gravarToken('');
    salvar();
    marcarConexao(false);
    aviso($('#status-conexao'), 'info', 'URL e token apagados deste navegador.');
  });

  $('#ver-token').addEventListener('click', function () {
    var t = $('#token');
    t.type = t.type === 'password' ? 'text' : 'password';
  });
  $('#url').addEventListener('change', function () { estado.url = this.value.trim(); salvar(); marcarConexao(false); });
  $('#token').addEventListener('change', function () { gravarToken(this.value.trim(), $('#lembrar').checked); marcarConexao(false); });
  $('#lembrar').addEventListener('change', function () { gravarToken($('#token').value.trim(), this.checked); });

  $('#copiar-script').addEventListener('click', function () {
    var btn = this;
    Promise.all(['apps-script/Code.gs', 'apps-script/Sorteio.gs'].map(function (u) {
      return fetch(u).then(function (r) { if (!r.ok) throw new Error(); return r.text(); });
    })).then(function (t) {
      var codigo = t[0] + '\n\n/* ======== Sorteio.gs (algoritmo) ======== */\n\n' + t[1];
      return navigator.clipboard.writeText(codigo);
    }).then(function () {
      btn.textContent = '✓ Copiado!';
      setTimeout(function () { btn.textContent = 'Copiar código'; }, 2500);
    }).catch(function () {
      btn.textContent = 'Não deu — use os botões de baixar';
    });
  });

  function urlLogo() {
    var u = new URL('assets/dragao.png', location.href).href;
    return /^https:/.test(u) ? u : '';
  }

  /* -------------------------------------------------------- 2. evento */
  Object.keys(estado.evento).forEach(function (k) {
    var el = $('#ev-' + k);
    el.addEventListener('input', function () { estado.evento[k] = el.value; salvar(); });
  });

  /* ------------------------------------------------- 3. participantes */
  function normaliza(s) {
    return String(s).trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }

  function parseCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    var primeira = texto.split(/\r?\n/)[0] || '';
    var sep = [';', ',', '\t'].reduce(function (a, b) {
      return primeira.split(b).length > primeira.split(a).length ? b : a;
    }, ',');
    var linhas = [], linha = [], campo = '', aspas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    linhas = linhas.filter(function (l) { return l.some(function (c) { return c.trim(); }); });
    if (!linhas.length) return [];

    var nomes = {
      nome: ['nome', 'name', 'participante'],
      email: ['email', 'e-mail', 'mail', 'e_mail'],
      grupo: ['grupo', 'familia', 'grupo familiar', 'group', 'nucleo']
    };
    var cab = linhas[0].map(normaliza), idx = {};
    Object.keys(nomes).forEach(function (k) {
      cab.forEach(function (c, i) { if (nomes[k].indexOf(c) >= 0) idx[k] = i; });
    });
    var corpo = linhas.slice(1);
    if (idx.nome === undefined || idx.email === undefined) { idx = { nome: 0, email: 1, grupo: 2 }; corpo = linhas; }
    return corpo.map(function (l) {
      var col = function (k) { return idx[k] !== undefined && l[idx[k]] !== undefined ? l[idx[k]].trim() : ''; };
      return { nome: col('nome'), email: col('email'), grupo: col('grupo') };
    });
  }

  function importarArquivo(arq) {
    var st = $('#status-lista');
    if (!arq) return;
    if (arq.size > 1024 * 1024) return aviso(st, 'erro', 'Arquivo grande demais (máx. 1 MB).');
    if (/\.xlsx?$/i.test(arq.name)) return aviso(st, 'erro', 'Salve a planilha como <strong>CSV UTF-8</strong> (Arquivo → Salvar como) e importe de novo.');
    arq.text().then(function (texto) {
      var novos = parseCSV(texto);
      if (!novos.length) return aviso(st, 'erro', 'Não encontrei participantes nesse arquivo.');
      if (estado.participantes.length &&
        !confirm('Já existem ' + estado.participantes.length + ' participantes.\n\nOK = substituir a lista\nCancelar = adicionar ao final')) {
        estado.participantes = estado.participantes.concat(novos);
      } else {
        estado.participantes = novos;
      }
      mudouDados();
      renderLista();
      aviso(st, 'ok', '✓ ' + novos.length + ' participantes importados de <strong>' + esc(arq.name) + '</strong>. Confira abaixo (dá para editar clicando).');
    });
  }

  $('#arquivo').addEventListener('change', function () { importarArquivo(this.files[0]); this.value = ''; });
  var zona = $('#soltar');
  ['dragenter', 'dragover'].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('arrastando'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('arrastando'); });
  });
  zona.addEventListener('drop', function (e) { importarArquivo(e.dataTransfer.files[0]); });

  $('#form-pessoa').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = { nome: $('#p-nome').value.trim(), email: $('#p-email').value.trim(), grupo: $('#p-grupo').value.trim() };
    var st = $('#status-lista');
    if (!Sorteio.EMAIL_RE.test(p.email)) return aviso(st, 'erro', 'E-mail inválido.');
    var repetido = estado.participantes.some(function (q) {
      return normaliza(q.nome) === normaliza(p.nome) && q.email.toLowerCase() === p.email.toLowerCase();
    });
    if (repetido) return aviso(st, 'alerta', esc(p.nome) + ' já está na lista.');
    estado.participantes.push(p);
    mudouDados();
    renderLista();
    aviso(st, '', '');
    $('#p-nome').value = ''; $('#p-email').value = '';
    $('#p-nome').focus();
  });

  $('#limpar-lista').addEventListener('click', function () {
    if (!estado.participantes.length || !confirm('Apagar todos os ' + estado.participantes.length + ' participantes?')) return;
    estado.participantes = [];
    mudouDados();
    renderLista();
  });

  function celula(tr, valor, campo, i, comoChip) {
    var td = document.createElement('td');
    var alvo = td;
    if (comoChip) {
      alvo = document.createElement('span');
      alvo.className = valor ? 'chip' : 'chip sem';
      if (valor) alvo.style.background = corGrupo(valor);
      td.appendChild(alvo);
    }
    alvo.textContent = valor || (comoChip ? 'sem grupo' : '');
    alvo.contentEditable = 'plaintext-only';
    if (alvo.contentEditable !== 'plaintext-only') alvo.contentEditable = 'true';
    alvo.setAttribute('aria-label', campo + ' de ' + (estado.participantes[i].nome || 'participante ' + (i + 1)));
    alvo.spellcheck = false;
    if (campo === 'email' && !Sorteio.EMAIL_RE.test(valor)) td.classList.add('invalido');
    alvo.addEventListener('focus', function () { if (comoChip && !estado.participantes[i].grupo) alvo.textContent = ''; });
    alvo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); alvo.blur(); } });
    alvo.addEventListener('blur', function () {
      var novo = alvo.textContent.trim();
      if (novo !== estado.participantes[i][campo]) {
        estado.participantes[i][campo] = novo;
        mudouDados();
      }
      renderLista();
    });
    tr.appendChild(td);
  }

  function renderLista() {
    var tbody = $('#tabela tbody'), ps = estado.participantes;
    tbody.innerHTML = '';
    ps.forEach(function (p, i) {
      var tr = document.createElement('tr');
      var n = document.createElement('td'); n.textContent = i + 1; tr.appendChild(n);
      celula(tr, p.nome, 'nome', i);
      celula(tr, p.email, 'email', i);
      celula(tr, p.grupo, 'grupo', i, true);
      var td = document.createElement('td');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'remover'; b.textContent = '✕';
      b.setAttribute('aria-label', 'Remover ' + p.nome);
      b.addEventListener('click', function () { ps.splice(i, 1); mudouDados(); renderLista(); });
      td.appendChild(b); tr.appendChild(td);
      tbody.appendChild(tr);
    });
    $('#vazio').hidden = ps.length > 0;
    var grupos = gruposContagem();
    $('#contagem').textContent = ps.length ? ps.length + ' participante(s) · ' + Object.keys(grupos).length + ' grupo(s)' : '';
    $('#grupos').innerHTML = Object.keys(grupos).map(function (g) { return '<option value="' + esc(grupos[g].rotulo) + '">'; }).join('');
    atualizarBotaoSortear();
  }

  function gruposContagem() {
    var g = {};
    estado.participantes.forEach(function (p) {
      var k = String(p.grupo || '').trim().toLowerCase();
      if (!k) return;
      g[k] = g[k] || { rotulo: p.grupo.trim(), n: 0 };
      g[k].n++;
    });
    return g;
  }

  /* ------------------------------------------------------- 4. regras */
  function sincronizarRegras() {
    $('#r-grupo').checked = estado.regras.grupo;
    $('#r-auto').checked = estado.regras.grupo || estado.regras.auto;
    $('#r-auto').disabled = estado.regras.grupo;
    $('#r-auto-dica').textContent = estado.regras.grupo
      ? 'Já garantido pela regra de grupo acima.'
      : 'Se desligado, alguém pode tirar o próprio nome.';
    $('#r-corrente').checked = estado.regras.corrente;
  }
  $('#r-grupo').addEventListener('change', function () { estado.regras.grupo = this.checked; sincronizarRegras(); mudouDados(); atualizarViabilidade(); });
  $('#r-auto').addEventListener('change', function () { estado.regras.auto = this.checked; mudouDados(); atualizarViabilidade(); });
  $('#r-corrente').addEventListener('change', function () { estado.regras.corrente = this.checked; mudouDados(); atualizarViabilidade(); });

  function verificar() { return Sorteio.verificar(estado.participantes, regrasSorteio()); }

  function atualizarViabilidade() {
    var v = verificar(), el = $('#viabilidade'), n = estado.participantes.length, grupos = gruposContagem();
    var html, tipo;
    if (v.viavel) {
      tipo = 'ok';
      html = '✓ Sorteio possível com ' + n + ' participantes.';
      if (estado.regras.grupo && !Object.keys(grupos).length) {
        tipo = 'alerta';
        html += ' Nenhum grupo foi informado, então a regra de grupo não muda nada.';
      }
      if (estado.regras.corrente) html += ' A corrente única é testada no momento do sorteio.';
      if (v.avisos.length) { tipo = 'alerta'; html += lista(v.avisos); }
    } else {
      tipo = 'erro';
      html = '✗ Ainda não dá para sortear:' + lista(v.erros);
    }
    el.innerHTML = '<div class="aviso ' + tipo + '">' + html + '</div>';

    var res = $('#grupos-resumo');
    res.innerHTML = '';
    Object.keys(grupos).sort(function (a, b) { return grupos[b].n - grupos[a].n; }).forEach(function (k) {
      var g = grupos[k], pct = n ? Math.round(100 * g.n / n) : 0;
      var div = document.createElement('div');
      div.className = 'barra-grupo';
      div.innerHTML = '<span></span><span class="trilha"><i></i></span><span>' + g.n + '</span>';
      div.firstChild.textContent = g.rotulo;
      div.querySelector('i').style.width = pct + '%';
      div.querySelector('i').style.background = g.n > n - g.n && estado.regras.grupo ? 'var(--erro)' : corGrupo(g.rotulo);
      res.appendChild(div);
    });
    atualizarBotaoSortear();
  }

  /* ------------------------------------------------------ 5. sortear */
  function atualizarResumo() {
    var n = estado.participantes.length, grupos = Object.keys(gruposContagem()).length;
    var regras = [];
    if (estado.regras.grupo) regras.push('sem tirar do próprio grupo');
    else if (estado.regras.auto) regras.push('ninguém se tira');
    else regras.push('pode se tirar');
    if (estado.regras.corrente) regras.push('corrente única');
    var cartoes = [
      [n, 'participantes'],
      [grupos, 'grupos familiares'],
      [conexao.cota == null ? '?' : conexao.cota, 'e-mails disponíveis hoje'],
      [regras.join(' · '), 'regras']
    ];
    $('#resumo').innerHTML = cartoes.map(function (c) {
      return '<div class="cartao"><b' + (String(c[0]).length > 6 ? ' style="font-size:1rem"' : '') + '>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>';
    }).join('');

    var st = $('#status-sorteio'), v = verificar(), problemas = [];
    if (!conexao.ok) problemas.push('Conecte o seu Gmail no passo 1 e clique em “Testar conexão”.');
    if (!v.viavel) problemas = problemas.concat(v.erros);
    if (conexao.ok && conexao.cota != null && conexao.cota < n) problemas.push('Sua cota diária de e-mails (' + conexao.cota + ') é menor que o número de participantes.');
    if (problemas.length) aviso(st, 'alerta', 'Antes de sortear:' + lista(problemas));
    else aviso(st, '', '');
    atualizarBotaoSortear();
  }

  function atualizarBotaoSortear() {
    var pronto = conexao.ok && $('#confirmo').checked && verificar().viavel;
    $('#sortear').disabled = !pronto;
  }
  $('#confirmo').addEventListener('change', atualizarBotaoSortear);

  $('#sortear').addEventListener('click', function () {
    var btn = this, st = $('#status-sorteio'), n = estado.participantes.length;
    if (!confirm('Sortear agora e enviar ' + n + ' e-mails? Não dá para desfazer.')) return;
    btn.disabled = true;
    idPedido = idPedido || uuid();
    aviso(st, 'info', '🎲 Sorteando e enviando ' + n + ' e-mails… isso pode levar até um minuto. Não feche a página.');
    chamar('sortear', {
      idPedido: idPedido,
      participantes: estado.participantes,
      regras: regrasSorteio(),
      evento: Object.assign({}, estado.evento, { nome: estado.evento.nome.trim() || 'Amigo Secreto' }),
      logoUrl: urlLogo()
    }).then(function (r) {
      if (r.cota != null) conexao.cota = r.cota;
      if (!r.ok) {
        btn.disabled = false;
        if (!r.enviados) idPedido = null; // nada saiu: pode tentar de novo com um sorteio novo
        return aviso(st, 'erro', esc(r.erro || 'Algo deu errado.'));
      }
      idPedido = null;
      $('#confirmo').checked = false;
      estado.etapa = 1; // ao reabrir a página, volta ao início (a lista continua salva)
      salvar();
      $('#msg-sucesso').textContent = r.enviados + ' e-mails enviados. Ainda restam ' + r.cota + ' e-mails na sua cota de hoje.';
      irPara(6);
    }).catch(function (e) {
      btn.disabled = false;
      aviso(st, 'erro', esc(e.message) + ' Se você tentar de novo, o mesmo pedido será reaproveitado (sem e-mails duplicados).');
    });
  });

  /* ------------------------------------------------------------ início */
  carregar();
  try { aplicarTema(local && local.getItem(CHAVE_TEMA)); } catch (e) { /* ignora */ }
  $('#url').value = estado.url;
  $('#token').value = lerToken();
  try { $('#lembrar').checked = !!(local && local.getItem(CHAVE_TOKEN)); } catch (e) { /* ignora */ }
  Object.keys(estado.evento).forEach(function (k) { $('#ev-' + k).value = estado.evento[k] || ''; });
  if (!estado.url) $('#tutorial').open = true;
  if (estado.url && $('#token').value && !urlValida()) {
    chamar('ping').then(function (r) { if (r.ok) marcarConexao(true, r); }).catch(function () { /* testa manualmente */ });
  }
  sincronizarRegras();
  renderLista();
  irPara(estado.etapa > 5 ? 1 : estado.etapa);
})();
