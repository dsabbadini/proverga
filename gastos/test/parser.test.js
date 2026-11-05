import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotificacao, parseLancamentoManual, parseValor } from '../nucleo/parser.js';
import { categorizar, chaveEstabelecimento } from '../nucleo/categorias.js';
import { paraHorarioBrasilia, intervaloDoMes, mesesAnteriores } from '../src/db.js';

const REF = new Date('2026-11-04T12:00:00-03:00').getTime();

const CASOS = [
  {
    nome: 'Nubank crédito',
    n: { app: 'com.nu.production', title: 'Compra aprovada', text: 'Compra de R$ 25,90 APROVADA em PADARIA PAO QUENTE para o cartão com final 1234.' },
    esperado: { valor: 25.9, estabelecimento: 'PADARIA PAO QUENTE', cartao_final: '1234', categoria: 'padaria', conta: 'Nubank' },
  },
  {
    nome: 'Itaú com hífens',
    n: { app: 'com.itau', title: 'Itaú', text: 'Compra aprovada no seu cartão final 5678 - POSTO IPIRANGA CENTRO - R$ 210,00 em 03/11 às 18:42' },
    esperado: { valor: 210, estabelecimento: 'POSTO IPIRANGA CENTRO', cartao_final: '5678', categoria: 'combustivel' },
  },
  {
    nome: 'Santander',
    n: { app: 'com.santander.app', title: 'Santander', text: 'Compra aprovada de R$ 1.234,56 em CARREFOUR HIPER no cartão final 9012.' },
    esperado: { valor: 1234.56, estabelecimento: 'CARREFOUR HIPER', categoria: 'mercado' },
  },
  {
    nome: 'Bradescard',
    n: { app: 'br.com.bradescard.app', title: 'Bradescard', text: 'BRADESCARD: Compra aprovada no valor de R$ 89,90 em IFD*RESTAURANTE SABOR cartao final 3456' },
    esperado: { valor: 89.9, categoria: 'refeicoes' },
  },
  {
    nome: 'PicPay pagamento',
    n: { app: 'com.picpay', title: 'Pagamento realizado', text: 'Você pagou R$ 32,00 para Drogasil Loja 123.' },
    esperado: { valor: 32, estabelecimento: 'Drogasil Loja 123', categoria: 'saude' },
  },
  {
    nome: 'Pix enviado para pessoa',
    n: { app: 'com.nu.production', title: 'Pix enviado', text: 'Você enviou um Pix de R$ 150,00 para Maria Silva.' },
    esperado: { valor: 150, estabelecimento: 'Maria Silva', tipo: 'pix', categoria: 'transferencias' },
  },
  {
    nome: 'Inter débito',
    n: { app: 'br.com.intermedium', title: 'Compra no débito', text: 'Compra no débito aprovada: R$ 18,50 em UBER *TRIP' },
    esperado: { valor: 18.5, tipo: 'debito', categoria: 'transporte' },
  },
  {
    nome: 'Mercado Pago',
    n: { app: 'com.mercadopago.wallet', title: 'Você fez um pagamento', text: 'Você pagou R$ 54,30 para Supermercado Bom Preço' },
    esperado: { valor: 54.3, categoria: 'mercado' },
  },
  {
    nome: 'C6 assinatura',
    n: { app: 'com.c6bank.app', title: 'C6 Bank', text: 'Compra aprovada R$ 55,90 em NETFLIX.COM cartão final 7777' },
    esperado: { valor: 55.9, categoria: 'assinaturas' },
  },
];

for (const c of CASOS) {
  test(`notificação: ${c.nome}`, () => {
    const r = parseNotificacao({ ...c.n, ts: REF });
    assert.equal(r.status, 'ok', JSON.stringify(r));
    const tx = r.transacao;
    for (const [k, v] of Object.entries(c.esperado)) {
      if (k === 'categoria') assert.equal(categorizar(tx.estabelecimento, { tipo: tx.tipo }), v, `categoria de "${tx.estabelecimento}"`);
      else assert.equal(tx[k], v, `${k} em ${JSON.stringify(tx)}`);
    }
    assert.equal(tx.natureza, 'despesa');
  });
}

