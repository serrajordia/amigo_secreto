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
