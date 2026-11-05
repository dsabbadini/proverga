// Interpreta o texto de notificações push de bancos e carteiras brasileiras
// e também lançamentos digitados ("padaria 18,50").
import { normalizar } from './categorias.js';

// Pacote Android -> nome amigável do banco/carteira.
export const APPS = {
  'com.nu.production': 'Nubank',
  'com.itau': 'Itaú',
  'com.itau.iti': 'Itaú (iti)',
  'br.com.itau.personnalite': 'Itaú Personnalité',
  'com.santander.app': 'Santander',
  'br.com.santander.way': 'Santander Way',
  'com.bradesco': 'Bradesco',
  'br.com.bradesco.cartoes': 'Bradesco Cartões',
  'br.com.bradescard.app': 'Bradescard',
  'br.com.bb.android': 'Banco do Brasil',
  'br.com.gabba.Caixa': 'Caixa',
  'br.com.intermedium': 'Inter',
  'com.c6bank.app': 'C6 Bank',
  'com.picpay': 'PicPay',
  'com.mercadopago.wallet': 'Mercado Pago',
  'com.btgpactual.pf': 'BTG',
  'br.com.xp.carteira': 'XP',
  'com.neon': 'Neon',
  'com.pagbank.app': 'PagBank',
  'br.com.uol.ps.myaccount': 'PagBank',
  'com.google.android.apps.walletnfcrel': 'Google Wallet',
  'com.samsung.android.spay': 'Samsung Wallet',
};