test('Pix recebido vira receita', () => {
  const r = parseNotificacao({ title: 'Pix recebido', text: 'Você recebeu um Pix de R$ 500,00 de JOAO SOUZA', ts: REF });
  assert.equal(r.status, 'ok');
  assert.equal(r.transacao.natureza, 'receita');
  assert.equal(r.transacao.estabelecimento, 'JOAO SOUZA');
});

test('ignora compra recusada, fatura e códigos', () => {
  for (const text of [
    'Compra de R$ 99,00 em LOJA X foi recusada.',
    'Sua fatura está fechada. Valor: R$ 2.300,00',
    'Seu limite disponível é de R$ 5.000,00',
  ]) assert.equal(parseNotificacao({ text, ts: REF }).status, 'ignorada', text);
});

test('data da notificação com dia/mês e hora', () => {
  const r = parseNotificacao({ text: 'Compra aprovada no seu cartão final 5678 - POSTO SHELL - R$ 100,00 em 03/11 às 18:42', ts: REF });
  assert.equal(paraHorarioBrasilia(r.transacao.data), '2026-11-03T18:42:00');
});

test('lançamento manual', () => {
  assert.deepEqual(
    (({ valor, estabelecimento }) => ({ valor, estabelecimento }))(parseLancamentoManual('padaria 18,50')),
    { valor: 18.5, estabelecimento: 'Padaria' },
  );
  assert.equal(parseLancamentoManual('gastei 120 no posto').valor, 120);
  assert.equal(parseLancamentoManual('gastei 120 no posto').estabelecimento, 'Posto');
  assert.equal(parseLancamentoManual('ifood 42.90').valor, 42.9);
  assert.equal(parseLancamentoManual('aluguel 1.800,00').valor, 1800);
  assert.equal(parseLancamentoManual('sem valor'), null);
});

test('parseValor', () => {
  assert.equal(parseValor('R$ 1.234,56'), 1234.56);
  assert.equal(parseValor('R$12'), 12);
});

test('aprendizado: regra do usuário vence a palavra-chave', () => {
  const regras = new Map([[chaveEstabelecimento('MP *JOAO LANCHES 123'), 'padaria']]);
  assert.equal(categorizar('MP *JOAO LANCHES 456', { regras }), 'padaria');
  assert.equal(categorizar('JOAO LANCHES'), 'refeicoes');
});

test('Mercado Livre não cai em Mercado', () => {
  assert.equal(categorizar('MERCADOLIVRE*VENDEDOR'), 'compras');
  assert.equal(categorizar('MERCADO LIVRE'), 'compras');
  assert.equal(categorizar('AMAZON PRIME BR'), 'assinaturas');
});

test('intervalos de mês', () => {
  assert.deepEqual(intervaloDoMes('2026-12'), { inicio: '2026-12-01T00:00:00', fim: '2027-01-01T00:00:00' });
  assert.deepEqual(mesesAnteriores('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(paraHorarioBrasilia('2026-12-01T01:30:00Z'), '2026-11-30T22:30:00');
});

// Textos reais da Carteira do Google (Samsung), enviados pelo usuário.
const CARTEIRA = 'com.google.android.apps.walletnfcrel';
test('Carteira do Google: compra aprovada', () => {
  const r = parseNotificacao({ app: CARTEIRA, title: 'MP *LANCHONETEMAY', text: 'R$ 25,00 com Nubank Mastercard Platinum ••9975', ts: REF });
  assert.equal(r.status, 'ok', JSON.stringify(r));
  assert.equal(r.transacao.valor, 25);
  assert.equal(r.transacao.estabelecimento, 'MP *LANCHONETEMAY');
  assert.equal(r.transacao.conta, 'Nubank Mastercard Platinum');
  assert.equal(r.transacao.cartao_final, '9975');
  assert.equal(categorizar(r.transacao.estabelecimento), 'refeicoes');
  assert.equal(chaveEstabelecimento(r.transacao.estabelecimento), 'LANCHONETEMAY');
});
test('Carteira do Google: recusada e comprovante são ignorados', () => {
  assert.equal(parseNotificacao({ app: CARTEIRA, title: 'MP *LANCHONETEMAY', text: 'RECUSADA: R$ 25,00 com Nubank Mastercard Gold ••6436' }).status, 'ignorada');
  assert.equal(parseNotificacao({ app: CARTEIRA, title: 'Preparando seu comprovante', text: 'Estamos adicionando o local ao seu comprovante' }).status, 'ignorada');
});
