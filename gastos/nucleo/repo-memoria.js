// Repositório em memória com a mesma interface do SQLite (src/db.js).
// Usado pelo app Android: o estado vive em memória e é salvo como JSON pelo lado nativo.
import { categorizar, chaveEstabelecimento } from './categorias.js';
import { paraHorarioBrasilia, intervaloDoMes, mesesAnteriores, deslocarMinutos } from './datas.js';

const MAX_NOTIFICACOES = 500; // histórico de notificações processadas (pendentes são sempre mantidas)
const arred = (n) => Math.round(n * 100) / 100;

export class RepositorioMemoria {
  /**
   * @param {object} [dados] estado salvo anteriormente
   * @param {(dados: object) => void} [salvar] chamado após cada alteração
   */
  constructor(dados, salvar = () => {}) {
    this.d = { versao: 1, proxId: 1, proxNotif: 1, transacoes: [], notificacoes: [], regras: {}, ...(dados || {}) };
    this.salvar = salvar;
  }

  persistir() {
    const pend = this.d.notificacoes.filter((n) => n.status === 'nao_reconhecida');
    const resto = this.d.notificacoes.filter((n) => n.status !== 'nao_reconhecida');
    if (resto.length > MAX_NOTIFICACOES) this.d.notificacoes = [...pend, ...resto.slice(-MAX_NOTIFICACOES)].sort((a, b) => a.id - b.id);
    this.salvar(this.d);
  }

  regras() {
    return new Map(Object.entries(this.d.regras));
  }

  ehDuplicada(hash, quando = paraHorarioBrasilia()) {
    const ini = deslocarMinutos(quando, -10);
    const fim = deslocarMinutos(quando, 10);
    return this.d.notificacoes.some((n) => n.hash === hash && n.status !== 'duplicada' && n.recebida_em >= ini && n.recebida_em <= fim);
  }

  buscarMesmaCompra(tx) {
    if (tx.natureza === 'receita') return null;
    const data = paraHorarioBrasilia(tx.data);
    const ini = deslocarMinutos(data, -10);
    const fim = deslocarMinutos(data, 10);
    const chave = chaveEstabelecimento(tx.estabelecimento);
    return this.d.transacoes.find((c) =>
      c.origem === 'notificacao' && c.natureza === 'despesa' && Math.abs(c.valor - tx.valor) < 0.005 &&
      c.data >= ini && c.data <= fim &&
      (tx.cartao_final && c.cartao_final ? c.cartao_final === tx.cartao_final : chaveEstabelecimento(c.estabelecimento) === chave),
    ) || null;
  }

  registrarNotificacao({ app, title, text }, hash, status, motivo = null, transacaoId = null, quando = paraHorarioBrasilia()) {
    this.d.notificacoes.push({ id: this.d.proxNotif++, recebida_em: quando, app: app ?? null, titulo: title ?? null, texto: text ?? null, hash, status, motivo: motivo ?? null, transacao_id: transacaoId });
    this.persistir();
  }

  inserirTransacao(tx) {
    const categoria = tx.categoria || categorizar(tx.estabelecimento, { tipo: tx.tipo, regras: this.regras() });
    const nova = {
      id: this.d.proxId++,
      data: paraHorarioBrasilia(tx.data),
      valor: tx.valor,
      natureza: tx.natureza || 'despesa',
      tipo: tx.tipo || null,
      estabelecimento: tx.estabelecimento,
      categoria,
      conta: tx.conta || null,
      cartao_final: tx.cartao_final || null,
      origem: tx.origem,
      criada_em: new Date().toISOString(),
    };
    this.d.transacoes.push(nova);
    this.persistir();
    return { ...nova };
  }

  obterTransacao(id) {
    const t = this.d.transacoes.find((x) => x.id === id);
    return t ? { ...t } : undefined;
  }

  doPeriodo({ inicio, fim }) {
    return this.d.transacoes.filter((t) => t.data >= inicio && t.data < fim);
  }

  listarTransacoes(periodo) {
    return this.doPeriodo(periodo)
      .sort((a, b) => (a.data === b.data ? b.id - a.id : a.data < b.data ? 1 : -1))
      .map((t) => ({ ...t }));
  }

  alterarCategoria(id, categoria, aprender = true) {
    const tx = this.d.transacoes.find((x) => x.id === id);
    if (!tx) return null;
    tx.categoria = categoria;
    let reclassificadas = 0;
    const chave = chaveEstabelecimento(tx.estabelecimento);
    if (aprender && chave) {
      this.d.regras[chave] = categoria;
      for (const outra of this.d.transacoes) {
        if (outra.id !== id && outra.categoria !== categoria && chaveEstabelecimento(outra.estabelecimento) === chave) {
          outra.categoria = categoria;
          reclassificadas++;
        }
      }
    }
    this.persistir();
    return { transacao: { ...tx }, reclassificadas };
  }

  removerTransacao(id) {
    const antes = this.d.transacoes.length;
    this.d.transacoes = this.d.transacoes.filter((t) => t.id !== id);
    const removeu = this.d.transacoes.length < antes;
    if (removeu) this.persistir();
    return removeu;
  }

  notificacoesPendentes(limite = 50) {
    return this.d.notificacoes
      .filter((n) => n.status === 'nao_reconhecida')
      .sort((a, b) => b.id - a.id)
      .slice(0, limite)
      .map(({ id, recebida_em, app, titulo, texto, status, motivo }) => ({ id, recebida_em, app, titulo, texto, status, motivo }));
  }

  resumo(periodo) {
    const txs = this.doPeriodo(periodo);
    const desp = txs.filter((t) => t.natureza === 'despesa');
    const agrupar = (lista, chave) => {
      const m = new Map();
      for (const t of lista) {
        const k = chave(t);
        const g = m.get(k) || { total: 0, qtd: 0, primeira: t };
        g.total += t.valor;
        g.qtd++;
        m.set(k, g);
      }
      return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
    };
    return {
      totais: {
        despesas: desp.reduce((s, t) => s + t.valor, 0),
        receitas: txs.filter((t) => t.natureza === 'receita').reduce((s, t) => s + t.valor, 0),
        qtd: desp.length,
      },
      porCategoria: agrupar(desp, (t) => t.categoria).map(([categoria, g]) => ({ categoria, total: arred(g.total), qtd: g.qtd })),
      topEstabelecimentos: agrupar(desp, (t) => t.estabelecimento).slice(0, 8)
        .map(([estabelecimento, g]) => ({ estabelecimento, categoria: g.primeira.categoria, total: arred(g.total), qtd: g.qtd })),
      porConta: agrupar(desp, (t) => t.conta || 'Manual').map(([conta, g]) => ({ conta, total: arred(g.total) })),
      naoReconhecidas: this.d.notificacoes.filter((n) => n.status === 'nao_reconhecida').length,
    };
  }

  evolucao(mes, n = 6) {
    const meses = mesesAnteriores(mes, n);
    const txs = this.doPeriodo({ inicio: intervaloDoMes(meses[0]).inicio, fim: intervaloDoMes(mes).fim }).filter((t) => t.natureza === 'despesa');
    const m = new Map();
    for (const t of txs) {
      const k = `${t.data.slice(0, 7)}|${t.categoria}`;
      m.set(k, (m.get(k) || 0) + t.valor);
    }
    const linhas = [...m.entries()]
      .map(([k, total]) => { const [mesK, categoria] = k.split('|'); return { mes: mesK, categoria, total: arred(total) }; })
      .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
    return { meses, linhas };
  }
}
