// Rode com: node --test tests/sorteio.test.js
const test = require('node:test');
const assert = require('node:assert');
const S = require('../docs/js/sorteio.js');

function familia() {
  const ps = [];
  const g = { 1: 5, 2: 4, 3: 4, 4: 3 };
  for (const k in g) for (let i = 0; i < g[k]; i++) ps.push({ nome: `P${k}${i}`, email: `p${k}${i}@ex.com`, grupo: k });
  return ps;
}

for (const regras of [{}, { permitirMesmoGrupo: true }, { correnteUnica: true }, { permitirMesmoGrupo: true, permitirAutossorteio: true }]) {
  test('regras respeitadas ' + JSON.stringify(regras), () => {
    const ps = familia();
    const r = { permitirAutossorteio: false, permitirMesmoGrupo: false, correnteUnica: false, ...regras };
    for (let t = 0; t < 1000; t++) {
      const d = S.sortear(ps, r);
      assert.deepStrictEqual([...d].sort((a, b) => a - b), ps.map((_, i) => i));
      d.forEach((j, i) => assert.ok(S.podeTirar(ps, i, j, r)));
      if (r.correnteUnica) { let i = 0, p = 0; do { i = d[i]; p++; } while (i !== 0); assert.strictEqual(p, ps.length); }
    }
  });
}

test('grupo grande demais é impossível', () => {
  const ps = ['a', 'b', 'c'].map((n, i) => ({ nome: n, email: n + '@ex.com', grupo: i < 2 ? 'A' : 'B' }));
  assert.strictEqual(S.verificar(ps, {}).viavel, false);
  assert.throws(() => S.sortear(ps, {}));
});

test('e-mail inválido e repetido', () => {
  assert.strictEqual(S.verificar([{ nome: 'a', email: 'x' }, { nome: 'b', email: 'b@ex.com' }], {}).viavel, false);
  const v = S.verificar([{ nome: 'a', email: 'x@ex.com' }, { nome: 'b', email: 'X@ex.com' }, { nome: 'c', email: 'c@ex.com' }], {});
  assert.ok(v.viavel && v.avisos.length === 1);
});

test('e-mail opcional com exigirEmail:false, mas validado se presente', () => {
  const sem = ['a', 'b', 'c'].map((n) => ({ nome: n, email: '' }));
  assert.strictEqual(S.verificar(sem, {}).viavel, false);
  assert.strictEqual(S.verificar(sem, {}, { exigirEmail: false }).viavel, true);
  assert.strictEqual(S.sortear(sem, {}, undefined, { exigirEmail: false }).length, 3);
  const ruim = [{ nome: 'a', email: 'xx' }, { nome: 'b', email: '' }, { nome: 'c', email: '' }];
  assert.strictEqual(S.verificar(ruim, {}, { exigirEmail: false }).viavel, false);
});

function lista(tamanhos) {
  const ps = [];
  tamanhos.forEach((t, g) => { for (let k = 0; k < t; k++) ps.push({ nome: `g${g}p${k}`, email: '', grupo: 'G' + g }); });
  return ps;
}
const OP = { exigirEmail: false };
const R0 = { permitirAutossorteio: false, permitirMesmoGrupo: false, correnteUnica: false };

test('casos apertados (só o fallback de Kuhn resolve) e listas grandes', () => {
  for (const tam of [[10, 10], [30, 30], [5, 5, 4], [200, 200], new Array(150).fill(4)]) {
    const ps = lista(tam);
    for (let t = 0; t < 5; t++) {
      const d = S.sortear(ps, R0, undefined, OP);
      assert.deepStrictEqual([...d].sort((a, b) => a - b), ps.map((_, i) => i));
      d.forEach((j, i) => assert.ok(S.podeTirar(ps, i, j, R0)));
    }
  }
});

test('impossível continua sendo detectado em lista grande', () => {
  const v = S.verificar(lista([301, 299]), R0, OP);
  assert.strictEqual(v.viavel, false);
});

/* ---------------------------------------------------------------- sorteio reprodutível */
const crypto = require('crypto');
const VETORES = require('./vetores_codigo.json');

test('SHA-256 interno confere com o do Node', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'ção 🎄'.repeat(30)]) {
    const meu = S._sha256([...Buffer.from(s, 'utf8')]).map((w) => w.toString(16).padStart(8, '0')).join('');
    assert.strictEqual(meu, crypto.createHash('sha256').update(s).digest('hex'));
  }
});

test('versão 1 congelada: os vetores fixos continuam dando o mesmo resultado', () => {
  for (const v of VETORES) {
    const c = S.lerCodigo(v.codigo, v.participantes, v.regras);
    assert.ok(c.ok, v.nome);
    assert.strictEqual(c.apelido, v.apelido, v.nome);
    assert.deepStrictEqual(S.sortear(v.participantes, v.regras, c.rnd, OP), v.destino, v.nome);
  }
});

test('mesmo código + mesma lista = mesmo sorteio; aceita minúsculas, espaços e O/I/L', () => {
  const ps = lista([3, 3, 2, 4]);
  for (const regras of [R0, { ...R0, correnteUnica: true }]) {
    const cod = S.novoCodigo(ps, regras);
    assert.match(cod, /^1(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
    const a = S.sortear(ps, regras, S.lerCodigo(cod, ps, regras).rnd, OP);
    const bagunçado = cod.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
    const b = S.sortear(ps, regras, S.lerCodigo(bagunçado, ps, regras).rnd, OP);
    assert.deepStrictEqual(a, b);
    a.forEach((j, i) => assert.ok(S.podeTirar(ps, i, j, regras)));
  }
});

test('código não confere se a lista, a ordem, os grupos, as regras ou o próprio código mudam', () => {
  const ps = lista([3, 3, 2]);
  const cod = S.novoCodigo(ps, R0);
  assert.ok(S.lerCodigo(cod, ps, R0).ok);
  // nomes: acento, caixa e espaços extras não importam
  const parecida = ps.map((p) => ({ ...p, nome: '  ' + p.nome.toUpperCase() + ' ' }));
  assert.ok(S.lerCodigo(cod, parecida, R0).ok);
  const trocada = [ps[1], ps[0]].concat(ps.slice(2));
  const outroGrupo = ps.map((p, i) => (i === 0 ? { ...p, grupo: 'X' } : p));
  for (const [lista2, regras] of [[trocada, R0], [outroGrupo, R0], [ps.slice(1), R0], [ps, { ...R0, correnteUnica: true }]]) {
    assert.strictEqual(S.lerCodigo(cod, lista2, regras).ok, false);
  }
  const digitadoErrado = cod.slice(0, 3) + (cod[3] === 'A' ? 'B' : 'A') + cod.slice(4);
  assert.strictEqual(S.lerCodigo(digitadoErrado, ps, R0).ok, false);
  for (const ruim of ['', 'abc', '2-AAAA-AAAA-AAAA-AAAA-AAAA', cod.slice(0, -1)]) assert.strictEqual(S.lerCodigo(ruim, ps, R0).ok, false);
});

test('códigos novos são diferentes e o gerador é aproximadamente uniforme', () => {
  const ps = lista([2, 2, 2]);
  const vistos = new Set();
  for (let k = 0; k < 200; k++) vistos.add(S.novoCodigo(ps, R0));
  assert.strictEqual(vistos.size, 200);
  const c = S.lerCodigo(S.novoCodigo(ps, R0), ps, R0);
  const caixas = new Array(10).fill(0);
  for (let k = 0; k < 20000; k++) caixas[Math.floor(c.rnd() * 10)]++;
  caixas.forEach((n) => assert.ok(Math.abs(n - 2000) < 200));
});
