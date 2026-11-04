import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/server.js';
import { abrirBanco } from '../src/db.js';

const TOKEN = 'token-de-teste-1234567890';
let servidor, base;
const chamar = (rota, { metodo = 'GET', corpo, token = TOKEN } = {}) =>
  fetch(base + rota, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (r) => ({ status: r.status, corpo: await r.json() }));

before(async () => {
  servidor = criarApp({ repo: abrirBanco(':memory:'), token: TOKEN });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test('exige token', async () => {
  assert.equal((await chamar('/api/resumo', { token: null })).status, 401);
  assert.equal((await chamar('/api/resumo', { token: 'errado' })).status, 401);
});

test('fluxo completo: notificação, duplicata, aprendizado e resumo', async () => {
  const n = { app: 'com.nu.production', title: 'Compra aprovada', text: 'Compra de R$ 40,00 APROVADA em JOAO LANCHES 01 para o cartão com final 1234.' };
  const r1 = await chamar('/api/notificacoes', { metodo: 'POST', corpo: n });
  assert.equal(r1.status, 201);
  assert.equal(r1.corpo.transacao.categoria, 'refeicoes');
  assert.equal((await chamar('/api/notificacoes', { metodo: 'POST', corpo: n })).corpo.status, 'duplicada');

  // Usuário diz que é padaria; a próxima compra no mesmo lugar (outra loja) já vem certa.
  const p = await chamar(`/api/transacoes/${r1.corpo.transacao.id}`, { metodo: 'PATCH', corpo: { categoria: 'padaria' } });
  assert.equal(p.corpo.transacao.categoria, 'padaria');
  const r2 = await chamar('/api/notificacoes', { metodo: 'POST', corpo: { ...n, text: n.text.replace('40,00', '12,00').replace('01', '02') } });
  assert.equal(r2.corpo.transacao.categoria, 'padaria');

  const manual = await chamar('/api/transacoes', { metodo: 'POST', corpo: { texto: 'posto 150' } });
  assert.equal(manual.corpo.categoria, 'combustivel');

  const ign = await chamar('/api/notificacoes', { metodo: 'POST', corpo: { text: 'Compra de R$ 10,00 em X foi recusada' } });
  assert.equal(ign.corpo.status, 'ignorada');

  const { corpo: resumo } = await chamar('/api/resumo');
  assert.equal(resumo.totais.despesas, 202);
  assert.deepEqual(resumo.porCategoria.map((c) => c.categoria), ['combustivel', 'padaria']);
});

test('lançamento inválido devolve 400', async () => {
  assert.equal((await chamar('/api/transacoes', { metodo: 'POST', corpo: { texto: 'sem número' } })).status, 400);
});

test('mesma compra pela Carteira do Google e pelo app do banco conta uma vez', async () => {
  const gw = await chamar('/api/notificacoes', { metodo: 'POST', corpo: { app: 'com.google.android.apps.walletnfcrel', title: 'MP *LANCHONETEMAY', text: 'R$ 25,00 com Nubank Mastercard Platinum ••9975' } });
  assert.equal(gw.status, 201);
  const nu = await chamar('/api/notificacoes', { metodo: 'POST', corpo: { app: 'com.nu.production', title: 'Compra aprovada', text: 'Compra de R$ 25,00 APROVADA em MP *LANCHONETEMAY para o cartão com final 9975.' } });
  assert.equal(nu.corpo.status, 'duplicada');
  // Outro cartão, mesmo valor: é outra compra.
  const outra = await chamar('/api/notificacoes', { metodo: 'POST', corpo: { app: 'com.google.android.apps.walletnfcrel', title: 'MP *LANCHONETEMAY', text: 'R$ 25,00 com Nubank Mastercard Gold ••6436' } });
  assert.equal(outra.status, 201);
});
