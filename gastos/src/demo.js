// Popula um banco de demonstração passando notificações fictícias pelo parser real.
// Uso: DB_PATH=./data/demo.db npm run demo
import { abrirBanco } from './db.js';
import { parseNotificacao } from './parser.js';

const repo = abrirBanco(process.env.DB_PATH || './data/demo.db');

const MODELOS = [
  ['com.nu.production', 'Compra aprovada', (v, e) => `Compra de R$ ${v} APROVADA em ${e} para o cartão com final 1234.`],
  ['com.santander.app', 'Santander', (v, e) => `Compra aprovada de R$ ${v} em ${e} no cartão final 9012.`],
  ['com.itau', 'Itaú', (v, e) => `Compra aprovada no seu cartão final 5678 - ${e} - R$ ${v}`],
  ['com.picpay', 'Pagamento realizado', (v, e) => `Você pagou R$ ${v} para ${e}.`],
];

const GASTOS = [
  // [estabelecimento, vezes/mês, valor mínimo, valor máximo]
  ['PADARIA REAL', 14, 9, 38], ['PANIFICADORA SAO JOSE', 6, 12, 45],
  ['CARREFOUR HIPER', 3, 180, 520], ['ATACADAO', 1, 350, 780], ['HORTIFRUTI CENTRAL', 4, 40, 110],
  ['POSTO IPIRANGA CENTRO', 3, 150, 280], ['AUTO POSTO SHELL', 1, 120, 250],
  ['IFD*RESTAURANTE SABOR', 6, 35, 90], ['OUTBACK STEAKHOUSE', 1, 160, 320], ['BURGER KING', 2, 30, 60], ['STARBUCKS', 3, 18, 35],
  ['UBER *TRIP', 10, 14, 48], ['ESTAPAR ESTACIONAMENTO', 3, 15, 40],
  ['DROGASIL', 2, 25, 140],
  ['NETFLIX.COM', 1, 55.9, 55.9], ['SPOTIFY', 1, 21.9, 21.9], ['CANVA', 1, 34.9, 34.9], ['MICROSOFT 365', 1, 49, 49],
  ['MERCADOLIVRE*VENDEDOR', 2, 60, 240], ['AMAZON MARKETPLACE', 1, 50, 200],
  ['ENEL DISTRIBUICAO', 1, 180, 290], ['VIVO FIBRA', 1, 119.9, 119.9],
  ['PLAYSTATION STORE', 1, 10, 40],
];

const rnd = (a, b) => a + Math.random() * (b - a);
const brl = (n) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const hoje = new Date();
let ok = 0;
for (let mes = 3; mes >= 0; mes--) {
  const base = new Date(hoje.getFullYear(), hoje.getMonth() - mes, 1);
  const diasNoMes = mes === 0 ? hoje.getDate() : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  for (const [est, vezes, min, max] of GASTOS) {
    const n = Math.max(1, Math.round((vezes * diasNoMes) / 30 * rnd(0.7, 1.3)));
    for (let i = 0; i < n; i++) {
      const [app, title, fmt] = MODELOS[Math.floor(Math.random() * MODELOS.length)];
      const quando = new Date(base.getFullYear(), base.getMonth(), 1 + Math.floor(Math.random() * diasNoMes), 7 + Math.floor(Math.random() * 15), Math.floor(Math.random() * 60));
      const r = parseNotificacao({ app, title, text: fmt(brl(rnd(min, max)), est), ts: quando.getTime() });
      if (r.status === 'ok') { repo.inserirTransacao(r.transacao); ok++; }
    }
  }
  // Pix para pessoas e um salário
  for (let i = 0; i < 4; i++) {
    const quando = new Date(base.getFullYear(), base.getMonth(), 1 + Math.floor(Math.random() * diasNoMes), 12);
    const r = parseNotificacao({ app: 'com.nu.production', title: 'Pix enviado', text: `Você enviou um Pix de R$ ${brl(rnd(30, 250))} para ${['Maria Silva', 'Joao Pereira', 'Diarista Ana', 'Carlos Souza'][i]}.`, ts: quando.getTime() });
    if (r.status === 'ok') { repo.inserirTransacao(r.transacao); ok++; }
  }
  if (mes === 0 && hoje.getDate() < 5) continue;
  const sal = parseNotificacao({ app: 'com.itau', title: 'Pix recebido', text: 'Você recebeu um Pix de R$ 12.000,00 de PROVERGA LTDA', ts: new Date(base.getFullYear(), base.getMonth(), 5, 9).getTime() });
  repo.inserirTransacao(sal.transacao);
}
// Uma notificação que o parser não entende, para mostrar a fila de revisão.
const estranha = { app: 'br.com.bradescard.app', title: 'Bradescard', text: 'Transação de R$ 77,00 realizada.' };
repo.registrarNotificacao(estranha, 'demo', parseNotificacao(estranha).status, 'exemplo');
console.log(`${ok} transações de demonstração criadas.`);
