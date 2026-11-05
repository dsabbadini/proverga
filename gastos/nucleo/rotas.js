// Regras da API, independentes de HTTP. Usadas pelo servidor Node (src/server.js)
// e pelo app Android (nucleo/api-local.js), garantindo o mesmo comportamento nos dois.
import { parseNotificacao, parseLancamentoManual } from './parser.js';
import { CATEGORIAS, CATEGORIA_POR_ID } from './categorias.js';
import { paraHorarioBrasilia, intervaloDoMes, hashNotificacao } from './datas.js';

const mesAtual = () => paraHorarioBrasilia().slice(0, 7);
const mesValido = (m) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') ? m : mesAtual());

/** Processa uma notificação recebida (do MacroDroid, via HTTP, ou do leitor nativo do app). */
export function receberNotificacao(repo, corpo = {}) {
  const n = {
    app: corpo.app || corpo.package || corpo.app_package || '',
    title: corpo.title || corpo.titulo || '',
    text: corpo.text || corpo.texto || corpo.message || '',
    ts: corpo.ts || corpo.timestamp,
  };
  // Momento da notificação (o app pode processar a fila minutos depois de recebê-la).
  const tsNum = Number(n.ts);
  const ref = n.ts ? new Date(Number.isFinite(tsNum) && tsNum > 0 ? tsNum : n.ts) : new Date();
  const quando = paraHorarioBrasilia(Number.isNaN(ref.getTime()) ? undefined : ref.toISOString());
  const hash = hashNotificacao(n);
  if (repo.ehDuplicada(hash, quando)) {
    repo.registrarNotificacao(n, hash, 'duplicada', null, null, quando);
    return { status: 200, corpo: { status: 'duplicada' } };
  }
  const r = parseNotificacao(n);
  let transacao = null;
  if (r.status === 'ok') {
    const existente = repo.buscarMesmaCompra(r.transacao);
    if (existente) {
      repo.registrarNotificacao(n, hash, 'duplicada', `mesma compra da transação ${existente.id}`, existente.id, quando);
      return { status: 200, corpo: { status: 'duplicada', transacao: existente } };
    }
    transacao = repo.inserirTransacao(r.transacao);
  }
  repo.registrarNotificacao(n, hash, r.status, r.motivo, transacao?.id ?? null, quando);
  return { status: r.status === 'ok' ? 201 : 200, corpo: { status: r.status, motivo: r.motivo, transacao } };
}

/**
 * @param {object} repo  repositório (SQLite ou memória)
 * @param {{metodo: string, caminho: string, query?: URLSearchParams, corpo?: object}} req
 * @returns {{status: number, corpo: any}}
 */
export function tratar(repo, { metodo, caminho, query = new URLSearchParams(), corpo = {} }) {
  if (caminho === '/api/notificacoes' && metodo === 'POST') {
    return receberNotificacao(repo, { ...corpo, app: corpo.app || query.get('app') || corpo.package || corpo.app_package });
  }

  if (caminho === '/api/categorias' && metodo === 'GET') {
    return { status: 200, corpo: CATEGORIAS.map(({ id, nome, cor }) => ({ id, nome, cor })) };
  }

  if (caminho === '/api/transacoes' && metodo === 'GET') {
    return { status: 200, corpo: repo.listarTransacoes(intervaloDoMes(mesValido(query.get('mes')))) };
  }

  // Lançamento manual: { texto: "padaria 18,50" } ou campos estruturados.
  if (caminho === '/api/transacoes' && metodo === 'POST') {
    let tx = corpo.texto ? parseLancamentoManual(corpo.texto) : null;
    if (!tx && corpo.valor && corpo.estabelecimento) {
      tx = { data: corpo.data || new Date().toISOString(), valor: Math.abs(Number(corpo.valor)), natureza: corpo.natureza === 'receita' ? 'receita' : 'despesa', tipo: corpo.tipo || 'outro', estabelecimento: String(corpo.estabelecimento).slice(0, 120), origem: 'manual' };
    }
    if (!tx || !Number.isFinite(tx.valor) || tx.valor <= 0) return { status: 400, corpo: { erro: 'Não entendi. Exemplo: "padaria 18,50".' } };
    if (corpo.categoria && CATEGORIA_POR_ID[corpo.categoria]) tx.categoria = corpo.categoria;
    return { status: 201, corpo: repo.inserirTransacao(tx) };
  }

  const m = caminho.match(/^\/api\/transacoes\/(\d+)$/);
  if (m && metodo === 'PATCH') {
    if (!CATEGORIA_POR_ID[corpo.categoria]) return { status: 400, corpo: { erro: 'categoria inválida' } };
    const r = repo.alterarCategoria(Number(m[1]), corpo.categoria, corpo.aprender !== false);
    return r ? { status: 200, corpo: r } : { status: 404, corpo: { erro: 'não encontrada' } };
  }
  if (m && metodo === 'DELETE') {
    return repo.removerTransacao(Number(m[1])) ? { status: 200, corpo: { ok: true } } : { status: 404, corpo: { erro: 'não encontrada' } };
  }

  if (caminho === '/api/resumo' && metodo === 'GET') {
    const mes = mesValido(query.get('mes'));
    return { status: 200, corpo: { mes, ...repo.resumo(intervaloDoMes(mes)), evolucao: repo.evolucao(mes, 6) } };
  }

  if (caminho === '/api/notificacoes/pendentes' && metodo === 'GET') {
    return { status: 200, corpo: repo.notificacoesPendentes() };
  }

  return { status: 404, corpo: { erro: 'rota não encontrada' } };
}
