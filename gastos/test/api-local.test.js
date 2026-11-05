// Simula o lado nativo do Android para testar o modo app de ponta a ponta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiLocal } from '../nucleo/api-local.js';

function nativoFalso() {
  const n = {
    arquivo: '',
    fila: [],
    gravacoes: 0,
    carregarDados: () => n.arquivo,
    salvarDados: (json) => { n.arquivo = json; n.gravacoes++; },
    lerFila: () => JSON.stringify(n.fila),
    confirmarFila: (ids) => { const s = new Set(JSON.parse(ids)); n.fila = n.fila.filter((i) => !s.has(i.id)); },
    exportarBackup: (json) => { n.exportado = json; },
  };
  return n;
}

const CARTEIRA = 'com.google.android.apps.walletnfcrel';
const agora = Date.now();

test('fila capturada com o app fechado vira transações, com horário original e sem duplicar', async () => {
  const nativo = nativoFalso();
  nativo.fila = [
    { id: 1, app: CARTEIRA, title: 'MP *LANCHONETEMAY', text: 'R$ 25,00 com Nubank Mastercard Platinum ••9975', ts: agora - 3 * 3600e3 },
    // o Android reemite a mesma notificação segundos depois
    { id: 2, app: CARTEIRA, title: 'MP *LANCHONETEMAY', text: 'R$ 25,00 com Nubank Mastercard Platinum ••9975', ts: agora - 3 * 3600e3 + 5000 },
    // o app do Nubank avisa a mesma compra
    { id: 3, app: 'com.nu.production', title: 'Compra aprovada', text: 'Compra de R$ 25,00 APROVADA em MP *LANCHONETEMAY para o cartão com final 9975.', ts: agora - 3 * 3600e3 + 20000 },
    { id: 4, app: CARTEIRA, title: 'MP *LANCHONETEMAY', text: 'RECUSADA: R$ 25,00 com Nubank Mastercard Gold ••6436', ts: agora - 3 * 3600e3 - 60000 },
    { id: 5, app: 'com.santander.app', title: 'Santander', text: 'Compra aprovada de R$ 210,00 em POSTO IPIRANGA no cartão final 1111.', ts: agora - 3600e3 },
  ];
  const api = criarApiLocal(nativo);
  const r = api.processarFila();
  assert.deepEqual(r, { processadas: 5, novas: 2 });
  assert.equal(nativo.fila.length, 0, 'fila confirmada');
  assert.equal(nativo.gravacoes, 1, 'grava uma vez por lote');

  const lista = await api.chamar('/api/transacoes');
  assert.equal(lista.length, 2);
  const lanche = lista.find((t) => t.estabelecimento === 'MP *LANCHONETEMAY');
  assert.equal(lanche.categoria, 'refeicoes');
  // horário da compra, não do processamento
  const esperado = new Date(agora - 3 * 3600e3 - 3 * 3600e3).toISOString().slice(0, 16);
  assert.equal(lanche.data.slice(0, 16), esperado);

  // Dados sobrevivem a reabrir o app
  const reaberto = criarApiLocal(nativo);
  const resumo = await reaberto.chamar('/api/resumo');
  assert.equal(resumo.totais.despesas, 235);
});

test('lançamento manual, aprendizado e erro de validação no modo app', async () => {
  const nativo = nativoFalso();
  const api = criarApiLocal(nativo);
  const t = await api.chamar('/api/transacoes', { method: 'POST', body: JSON.stringify({ texto: 'joao lanches 30' }) });
  assert.equal(t.categoria, 'refeicoes');
  const p = await api.chamar(`/api/transacoes/${t.id}`, { method: 'PATCH', body: JSON.stringify({ categoria: 'padaria' }) });
  assert.equal(p.transacao.categoria, 'padaria');
  const t2 = await api.chamar('/api/transacoes', { method: 'POST', body: JSON.stringify({ texto: 'joao lanches 12' }) });
  assert.equal(t2.categoria, 'padaria');
  await assert.rejects(api.chamar('/api/transacoes', { method: 'POST', body: JSON.stringify({ texto: 'nada' }) }), /Não entendi/);
});

test('backup exportado pode ser importado em outro aparelho', async () => {
  const a = nativoFalso();
  const apiA = criarApiLocal(a);
  await apiA.chamar('/api/transacoes', { method: 'POST', body: JSON.stringify({ texto: 'padaria 18,50' }) });
  apiA.exportar();
  const b = nativoFalso();
  const apiB = criarApiLocal(b);
  apiB.importar(a.exportado);
  assert.equal((await apiB.chamar('/api/transacoes')).length, 1);
  assert.throws(() => apiB.importar('{"x":1}'), /inválido/);
});
