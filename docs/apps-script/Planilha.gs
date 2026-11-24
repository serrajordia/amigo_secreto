/**
 * Amigo Secreto — modo "por e-mail", dentro de uma Planilha Google.
 *
 * Este script mora DENTRO da planilha (não precisa de implantação, URL nem token).
 * Quem faz uma cópia da planilha modelo leva o script junto; os e-mails saem do Gmail
 * de quem usa a cópia.
 *
 * Arquivos do projeto (cole os dois no editor de scripts da planilha):
 *   Planilha.gs  (este)  +  Sorteio.gs (algoritmo, igual ao usado pelo site)
 *
 * Privacidade: o resultado do sorteio nunca é gravado na planilha nem em log. Se o organizador
 * pedir um código de recuperação, o sorteio pode ser refeito (código + mesma lista) para
 * reenviar o e-mail de quem perder; sem o código, ninguém consegue refazê-lo.
 * Permissões pedidas ao Google: enviar e-mail e ver/editar SÓ esta planilha.
 *
 * @OnlyCurrentDoc
 */

var ABA_PARTICIPANTES = 'Participantes';
var ABA_CONFIG = 'Evento e regras';
var ABA_AJUDA = 'Como usar';
var LOGO_URL = 'https://serrajordia.github.io/amigo_secreto/assets/dragao.png';
var MAX_PARTICIPANTES = 100;

// Posição das células na aba "Evento e regras" (coluna B)
var LINHA_EVENTO = { nome: 2, dataFesta: 3, local: 4, valor: 5, organizador: 6, mensagem: 7 };
var LINHA_REGRA = { grupo: 10, auto: 11, corrente: 12 };

var COR = { azulClaro: '#29ABE2', azul: '#0071BC', cinza: '#71798A', grafite: '#3D4653' };

/* ------------------------------------------------------------------ menu */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎁 Amigo Secreto')
    .addItem('1. Preparar planilha (só na primeira vez)', 'preparar')
    .addSeparator()
    .addItem('2. Verificar participantes e regras', 'menuVerificar')
    .addItem('3. Enviar e-mail de teste para mim', 'menuTeste')
    .addSeparator()
    .addItem('🎲 4. Sortear e enviar e-mails', 'menuSortear')
    .addSeparator()
    .addItem('↻ Reenviar o e-mail de uma pessoa (com o código)', 'menuReenviar')
    .addToUi();
}

