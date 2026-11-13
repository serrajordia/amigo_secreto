/* Interface do Amigo Secreto. Dois modos: "rápido" (links individuais) e "e-mail" (planilha Google). Sem dependências. */
(function () {
  'use strict';

  var CHAVE_DADOS = 'amigoSecreto.v2';
  var CHAVE_LINKS = 'amigoSecreto.links';
  var CHAVE_TEMA = 'amigoSecreto.tema';
  var CORES_GRUPO = ['#0071BC', '#29ABE2', '#3D4653', '#71798A', '#1B7F86', '#6D4DB0', '#B8561B', '#2E7D32', '#A0306E', '#4A5DC4'];
  var OPCOES = { exigirEmail: false }; // no modo rápido o e-mail é opcional

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ------------------------------------------------------------ estado */
  var estado = {
    evento: { nome: '', dataFesta: '', local: '', valor: '', organizador: '', mensagem: '' },
    participantes: [],
    regras: { grupo: true, auto: true, corrente: false },
    etapa: '0'
  };
  var links = []; // resultado do sorteio: só na aba (sessionStorage), nunca em localStorage

  function armazenamento(tipo) {
    try { var s = window[tipo]; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch (e) { return null; }
  }
  var local = armazenamento('localStorage');
  var sessao = armazenamento('sessionStorage');

  function carregar() {
    try {
      var d = local && JSON.parse(local.getItem(CHAVE_DADOS) || 'null');
      if (d) {
        Object.assign(estado.evento, d.evento || {});
        estado.participantes = Array.isArray(d.participantes) ? d.participantes : [];
        Object.assign(estado.regras, d.regras || {});
        estado.etapa = String(d.etapa || '0');
      }
    } catch (e) { /* dados corrompidos: começa do zero */ }
    try { links = (sessao && JSON.parse(sessao.getItem(CHAVE_LINKS) || '[]')) || []; } catch (e) { links = []; }
  }
  function salvar() {
    try { local && local.setItem(CHAVE_DADOS, JSON.stringify(estado)); } catch (e) { /* cheio/bloqueado */ }
  }
  function salvarLinks() {
    try { sessao && sessao.setItem(CHAVE_LINKS, JSON.stringify(links)); } catch (e) { /* ignora */ }
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
  function verificar() { return Sorteio.verificar(estado.participantes, regrasSorteio(), OPCOES); }
  function mudouDados() { salvar(); }

  /* --------------------------------------------------------- navegação */
  function irPara(n) {
    n = String(n);
    if (n === '5' && !links.length) n = '4';
    estado.etapa = n;
    $$('.etapa').forEach(function (s) { s.hidden = s.dataset.etapa !== n; });
    var passo = /^[1-5]$/.test(n) ? Number(n) : 0;
    $('#nav-passos').hidden = !passo;
    $('#trocar').hidden = n === '0';
    $$('#passos button').forEach(function (b) {
      var k = Number(b.dataset.ir);
      if (k === passo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.classList.toggle('feito', passo && k < passo);
    });
    if (n === '3') atualizarViabilidade();
    if (n === '4') atualizarResumo();
    if (n === '5') renderEnvios();
    salvar();
    var titulo = $('.etapa[data-etapa="' + n + '"] h2');
    if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var m = e.target.closest('[data-modo]');
    if (m) return irPara(m.dataset.modo === 'email' ? 'email' : '1');
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

  /* ------------------------------------------------ modo e-mail (guia) */
  (function () {
    var url = (window.AMIGO_CONFIG && window.AMIGO_CONFIG.planilhaModeloUrl) || '';
    var a = $('#link-planilha');
    if (/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+\/copy/.test(url)) {
      a.href = url;
    } else {
      a.removeAttribute('href');
      a.classList.add('desativado');
      a.setAttribute('aria-disabled', 'true');
      $('#sem-modelo').hidden = false;
      $('details.tutorial').open = true;
    }
  })();

  $('#copiar-script').addEventListener('click', function () {
    var btn = this;
    Promise.all(['apps-script/Planilha.gs', 'apps-script/Sorteio.gs'].map(function (u) {
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

  /* -------------------------------------------------------- 1. evento */
  Object.keys(estado.evento).forEach(function (k) {
    var el = $('#ev-' + k);
    el.addEventListener('input', function () { estado.evento[k] = el.value; salvar(); });
  });

  /* ------------------------------------------------- 2. participantes */
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
    return mapear(linhas);
  }

  // Converte linhas (matriz de células) em participantes; serve para CSV e Excel.
  function mapear(linhas) {
    linhas = linhas.map(function (l) { return l.map(function (c) { return c == null ? '' : String(c); }); })
      .filter(function (l) { return l.some(function (c) { return c.trim(); }); });
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
    if (idx.nome === undefined) { idx = { nome: 0, email: 1, grupo: 2 }; corpo = linhas; } // sem cabeçalho
    return corpo.map(function (l) {
      var col = function (k) { return idx[k] !== undefined && l[idx[k]] !== undefined ? l[idx[k]].trim() : ''; };
      return { nome: col('nome'), email: col('email'), grupo: col('grupo') };
    });
  }

  // Excel: a biblioteca (SheetJS, hospedada aqui mesmo) só é carregada quando alguém envia .xlsx/.xls.
  var carregandoXlsx = null;
  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!carregandoXlsx) carregandoXlsx = new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = 'js/vendor/xlsx.full.min.js';
      s.onload = function () { ok(window.XLSX); };
      s.onerror = function () { carregandoXlsx = null; falha(new Error('biblioteca')); };
      document.head.appendChild(s);
    });
    return carregandoXlsx;
  }

  function linhasDeExcel(arq) {
    return Promise.all([carregarXlsx(), arq.arrayBuffer()]).then(function (r) {
      var m = new Uint8Array(r[1].slice(0, 4));
      var zip = m[0] === 0x50 && m[1] === 0x4B, ole = m[0] === 0xD0 && m[1] === 0xCF; // .xlsx = zip, .xls = OLE
      if (!zip && !ole) throw new Error('formato');
      var wb = r[0].read(r[1], { type: 'array' });
      // usa a primeira aba que tiver conteúdo
      for (var i = 0; i < wb.SheetNames.length; i++) {
        var linhas = r[0].utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: false, defval: '' });
        if (linhas.some(function (l) { return l.some(function (c) { return String(c).trim(); }); })) return linhas;
      }
      return [];
    });
  }

  function importarArquivo(arq) {
    var st = $('#status-lista');
    if (!arq) return;
    if (arq.size > 5 * 1024 * 1024) return aviso(st, 'erro', 'Arquivo grande demais (máx. 5 MB).');
    var excel = /\.xlsx?$/i.test(arq.name);
    var lido = excel
      ? linhasDeExcel(arq).then(mapear)
      : arq.text().then(parseCSV);
    lido.then(function (novos) {
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
    }).catch(function () {
      aviso(st, 'erro', excel
        ? 'Não consegui ler essa planilha. Tente salvá-la de novo como .xlsx ou como CSV.'
        : 'Não consegui ler esse arquivo.');
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
    if (!p.nome) return aviso(st, 'erro', 'Informe o nome.');
    if (p.email && !Sorteio.EMAIL_RE.test(p.email)) return aviso(st, 'erro', 'E-mail inválido (ou deixe em branco).');
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
    if (campo === 'email' && valor && !Sorteio.EMAIL_RE.test(valor)) td.classList.add('invalido');
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

  /* ------------------------------------------------------- 3. regras */
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

  /* ------------------------------------------------------ 4. sortear */
  function atualizarResumo() {
    var n = estado.participantes.length, grupos = Object.keys(gruposContagem()).length;
    var regras = [];
    if (estado.regras.grupo) regras.push('sem tirar do próprio grupo');
    else if (estado.regras.auto) regras.push('ninguém se tira');
    else regras.push('pode se tirar');
    if (estado.regras.corrente) regras.push('corrente única');
    var cartoes = [[n, 'participantes'], [grupos, 'grupos familiares'], [regras.join(' · '), 'regras']];
    $('#resumo').innerHTML = cartoes.map(function (c) {
      return '<div class="cartao"><b' + (String(c[0]).length > 6 ? ' style="font-size:1rem"' : '') + '>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>';
    }).join('');

    var v = verificar(), st = $('#status-sorteio');
    if (!v.viavel) aviso(st, 'alerta', 'Antes de sortear:' + lista(v.erros));
    else if (v.avisos.length) aviso(st, 'alerta', lista(v.avisos));
    else aviso(st, '', '');
    atualizarBotaoSortear();
  }

  function atualizarBotaoSortear() {
    $('#sortear').disabled = !($('#confirmo').checked && verificar().viavel);
  }
  $('#confirmo').addEventListener('change', atualizarBotaoSortear);

  function paginaDeRevelacao() {
    var u = new URL('ver.html', location.href);
    u.hash = ''; u.search = '';
    return u.href;
  }

  $('#sortear').addEventListener('click', function () {
    var st = $('#status-sorteio'), ps = estado.participantes;
    if (links.length && !confirm('Já existe um sorteio nesta aba. Sortear de novo invalida os links anteriores. Continuar?')) return;
    var destino;
    try {
      destino = Sorteio.sortear(ps, regrasSorteio(), undefined, OPCOES);
    } catch (e) {
      return aviso(st, 'erro', esc(e.message));
    }
    var base = paginaDeRevelacao();
    links = ps.map(function (p, i) {
      return { nome: p.nome, email: p.email, enviado: false, url: Link.criar(base, p.nome, ps[destino[i]].nome, estado.evento) };
    });
    destino = null; // o resultado só existe, daqui em diante, dentro dos links
    salvarLinks();
    $('#confirmo').checked = false;
    irPara('5');
  });

  /* ------------------------------------------------- 5. enviar links */
  function textoMensagem(l) {
    var ev = estado.evento.nome.trim();
    return 'Oi, ' + l.nome + '! 🎁 Seu amigo secreto' + (ev ? ' do ' + ev : '') +
      ' já foi sorteado. Toque no link para revelar (só você deve abrir):\n' + l.url;
  }

  function marcarEnviado(i) {
    if (!links[i].enviado) { links[i].enviado = true; salvarLinks(); atualizarProgresso(); marcarLinha(i); }
  }
  function marcarLinha(i) {
    var li = $('#envios').children[i];
    if (!li) return;
    li.classList.toggle('enviado', links[i].enviado);
    li.querySelector('input[type=checkbox]').checked = links[i].enviado;
  }
  function atualizarProgresso() {
    var ok = links.filter(function (l) { return l.enviado; }).length;
    $('#progresso').textContent = ok + ' de ' + links.length + ' enviados' + (ok === links.length ? ' — tudo pronto! 🎉' : '');
  }

  function botao(texto, classe) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-sec btn-pequeno ' + (classe || ''); b.textContent = texto;
    return b;
  }
  function ancora(texto, href) {
    var a = document.createElement('a');
    a.className = 'btn btn-sec btn-pequeno'; a.textContent = texto; a.href = href; a.target = '_blank'; a.rel = 'noopener';
    return a;
  }

  function renderEnvios() {
    var ul = $('#envios');
    ul.innerHTML = '';
    links.forEach(function (l, i) {
      var li = document.createElement('li');
      var nome = document.createElement('span'); nome.className = 'nome'; nome.textContent = l.nome;
      var acoes = document.createElement('span'); acoes.className = 'acoes';

      var wa = ancora('WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(textoMensagem(l)));
      wa.addEventListener('click', function () { marcarEnviado(i); });
      acoes.appendChild(wa);

      if (l.email) {
        var assunto = '🎁 ' + (estado.evento.nome.trim() || 'Amigo Secreto');
        var em = ancora('E-mail', 'mailto:' + encodeURIComponent(l.email) + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(textoMensagem(l)));
        em.removeAttribute('target');
        em.addEventListener('click', function () { marcarEnviado(i); });
        acoes.appendChild(em);
      }

      var cp = botao('Copiar link');
      cp.addEventListener('click', function () {
        navigator.clipboard.writeText(l.url).then(function () {
          cp.textContent = '✓ Copiado'; marcarEnviado(i);
          setTimeout(function () { cp.textContent = 'Copiar link'; }, 2000);
        }).catch(function () { cp.textContent = 'Não deu'; });
      });
      acoes.appendChild(cp);

      if (navigator.share) {
        var sh = botao('Compartilhar');
        sh.addEventListener('click', function () {
          navigator.share({ title: 'Amigo secreto', text: textoMensagem(l) }).then(function () { marcarEnviado(i); }).catch(function () { /* cancelado */ });
        });
        acoes.appendChild(sh);
      }

      var lab = document.createElement('label'); lab.className = 'marca-enviado';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = l.enviado;
      cb.addEventListener('change', function () { links[i].enviado = cb.checked; salvarLinks(); atualizarProgresso(); marcarLinha(i); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' enviado'));

      li.appendChild(nome); li.appendChild(acoes); li.appendChild(lab);
      li.classList.toggle('enviado', l.enviado);
      ul.appendChild(li);
    });
    atualizarProgresso();
  }

  $('#refazer').addEventListener('click', function () {
    if (!confirm('Descartar este sorteio? Os links já enviados deixam de valer e você precisará sortear e enviar tudo de novo.')) return;
    links = [];
    salvarLinks();
    irPara('4');
  });

  /* ------------------------------------------------------------ início */
  carregar();
  try { aplicarTema(local && local.getItem(CHAVE_TEMA)); } catch (e) { /* ignora */ }
  Object.keys(estado.evento).forEach(function (k) { $('#ev-' + k).value = estado.evento[k] || ''; });
  sincronizarRegras();
  renderLista();
  irPara(links.length ? '5' : (['0', 'email', '1', '2', '3', '4'].indexOf(estado.etapa) >= 0 ? estado.etapa : '0'));
})();
