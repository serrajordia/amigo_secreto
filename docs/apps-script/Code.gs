/**
 * Amigo Secreto — backend gratuito no Google Apps Script.
 *
 * Roda na conta Google do ORGANIZADOR e envia os e-mails pelo Gmail dele.
 * Não existe senha de Gmail aqui: o Google pede autorização uma única vez.
 *
 * Instalação (o passo a passo ilustrado está na interface web):
 *   1. script.google.com → Novo projeto → cole este arquivo (Code.gs) e o Sorteio.gs.
 *   2. Selecione a função `gerarToken` e clique em Executar → autorize →
 *      copie o token mostrado no "Registro de execução".
 *   3. Implantar → Nova implantação → Tipo: App da Web
 *      Executar como: Eu · Quem pode acessar: Qualquer pessoa → copie a URL /exec.
 *   4. Cole a URL e o token na interface web.
 *
 * Segurança:
 *   - O token fica nas Propriedades do script (nunca no código, nunca no GitHub).
 *     Para trocar, rode `gerarToken` de novo; o token antigo deixa de valer.
 *   - O sorteio é feito AQUI, no servidor do Google. A resposta para o navegador
 *     contém só quantos e-mails foram enviados — nunca quem tirou quem.
 *   - Nada do resultado é gravado (nem em planilha, nem em log).
 */

var VERSAO = '2.0.0';
var MAX_PARTICIPANTES = 100;

function gerarToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('Seu token (copie e cole na interface; não compartilhe): ' + token);
  // Força o pedido de autorização de envio de e-mail já nesta execução.
  Logger.log('Cota de e-mails restante hoje: ' + MailApp.getRemainingDailyQuota());
}

function doGet() {
  return json_({ ok: true, app: 'amigo-secreto', versao: VERSAO });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, erro: 'Requisição inválida.' });
  }
  if (!tokenValido_(req.token)) {
    Utilities.sleep(800); // atrasa tentativas de adivinhação
    return json_({ ok: false, erro: 'Token inválido. Confira o token ou rode gerarToken de novo.' });
  }
  try {
    switch (req.acao) {
      case 'ping':
        return json_({ ok: true, versao: VERSAO, remetente: remetente_(), cota: MailApp.getRemainingDailyQuota() });
      case 'teste':
        return json_(enviarTeste_(req));
      case 'sortear':
        return json_(sortearEEnviar_(req));
      default:
        return json_({ ok: false, erro: 'Ação desconhecida.' });
    }
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  }
}

/* ---------------------------------------------------------------- ações */

function enviarTeste_(req) {
  var para = remetente_();
  MailApp.sendEmail({
    to: para,
    subject: 'Amigo Secreto — teste de conexão',
    body: 'Se você recebeu este e-mail, a conexão está funcionando. 🎉',
    htmlBody: cartao_('Teste de conexão', 'Tudo certo!', '<p style="margin:0">A interface consegue enviar e-mails pelo seu Gmail. 🎉</p>', req.logoUrl),
    name: 'Amigo Secreto'
  });
  return { ok: true, para: para, cota: MailApp.getRemainingDailyQuota() };
}

function sortearEEnviar_(req) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, erro: 'Outro sorteio está em andamento. Tente em instantes.' };
  try {
    var cache = CacheService.getScriptCache();
    var chave = req.idPedido ? 'pedido_' + String(req.idPedido).slice(0, 64) : null;
    if (chave && cache.get(chave)) return JSON.parse(cache.get(chave)); // clique duplo / reenvio

    var ps = limpaParticipantes_(req.participantes);
    if (ps.length > MAX_PARTICIPANTES) return { ok: false, erro: 'Máximo de ' + MAX_PARTICIPANTES + ' participantes.' };
    var v = Sorteio.verificar(ps, req.regras);
    if (!v.viavel) return { ok: false, erro: v.erros.join(' ') };

    var cota = MailApp.getRemainingDailyQuota();
    if (cota < ps.length)
      return { ok: false, erro: 'Cota diária do Gmail insuficiente: restam ' + cota + ', precisa de ' + ps.length + '. Tente amanhã.' };

    var destino = Sorteio.sortear(ps, req.regras);
    var ev = limpaEvento_(req.evento);
    var falhas = [];
    for (var i = 0; i < ps.length; i++) {
      try {
        enviarResultado_(ps[i], ps[destino[i]], ev, req.logoUrl);
      } catch (err) {
        falhas.push(ps[i].nome);
      }
    }
    var resp = {
      ok: falhas.length === 0,
      enviados: ps.length - falhas.length,
      falhas: falhas,
      erro: falhas.length ? 'Falhou o envio para: ' + falhas.join(', ') + '. Refaça o sorteio para todos.' : undefined,
      cota: MailApp.getRemainingDailyQuota()
    };
    if (chave) cache.put(chave, JSON.stringify(resp), 21600);
    return resp;
  } finally {
    lock.releaseLock();
  }
}