/** Cria as abas e as caixinhas de regras. Pode ser rodada de novo sem apagar o que você digitou. */
function preparar() {
  var ss = SpreadsheetApp.getActive();

  var p = ss.getSheetByName(ABA_PARTICIPANTES) || ss.insertSheet(ABA_PARTICIPANTES);
  p.getRange('A1:C1').setValues([['Nome', 'E-mail', 'Grupo familiar (opcional)']])
    .setFontWeight('bold').setBackground(COR.azul).setFontColor('#ffffff');
  p.setFrozenRows(1);
  p.setColumnWidths(1, 1, 220); p.setColumnWidths(2, 1, 280); p.setColumnWidths(3, 1, 220);

  var c = ss.getSheetByName(ABA_CONFIG) || ss.insertSheet(ABA_CONFIG);
  var pronta = String(c.getRange('A1').getValue()).indexOf('Evento') === 0;
  if (!pronta) {
    c.getRange('A1:B1').setValues([['Evento (vai no e-mail; não afeta o sorteio)', '']]);
    c.getRange('A2:A7').setValues([
      ['Nome do evento'], ['Data e hora da festa'], ['Local'], ['Valor sugerido do presente'],
      ['Organização (seu nome)'], ['Recado para todos']
    ]);
    c.getRange('B2').setValue('Amigo Secreto');
    c.getRange('A9:B9').setValues([['Regras do sorteio (marque ou desmarque)', '']]);
    c.getRange('A10:A12').setValues([
      ['Ninguém tira alguém do próprio grupo familiar'],
      ['Ninguém tira a si mesmo'],
      ['Corrente única (uma roda só: A→B→C→…→A)']
    ]);
    c.getRange('B10:B12').insertCheckboxes().setValues([[true], [true], [false]]);
    c.getRangeList(['A1:B1', 'A9:B9']).setFontWeight('bold').setBackground(COR.azul).setFontColor('#ffffff');
    c.getRange('B2:B7').setBackground('#EAF4FB');
    c.setColumnWidths(1, 1, 380); c.setColumnWidths(2, 1, 380);
    c.getRange('B2:B7').setWrap(true);
  }

  var a = ss.getSheetByName(ABA_AJUDA) || ss.insertSheet(ABA_AJUDA, 0);
  a.clear();
  a.getRange('A1:A12').setValues([
    ['🎁 Amigo Secreto — como usar'],
    [''],
    ['1. Aba "' + ABA_PARTICIPANTES + '": uma pessoa por linha (nome, e-mail e, se quiser, o grupo familiar). Quem é do mesmo grupo não se tira.'],
    ['2. Aba "' + ABA_CONFIG + '": preencha os dados da festa e marque as regras.'],
    ['3. Menu "🎁 Amigo Secreto" → "Verificar participantes e regras".'],
    ['4. Menu "🎁 Amigo Secreto" → "Enviar e-mail de teste para mim" (confira se chegou).'],
    ['5. Menu "🎁 Amigo Secreto" → "Sortear e enviar e-mails". Pronto: ninguém vê quem tirou quem, nem você.'],
    [''],
    ['Na primeira vez o Google pede autorização e mostra "app não verificado": clique em Avançado → Acessar (não seguro) → Permitir.'],
    ['Os e-mails saem do SEU Gmail (limite de uns 100 por dia). O menu só aparece no computador, não no aplicativo do celular.'],
    ['Nada do resultado é gravado nesta planilha. Se, ao sortear, você pedir o código de recuperação, guarde-o: com ele dá para reenviar o e-mail de quem perder (menu "Reenviar").'],
    ['Feito com o Amigo Secreto da Mestre dos Dados — github.com/serrajordia/amigo_secreto']
  ]);
  a.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor(COR.azul);
  a.setColumnWidth(1, 900);
  a.getRange('A1:A12').setWrap(true);
  ss.setActiveSheet(a);
  SpreadsheetApp.getUi().alert('Planilha preparada', 'Agora preencha as abas "' + ABA_PARTICIPANTES + '" e "' + ABA_CONFIG + '".', SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ---------------------------------------------------------- leitura dos dados */

function lerDados_() {
  var ss = SpreadsheetApp.getActive();
  var p = ss.getSheetByName(ABA_PARTICIPANTES), c = ss.getSheetByName(ABA_CONFIG);
  if (!p || !c) throw new Error('Rode antes: menu Amigo Secreto → "1. Preparar planilha".');

  var ultima = p.getLastRow(), participantes = [], linhas = [];
  if (ultima >= 2) {
    var vals = p.getRange(2, 1, ultima - 1, 3).getValues();
    vals.forEach(function (l, i) {
      if (!String(l[0]).trim() && !String(l[1]).trim() && !String(l[2]).trim()) return; // linha em branco
      participantes.push({ nome: corta_(l[0], 80), email: corta_(l[1], 120), grupo: corta_(l[2], 60) });
      linhas.push(i + 2);
    });
  }

  var texto = function (chave) { return corta_(c.getRange(LINHA_EVENTO[chave], 2).getValue(), chave === 'mensagem' ? 1000 : 120); };
  var marcada = function (chave) {
    var v = c.getRange(LINHA_REGRA[chave], 2).getValue();
    return v === true || String(v).toUpperCase() === 'TRUE';
  };
  return {
    participantes: participantes,
    linhas: linhas,
    evento: {
      nome: texto('nome') || 'Amigo Secreto', dataFesta: texto('dataFesta'), local: texto('local'),
      valor: texto('valor'), organizador: texto('organizador'), mensagem: texto('mensagem')
    },
    regras: {
      permitirMesmoGrupo: !marcada('grupo'),
      permitirAutossorteio: !marcada('auto'),
      correnteUnica: marcada('corrente')
    }
  };
}

/** Troca "Linha 3" (posição na lista) por "Linha 5" (linha real da planilha). */
function numerosDeLinha_(msg, linhas) {
  return String(msg).replace(/Linha (\d+)/g, function (m, k) { return 'Linha ' + (linhas[Number(k) - 1] || k); });
}

function checar_(d) {
  var v = Sorteio.verificar(d.participantes, d.regras);
  if (d.participantes.length > MAX_PARTICIPANTES) v.erros.push('Máximo de ' + MAX_PARTICIPANTES + ' participantes.');
  v.erros = v.erros.map(function (e) { return numerosDeLinha_(e, d.linhas); });
  v.viavel = v.erros.length === 0;
  return v;
}

/* ---------------------------------------------------------------- ações do menu */

function menuVerificar() {
  var ui = SpreadsheetApp.getUi();
  try {
    var d = lerDados_(), v = checar_(d);
    if (!v.viavel) return ui.alert('Ainda não dá para sortear', '• ' + v.erros.join('\n• '), ui.ButtonSet.OK);
    var msg = '✓ Sorteio possível com ' + d.participantes.length + ' participantes.\nE-mails que ainda posso enviar hoje: ' + MailApp.getRemainingDailyQuota() + '.';
    if (v.avisos.length) msg += '\n\nAtenção:\n• ' + v.avisos.join('\n• ');
    ui.alert('Tudo certo', msg, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Erro', String(e.message || e), ui.ButtonSet.OK);
  }
}

function menuTeste() {
  var ui = SpreadsheetApp.getUi();
  try {
    var para = Session.getEffectiveUser().getEmail();
    MailApp.sendEmail({
      to: para,
      subject: 'Amigo Secreto — teste de conexão',
      body: 'Se você recebeu este e-mail, o envio está funcionando. 🎉',
      htmlBody: cartao_('Teste de conexão', 'Tudo certo!', '<p style="margin:0">A planilha consegue enviar e-mails pelo seu Gmail. 🎉</p>'),
      name: 'Amigo Secreto'
    });
    ui.alert('Teste enviado', 'Enviei um e-mail para ' + para + '. Confira sua caixa de entrada (e o spam).', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Erro', String(e.message || e), ui.ButtonSet.OK);
  }
}

function menuSortear() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return ui.alert('Aguarde', 'Outro sorteio está em andamento nesta planilha.', ui.ButtonSet.OK);
  try {
    var d = lerDados_(), v = checar_(d);
    if (!v.viavel) return ui.alert('Ainda não dá para sortear', '• ' + v.erros.join('\n• '), ui.ButtonSet.OK);

    var n = d.participantes.length, cota = MailApp.getRemainingDailyQuota();
    if (cota < n) return ui.alert('Cota diária insuficiente', 'Restam ' + cota + ' e-mails hoje e você precisa de ' + n + '. Tente amanhã.', ui.ButtonSet.OK);

    var confirmacao = 'Sortear agora e enviar ' + n + ' e-mails? Não dá para desfazer.';
    if (v.avisos.length) confirmacao += '\n\nAtenção:\n• ' + v.avisos.join('\n• ');
    if (ui.alert('Confirmar sorteio', confirmacao, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    var querCodigo = ui.alert('Código de recuperação',
      'Quer um código de recuperação?\n\nCom ele e esta mesma lista (mesma ordem, grupos e regras), dá para reenviar ' +
      'o e-mail de quem perder, pelo menu "Reenviar". Mas quem tiver o código e a planilha consegue descobrir o sorteio inteiro.\n\n' +
      'Sim = gerar o código · Não = sorteio sem volta (ninguém consegue refazer)', ui.ButtonSet.YES_NO) === ui.Button.YES;
    var codigo = '', apelido, data, rnd;
    if (querCodigo) {
      codigo = Sorteio.novoCodigo(d.participantes, d.regras);
      var c = Sorteio.lerCodigo(codigo, d.participantes, d.regras);
      rnd = c.rnd; apelido = c.apelido; data = c.data;
    } else {
      apelido = Sorteio.apelidoAleatorio();
      data = Sorteio.descreverData(Sorteio.carimbo());
    }

    var destino = Sorteio.sortear(d.participantes, d.regras, rnd);
    var falhas = [];
    for (var i = 0; i < n; i++) {
      try { enviarResultado_(d.participantes[i], d.participantes[destino[i]], d.evento, apelido + ' · ' + data); }
      catch (err) { falhas.push(d.participantes[i].nome); }
    }
    var textoCodigo = codigo
      ? '\n\nCÓDIGO DE RECUPERAÇÃO (anote agora, só com você):\n' + codigo + '\n\nNão mude a ordem, os grupos nem as regras na planilha: o código só funciona com a lista igual.'
      : '';
    if (falhas.length) {
      ui.alert('Alguns e-mails falharam',
        'Não consegui enviar para: ' + falhas.join(', ') + '.\n\n' +
        (codigo ? 'Corrija o e-mail dessas pessoas na aba (o e-mail não muda o sorteio) e use o menu "Reenviar" com o código abaixo.'
          : 'Refaça o sorteio para TODOS e avise o pessoal para ignorar o e-mail anterior.') + textoCodigo, ui.ButtonSet.OK);
    } else {
      ui.alert('Sorteio #' + apelido + ' feito! 🎉',
        'Feito em ' + data + '.\n' + n + ' e-mails enviados. Nem você sabe quem tirou quem.\nPeça para todos olharem a caixa de entrada (e o spam).\n\nAinda restam ' + MailApp.getRemainingDailyQuota() + ' e-mails hoje.' + textoCodigo, ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('Erro', String(e.message || e), ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

/** Refaz o sorteio a partir do código e reenvia o e-mail de UMA pessoa. Ninguém vê o resultado na tela. */
function menuReenviar() {
  var ui = SpreadsheetApp.getUi();
  try {
    var d = lerDados_(), v = checar_(d);
    if (!v.viavel) return ui.alert('A lista mudou ou tem erros', '• ' + v.erros.join('\n• '), ui.ButtonSet.OK);

    var r1 = ui.prompt('Reenviar e-mail (1/2)', 'Cole o código de recuperação do sorteio (1-XXXX-XXXX-XXXX-XXXX-XXXX):', ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    var c = Sorteio.lerCodigo(r1.getResponseText(), d.participantes, d.regras);
    if (!c.ok) return ui.alert('Código não confere', c.erro, ui.ButtonSet.OK);

    var r2 = ui.prompt('Reenviar e-mail (2/2)',
      'Nome ou e-mail de quem vai receber de novo.\n(Se o e-mail dessa pessoa estava errado, corrija na aba antes: o e-mail não muda o sorteio.)',
      ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    var alvo = busca_(r2.getResponseText()), achados = [];
    d.participantes.forEach(function (p, i) { if (alvo && (busca_(p.nome) === alvo || busca_(p.email) === alvo)) achados.push(i); });
    if (achados.length !== 1)
      return ui.alert('Pessoa não encontrada', (achados.length ? 'Há ' + achados.length + ' pessoas com esse nome; use o e-mail.' : 'Ninguém na lista com esse nome ou e-mail.'), ui.ButtonSet.OK);
    if (MailApp.getRemainingDailyQuota() < 1) return ui.alert('Cota diária esgotada', 'Tente amanhã.', ui.ButtonSet.OK);

    var destino = Sorteio.sortear(d.participantes, d.regras, c.rnd), i = achados[0];
    enviarResultado_(d.participantes[i], d.participantes[destino[i]], d.evento, c.apelido + (c.data ? ' · ' + c.data : ''));
    ui.alert('E-mail reenviado',
      'Reenviei o resultado do sorteio #' + c.apelido + (c.data ? ' (feito em ' + c.data + ')' : '') + ' para ' + d.participantes[i].nome + ' (' + d.participantes[i].email + ').\nÉ o mesmo resultado do sorteio original.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Erro', String(e.message || e), ui.ButtonSet.OK);
  }
}

function busca_(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------- e-mail */

/** apelido: identificação do sorteio, ex.: "FCM0 · 24/11/2026 às 14h32" (vai no rodapé do e-mail). */
function enviarResultado_(quem, tirou, ev, apelido) {
  var linhas = [['Data da festa', ev.dataFesta], ['Local', ev.local], ['Valor sugerido', ev.valor], ['Organização', ev.organizador]]
    .filter(function (l) { return l[1]; });

  var texto = ['Olá, ' + quem.nome + '!', '', 'No ' + ev.nome + ', você tirou:', '', '*** ' + tirou.nome + ' ***', '']
    .concat(linhas.map(function (l) { return l[0] + ': ' + l[1]; }))
    .concat(ev.mensagem ? ['', ev.mensagem] : [])
    .concat(['', 'Guarde segredo! 🤫' + (apelido ? ' · Sorteio #' + apelido : ''), '', '💙 Sorteio grátis, em parceria com a AMA. Para retribuir sem gastar nada, ative a doação automática da Nota Fiscal Paulista: https://ama.org.br/doacao-via-nota-fiscal/']).join('\n');

  var tabela = linhas.map(function (l) {
    return '<tr><td style="padding:4px 12px 4px 0;color:' + COR.cinza + '">' + esc_(l[0]) + '</td>' +
      '<td style="padding:4px 0;color:' + COR.grafite + ';font-weight:600">' + esc_(l[1]) + '</td></tr>';
  }).join('');

  var corpo =
    '<p style="margin:0;color:' + COR.grafite + '">Você tirou…</p>' +
    '<p style="margin:12px 0 20px;font-size:30px;font-weight:800;color:' + COR.azul + '">' + esc_(tirou.nome) + '</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' + tabela + '</table>' +
    (ev.mensagem ? '<p style="margin:20px 0 0;color:' + COR.grafite + ';white-space:pre-line">' + esc_(ev.mensagem) + '</p>' : '') +
    '<p style="margin:24px 0 0;color:' + COR.cinza + ';font-size:13px">Guarde segredo! 🤫' + (apelido ? ' · Sorteio #' + esc_(apelido) : '') + '</p>' +
    '<p style="margin:20px 0 0;padding:12px;background:#eef4fb;border-radius:8px;font-size:13px;color:' + COR.grafite + '">💙 Este sorteio é grátis, em parceria com a <b>AMA – Associação de Amigos do Autista</b>. Para retribuir sem gastar nada, ative a doação automática da Nota Fiscal Paulista (leva menos de 5 minutos): <a href="https://ama.org.br/doacao-via-nota-fiscal/">ama.org.br/doacao-via-nota-fiscal</a></p>';

  MailApp.sendEmail({
    to: quem.email,
    subject: '🎁 ' + ev.nome + ': seu amigo secreto chegou!',
    body: texto,
    htmlBody: cartao_(ev.nome, 'Olá, ' + quem.nome + '!', corpo),
    name: ev.nome
  });
}

function cartao_(sobretitulo, titulo, corpoHtml) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#f2f6fa;padding:24px">' +
    '<div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dde5ee">' +
    '<div style="background:' + COR.azul + ';background:linear-gradient(135deg,' + COR.azul + ',' + COR.azulClaro + ');padding:20px 24px;color:#fff">' +
    '<img src="' + LOGO_URL + '" width="44" height="44" alt="" style="float:right;margin-left:12px">' +
    '<div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.85">' + esc_(sobretitulo) + '</div>' +
    '<div style="font-size:22px;font-weight:700;margin-top:4px">' + esc_(titulo) + '</div></div>' +
    '<div style="padding:24px;color:' + COR.grafite + '">' + corpoHtml + '</div></div>' +
    '<p style="text-align:center;color:' + COR.cinza + ';font-size:11px;margin:12px 0 0">Sorteio feito com Amigo Secreto · Mestre dos Dados</p></div>';
}

function corta_(s, max) { return String(s == null ? '' : s).trim().slice(0, max); }

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