const RE_VALOR = /R\$\s*(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:,\d{1,2})?)/i;
const RE_FINAL = /(?:final\s*(?:do cart[aã]o\s*)?|[•·]{1,4}\s*)(\d{4})/i;
const RE_DATA = /\b(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b/;
const RE_HORA = /\b(\d{1,2})[:h](\d{2})\b/;

// Notificações que NÃO são gastos (devem ser ignoradas).
const IGNORAR = [
  /recusad/i, /negad/i, /n[aã]o aprovad/i, /n[aã]o autorizad/i, /bloquead/i,
  /fatura (est[aá] )?(fechad|dispon[ií]vel|venc)/i, /limite dispon/i, /seu limite/i,
  /c[oó]digo de (seguran|verifica)/i, /\btoken\b/i, /senha/i, /cashback dispon/i,
  /agendad[oa]/i, /promo[cç][aã]o/i, /oferta/i, /pr[eé]-aprovad/i, /rendeu|rendimento/i,
];

const RECEITA = [/pix recebido/i, /voc[eê] recebeu/i, /recebeu um pix/i, /transfer[eê]ncia recebida/i, /dep[oó]sito recebido/i, /sal[aá]rio/i, /cr[eé]dito em conta/i, /estorno/i, /reembolso/i];

// Padrões para extrair o estabelecimento/destinatário. Testados em ordem.
const PADROES_ESTABELECIMENTO = [
  /\b(?:estabelecimento|local)\s*:?\s*([^,.\n]+?)(?:\s+(?:no valor|valor|em \d|cart[aã]o|final|R\$)|[,.\n]|$)/i,
  /\b(?:para|pra)\s+(?!o cart[aã]o|seu cart[aã]o)([^,.\n]+?)(?:\s+(?:no valor|via|com o cart|cart[aã]o|final|em \d)|[,.\n]|$)/i,
  /R\$\s*[\d.,]+\s+(?:aprovad[ao]\s+)?\b(?:em|no|na)\s+([^,.\n]+?)(?:\s+(?:para o cart|no cart|cart[aã]o|final|em \d|às|as \d)|[,.\n]|$)/i,
  /\s[-–]\s([^-–\n]+?)\s[-–]\s*R\$/i, // Itaú: "... final 1234 - PADARIA XYZ - R$ 25,90"
  /\b(?:compra|pagamento|d[eé]bito)\s+(?:aprovad[ao]\s+)?(?:em|no|na)\s+([^,.\n]+?)(?:\s+(?:de|no valor|valor|R\$|cart[aã]o|final)|[,.\n]|$)/i,
  /\b(?:em|no|na)\s+([A-Z0-9*][A-Z0-9 *&'.\/-]{2,}?)(?:\s+(?:para o cart|no cart|cart[aã]o|final|em \d|às)|[,\n]|\.\s|$)/,
];

export function parseValor(str) {
  const m = String(str).match(RE_VALOR);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function detectarTipo(t) {
  if (/\bpix\b/i.test(t)) return 'pix';
  if (/transfer[eê]ncia|\bted\b|\bdoc\b/i.test(t)) return 'transferencia';
  if (/boleto|conta de|pagamento de conta/i.test(t)) return 'boleto';
  if (/d[eé]bito/i.test(t)) return 'debito';
  if (/cr[eé]dito|cart[aã]o|compra/i.test(t)) return 'credito';
  return 'outro';
}

function limparEstabelecimento(s) {
  return s
    .replace(/\s+(?:no valor|valor|de)\s*$/i, '')
    .replace(/\s+em\s+\d{2}\/\d{2}.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s*:-]+|[\s*:.-]+$/g, '')
    .trim();
}

// Em entradas, quem importa é a origem: "Você recebeu um Pix de R$ 500,00 de JOAO".
const RE_ORIGEM_RECEITA = /R\$\s*[\d.,]+\s+(?:de|do|da)\s+([^,.\n]+?)(?:\s+(?:via|em \d)|[,.\n]|$)/i;

function extrairEstabelecimento(t, receita = false) {
  const padroes = receita ? [RE_ORIGEM_RECEITA, ...PADROES_ESTABELECIMENTO] : PADROES_ESTABELECIMENTO;
  for (const re of padroes) {
    const m = t.match(re);
    if (m && m[1]) {
      const e = limparEstabelecimento(m[1]);
      if (e.length >= 2 && !/^R\$/.test(e) && !/^\d+([.,]\d+)?$/.test(e) && !/^\d{1,2}\/\d{1,2}/.test(e)) return e;
    }
  }
  return null;
}

// Horários que aparecem no texto da notificação são de Brasília (UTC-3).
const OFFSET_BR_H = 3;

function extrairData(t, referencia) {
  const ref = referencia && !Number.isNaN(new Date(referencia).getTime()) ? new Date(referencia) : new Date();
  const d = t.match(RE_DATA);
  if (!d) return ref.toISOString();
  const h = t.match(RE_HORA);
  const refBr = new Date(ref.getTime() - OFFSET_BR_H * 3600e3); // campos UTC = relógio de Brasília
  const dia = Number(d[1]);
  const mes = Number(d[2]) - 1;
  let ano = d[3] ? Number(d[3]) : refBr.getUTCFullYear();
  if (ano < 100) ano += 2000;
  if (dia < 1 || dia > 31 || mes < 0 || mes > 11) return ref.toISOString();
  const hora = h ? Number(h[1]) : refBr.getUTCHours();
  const min = h ? Number(h[2]) : refBr.getUTCMinutes();
  let ms = Date.UTC(ano, mes, dia, hora + OFFSET_BR_H, min);
  // Sem ano explícito e "no futuro": é do ano anterior (ex.: compra de 31/12 notificada em janeiro).
  if (!d[3] && ms - ref.getTime() > 7 * 864e5) ms = Date.UTC(ano - 1, mes, dia, hora + OFFSET_BR_H, min);
  return new Date(ms).toISOString();
}

/**
 * Interpreta uma notificação.
 * @param {{app?: string, title?: string, text?: string, ts?: string|number}} n
 * @returns {{status: 'ok'|'ignorada'|'nao_reconhecida', motivo?: string, transacao?: object}}
 */
// Carteira do Google (Google Wallet): o título é o estabelecimento e o texto traz valor e cartão.
//   título: "MP *LANCHONETEMAY"   texto: "R$ 25,00 com Nubank Mastercard Platinum ••9975"
const RE_CARTEIRA = /^\s*R\$\s*[\d.,]+\s+com\s+(.+?)\s*(?:[•·*.]{1,4}\s*)(\d{4})\s*$/i;

function parseCarteira({ app, title, text }, ts) {
  const m = String(text || '').match(RE_CARTEIRA);
  if (!m || !title?.trim()) return null;
  return {
    status: 'ok',
    transacao: {
      data: extrairData('', ts),
      valor: parseValor(text),
      natureza: 'despesa',
      tipo: 'credito',
      estabelecimento: title.trim(),
      conta: m[1].trim() || APPS[app] || app || null, // ex.: "Nubank Mastercard Platinum"
      cartao_final: m[2],
      origem: 'notificacao',
    },
  };
}

export function parseNotificacao({ app = '', title = '', text = '', ts } = {}) {
  const t = `${title || ''}\n${text || ''}`.trim();
  if (!t) return { status: 'nao_reconhecida', motivo: 'vazia' };

  const valor = parseValor(t);
  if (valor == null || valor === 0) return { status: 'ignorada', motivo: 'sem valor' };
  for (const re of IGNORAR) if (re.test(t)) return { status: 'ignorada', motivo: `filtro: ${re.source}` };

  const carteira = parseCarteira({ app, title, text }, ts ? new Date(Number(ts) || ts) : undefined);
  if (carteira) return carteira;

  const receita = RECEITA.some((re) => re.test(t));
  const tipo = detectarTipo(t);
  const estabelecimento = extrairEstabelecimento(t, receita) || (tipo === 'pix' ? 'Pix (sem destinatário)' : null);
  if (!estabelecimento) return { status: 'nao_reconhecida', motivo: 'estabelecimento não encontrado' };

  const final = t.match(RE_FINAL);
  return {
    status: 'ok',
    transacao: {
      data: extrairData(t, ts ? new Date(Number(ts) || ts) : undefined),
      valor,
      natureza: receita ? 'receita' : 'despesa',
      tipo,
      estabelecimento,
      conta: APPS[app] || app || null,
      cartao_final: final ? final[1] : null,
      origem: 'notificacao',
    },
  };
}

/**
 * Lançamento manual em linguagem natural: "padaria 18,50", "gastei 120 no posto", "42,90 ifood".
 */
export function parseLancamentoManual(texto, agora = new Date()) {
  const t = String(texto || '').trim();
  const m = t.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  let bruto = m[1];
  // "12.50" (ponto decimal) vs "1.250" (milhar)
  bruto = /^\d+\.\d{1,2}$/.test(bruto) ? bruto : bruto.replace(/\./g, '').replace(',', '.');
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const descricao = t
    .replace(m[0], ' ')
    .replace(/\b(gastei|paguei|comprei|reais|real|no|na|em|de|do|da|com|hoje)\b/gi, ' ')
    .replace(/R\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    data: agora.toISOString(),
    valor,
    natureza: /\b(recebi|ganhei|entrou)\b/i.test(t) ? 'receita' : 'despesa',
    tipo: /\bpix\b/i.test(t) ? 'pix' : 'outro',
    estabelecimento: descricao ? descricao.charAt(0).toUpperCase() + descricao.slice(1) : 'Lançamento manual',
    conta: null,
    cartao_final: null,
    origem: 'manual',
  };
}

export { normalizar };
