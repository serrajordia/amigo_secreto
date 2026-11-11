// Roda docs/apps-script/Planilha.gs + Sorteio.gs em Node, com SpreadsheetApp/MailApp simulados.
// Rode com: node --test tests/planilha.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'docs', 'apps-script');

function ambiente({ participantes, regras = [true, true, false], cota = 100 }) {
  const emails = [], alertas = [];
  // aba Participantes: linha 1 = cabeçalho
  const aba1 = [['Nome', 'E-mail', 'Grupo']].concat(participantes);
  // aba Evento e regras: B2..B7 evento, B10..B12 regras
  const aba2 = [];
  const poe = (l, v) => { aba2[l - 1] = ['', v]; };
  poe(2, 'Natal <3'); poe(3, '24/12'); poe(4, 'Casa da vovó'); poe(5, 'R$ 100'); poe(6, 'Juka'); poe(7, 'Levem sobremesa');
  poe(10, regras[0]); poe(11, regras[1]); poe(12, regras[2]);

  const aba = (grade) => ({
    getLastRow: () => grade.length,
    getRange: (r, c, nr, nc) => ({
      getValue: () => ((grade[r - 1] || [])[c - 1] ?? ''),
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((grade[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    }),
  });
  const abas = { Participantes: aba(aba1), 'Evento e regras': aba(aba2) };
  const ui = {
    Button: { YES: 'YES', NO: 'NO' },
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
    alert: (titulo, msg) => { alertas.push({ titulo, msg: msg || '' }); return 'YES'; },
  };
  const ctx = {
    console,
    SpreadsheetApp: { getUi: () => ui, getActive: () => ({ getSheetByName: (n) => abas[n] || null }) },
    MailApp: { getRemainingDailyQuota: () => cota - emails.length, sendEmail: (o) => emails.push(o) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'org@exemplo.com' }) },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Sorteio.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'Planilha.gs'), 'utf8'), ctx);
  return { ctx, emails, alertas };
}

const FAMILIAS = [
  ['Ana', 'ana@ex.com', 'Silva'], ['Bia', 'bia@ex.com', 'Silva'],
  ['Caio', 'caio@ex.com', 'Souza'], ['Dani', 'dani@ex.com', 'Souza'],
  ['Edu', 'edu@ex.com', 'Lopes'], ['Fabi', 'fabi@ex.com', 'Lopes'],
];

test('sorteia, respeita grupos e nunca revela o resultado nas mensagens da tela', () => {
  for (let t = 0; t < 200; t++) {
    const { ctx, emails, alertas } = ambiente({ participantes: FAMILIAS });
    ctx.menuSortear();
    assert.strictEqual(emails.length, 6);
    const tirou = {};
    for (const m of emails) {
      const quem = FAMILIAS.find((p) => p[1] === m.to);
      const alvo = FAMILIAS.find((p) => m.body.includes('*** ' + p[0] + ' ***'));
      assert.ok(quem && alvo, 'cada e-mail nomeia um sorteado');
      assert.notStrictEqual(quem[2], alvo[2], 'sem tirar do próprio grupo');
      tirou[alvo[0]] = (tirou[alvo[0]] || 0) + 1;
      assert.ok(m.body.includes('24/12') && m.body.includes('R$ 100') && m.htmlBody.includes('Natal &lt;3'));
    }
    assert.strictEqual(Object.keys(tirou).length, 6, 'cada pessoa é tirada exatamente uma vez');
    const tela = alertas.map((a) => a.titulo + a.msg).join(' ');
    FAMILIAS.forEach((p) => assert.ok(!tela.includes('*** ' + p[0]), 'tela não revela resultado'));
    assert.match(alertas.at(-1).titulo, /Sorteio feito/);
  }
});

test('corrente única forma uma roda só', () => {
  const { ctx, emails } = ambiente({ participantes: FAMILIAS, regras: [true, true, true] });
  ctx.menuSortear();
  const prox = {};
  emails.forEach((m) => {
    prox[FAMILIAS.find((p) => p[1] === m.to)[0]] = FAMILIAS.find((p) => m.body.includes('*** ' + p[0] + ' ***'))[0];
  });
  let atual = 'Ana', passos = 0;
  do { atual = prox[atual]; passos++; } while (atual !== 'Ana');
  assert.strictEqual(passos, 6);
});

test('erros citam a linha real da planilha e não enviam nada', () => {
  const { ctx, emails, alertas } = ambiente({
    participantes: [['Ana', 'ana@ex.com', 'A'], ['', '', ''], ['Bia', 'bia-sem-arroba', 'B'], ['Caio', 'caio@ex.com', 'B']],
  });
  ctx.menuSortear();
  assert.strictEqual(emails.length, 0);
  assert.match(alertas[0].msg, /Linha 4 \(Bia\): e-mail inválido/); // cabeçalho=1, Ana=2, branco=3, Bia=4
});

test('grupo grande demais é barrado com mensagem clara', () => {
  const { ctx, emails, alertas } = ambiente({
    participantes: [['A1', 'a1@ex.com', 'A'], ['A2', 'a2@ex.com', 'A'], ['A3', 'a3@ex.com', 'A'], ['B1', 'b1@ex.com', 'B']],
  });
  ctx.menuSortear();
  assert.strictEqual(emails.length, 0);
  assert.match(alertas[0].msg, /grupo 'A' tem 3 de 4/);
});

test('cota insuficiente não envia nada', () => {
  const { ctx, emails, alertas } = ambiente({ participantes: FAMILIAS, cota: 3 });
  ctx.menuSortear();
  assert.strictEqual(emails.length, 0);
  assert.match(alertas[0].titulo, /Cota/);
});

test('verificar e teste de e-mail', () => {
  const a = ambiente({ participantes: FAMILIAS });
  a.ctx.menuVerificar();
  assert.match(a.alertas[0].msg, /Sorteio possível com 6/);
  a.ctx.menuTeste();
  assert.strictEqual(a.emails.at(-1).to, 'org@exemplo.com');
});
