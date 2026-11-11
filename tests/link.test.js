// Rode com: node --test tests/link.test.js
const test = require('node:test');
const assert = require('node:assert');
const Link = require('../docs/js/link.js');

test('ida e volta com acentos, emoji e símbolos', () => {
  const ev = { nome: 'Natal 🎄', dataFesta: '24/12 às 20h', local: 'Casa da vovó <b>', valor: 'R$ 100', mensagem: 'Levem sobremesa!\nBeijos' };
  const url = Link.criar('https://x.github.io/amigo/ver.html', 'Giséla Ñ', 'Vovô Samuel', ev);
  assert.ok(url.startsWith('https://x.github.io/amigo/ver.html#'));
  assert.ok(!/[+/=]/.test(url.split('#')[1]), 'base64 seguro para URL');
  const d = Link.ler(url.split('#')[1]);
  assert.strictEqual(d.quem, 'Giséla Ñ');
  assert.strictEqual(d.tirou, 'Vovô Samuel');
  assert.strictEqual(d.evento.nome, 'Natal 🎄');
  assert.strictEqual(d.evento.local, 'Casa da vovó <b>');
  assert.strictEqual(d.evento.mensagem, 'Levem sobremesa!\nBeijos');
});

test('links quebrados ou adulterados viram null, sem exceção', () => {
  for (const ruim of ['', '#', '###', 'abc', '!!!!', Buffer.from('{"v":2}').toString('base64url'), Buffer.from('{"v":1,"p":"a"}').toString('base64url')]) {
    assert.strictEqual(Link.ler(ruim), null, JSON.stringify(ruim));
  }
});

test('o endereço não contém o resultado em texto puro', () => {
  const url = Link.criar('https://x/ver.html', 'Ana', 'Bruno', {});
  assert.ok(!url.includes('Bruno'));
});