/* --------------------------------------------------------------- e-mail */

var COR = { azulClaro: '#29ABE2', azul: '#0071BC', cinza: '#71798A', grafite: '#3D4653' };

function enviarResultado_(quem, tirou, ev, logoUrl) {
  var linhas = [['Data da festa', ev.dataFesta], ['Local', ev.local], ['Valor sugerido', ev.valor], ['Organização', ev.organizador]]
    .filter(function (l) { return l[1]; });

  var texto = ['Olá, ' + quem.nome + '!', '', 'No ' + ev.nome + ', você tirou:', '', '*** ' + tirou.nome + ' ***', '']
    .concat(linhas.map(function (l) { return l[0] + ': ' + l[1]; }))
    .concat(ev.mensagem ? ['', ev.mensagem] : [])
    .concat(['', 'Guarde segredo! 🤫']).join('\n');

  var tabela = linhas.map(function (l) {
    return '<tr><td style="padding:4px 12px 4px 0;color:' + COR.cinza + '">' + esc_(l[0]) + '</td>' +
      '<td style="padding:4px 0;color:' + COR.grafite + ';font-weight:600">' + esc_(l[1]) + '</td></tr>';
  }).join('');

  var corpo =
    '<p style="margin:0;color:' + COR.grafite + '">Você tirou…</p>' +
    '<p style="margin:12px 0 20px;font-size:30px;font-weight:800;color:' + COR.azul + '">' + esc_(tirou.nome) + '</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' + tabela + '</table>' +
    (ev.mensagem ? '<p style="margin:20px 0 0;color:' + COR.grafite + ';white-space:pre-line">' + esc_(ev.mensagem) + '</p>' : '') +
    '<p style="margin:24px 0 0;color:' + COR.cinza + ';font-size:13px">Guarde segredo! 🤫</p>';

  MailApp.sendEmail({
    to: quem.email,
    subject: '🎁 ' + ev.nome + ': seu amigo secreto chegou!',
    body: texto,
    htmlBody: cartao_(ev.nome, 'Olá, ' + quem.nome + '!', corpo, logoUrl),
    name: ev.nome
  });
}

function cartao_(sobretitulo, titulo, corpoHtml, logoUrl) {
  var logo = /^https:\/\//.test(String(logoUrl || ''))
    ? '<img src="' + esc_(logoUrl) + '" width="44" height="44" alt="" style="float:right;margin-left:12px">' : '';
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#f2f6fa;padding:24px">' +
    '<div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dde5ee">' +
    '<div style="background:' + COR.azul + ';background:linear-gradient(135deg,' + COR.azul + ',' + COR.azulClaro + ');padding:20px 24px;color:#fff">' +
    logo +
    '<div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.85">' + esc_(sobretitulo) + '</div>' +
    '<div style="font-size:22px;font-weight:700;margin-top:4px">' + esc_(titulo) + '</div></div>' +
    '<div style="padding:24px;color:' + COR.grafite + '">' + corpoHtml + '</div></div>' +
    '<p style="text-align:center;color:' + COR.cinza + ';font-size:11px;margin:12px 0 0">Sorteio feito com Amigo Secreto · Mestre dos Dados</p></div>';
}

/* -------------------------------------------------------------- utilidades */

function tokenValido_(token) {
  var certo = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!certo || typeof token !== 'string' || token.length !== certo.length) return false;
  var dif = 0;
  for (var i = 0; i < certo.length; i++) dif |= certo.charCodeAt(i) ^ token.charCodeAt(i);
  return dif === 0;
}

function limpaParticipantes_(lista) {
  if (!Array.isArray(lista)) throw new Error('Lista de participantes ausente.');
  return lista.map(function (p) {
    return {
      nome: corta_(p && p.nome, 80),
      email: corta_(p && p.email, 120),
      grupo: corta_(p && p.grupo, 60)
    };
  });
}

function limpaEvento_(ev) {
  ev = ev || {};
  return {
    nome: corta_(ev.nome, 80) || 'Amigo Secreto',
    dataFesta: corta_(ev.dataFesta, 80),
    local: corta_(ev.local, 120),
    valor: corta_(ev.valor, 40),
    organizador: corta_(ev.organizador, 80),
    mensagem: corta_(ev.mensagem, 1000)
  };
}

function corta_(s, max) { return String(s == null ? '' : s).trim().slice(0, max); }

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function remetente_() {
  try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
