import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { categorizar, chaveEstabelecimento } from './categorias.js';

// Datas são gravadas no horário de Brasília (UTC-3, sem horário de verão desde 2019)
// como texto "YYYY-MM-DDTHH:MM:SS", para que agrupar por mês use o calendário local.
const OFFSET_BR_MS = 3 * 60 * 60e3;
export function paraHorarioBrasilia(dataIso) {
  const d = dataIso ? new Date(dataIso) : new Date();
  const ms = Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
  return new Date(ms - OFFSET_BR_MS).toISOString().slice(0, 19);
}

/** "2026-11" -> { inicio: "2026-11-01T00:00:00", fim: "2026-12-01T00:00:00" } */
export function intervaloDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const prox = m === 12 ? [a + 1, 1] : [a, m + 1];
  return { inicio: `${a}-${pad(m)}-01T00:00:00`, fim: `${prox[0]}-${pad(prox[1])}-01T00:00:00` };
}

export function mesesAnteriores(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function abrirBanco(caminho = process.env.DB_PATH || './data/gastos.db') {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recebida_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      app TEXT, titulo TEXT, texto TEXT,
      hash TEXT NOT NULL,
      status TEXT NOT NULL,           -- ok | ignorada | nao_reconhecida | duplicada
      motivo TEXT,
      transacao_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_notif_hash ON notificacoes(hash, recebida_em);
    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      valor REAL NOT NULL,
      natureza TEXT NOT NULL DEFAULT 'despesa',  -- despesa | receita
      tipo TEXT,                                 -- credito | debito | pix | boleto | transferencia | outro
      estabelecimento TEXT NOT NULL,
      categoria TEXT NOT NULL,
      conta TEXT,
      cartao_final TEXT,
      origem TEXT NOT NULL,                      -- notificacao | manual
      criada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_data ON transacoes(data);
    CREATE TABLE IF NOT EXISTS regras (
      chave TEXT PRIMARY KEY,
      categoria TEXT NOT NULL
    );
  `);
  return new Repositorio(db);
}

class Repositorio {
  constructor(db) {
    this.db = db;
  }

  regras() {
    return new Map(this.db.prepare('SELECT chave, categoria FROM regras').all().map((r) => [r.chave, r.categoria]));
  }

  // Mesma notificação repetida em até 10 minutos é tratada como duplicata
  // (o Android costuma reemitir/atualizar a notificação).
  ehDuplicada(hash) {
    const limite = new Date(Date.now() - 10 * 60e3).toISOString();
    return !!this.db.prepare("SELECT 1 FROM notificacoes WHERE hash = ? AND recebida_em >= ? AND status <> 'duplicada' LIMIT 1").get(hash, limite);
  }

  static hashNotificacao({ app = '', title = '', text = '' }) {
    return createHash('sha1').update(`${app}|${title}|${text}`).digest('hex');
  }

  /**
   * A mesma compra costuma gerar duas notificações (Carteira do Google e app do banco).
   * Considera repetida a despesa de mesmo valor, mesmo final de cartão (ou mesmo
   * estabelecimento, se não houver cartão) registrada a até 10 minutos de distância.
   */
  buscarMesmaCompra(tx) {
    if (tx.natureza === 'receita') return null;
    const data = paraHorarioBrasilia(tx.data);
    const t = new Date(`${data}Z`).getTime();
    const ini = new Date(t - 10 * 60e3).toISOString().slice(0, 19);
    const fim = new Date(t + 10 * 60e3).toISOString().slice(0, 19);
    const candidatas = this.db
      .prepare(`SELECT * FROM transacoes WHERE origem = 'notificacao' AND natureza = 'despesa'
                AND ABS(valor - ?) < 0.005 AND data BETWEEN ? AND ?`)
      .all(tx.valor, ini, fim);
    const chave = chaveEstabelecimento(tx.estabelecimento);
    return candidatas.find((c) =>
      tx.cartao_final && c.cartao_final ? c.cartao_final === tx.cartao_final : chaveEstabelecimento(c.estabelecimento) === chave,
    ) || null;
  }

  registrarNotificacao({ app, title, text }, hash, status, motivo, transacaoId = null) {
    this.db
      .prepare('INSERT INTO notificacoes (app, titulo, texto, hash, status, motivo, transacao_id) VALUES (?,?,?,?,?,?,?)')
      .run(app ?? null, title ?? null, text ?? null, hash, status, motivo ?? null, transacaoId);
  }

  inserirTransacao(tx) {
    const categoria = tx.categoria || categorizar(tx.estabelecimento, { tipo: tx.tipo, regras: this.regras() });
    const r = this.db
      .prepare(`INSERT INTO transacoes (data, valor, natureza, tipo, estabelecimento, categoria, conta, cartao_final, origem)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(paraHorarioBrasilia(tx.data), tx.valor, tx.natureza || 'despesa', tx.tipo || null, tx.estabelecimento, categoria, tx.conta || null, tx.cartao_final || null, tx.origem);
    return this.obterTransacao(Number(r.lastInsertRowid));
  }

  obterTransacao(id) {
    return this.db.prepare('SELECT * FROM transacoes WHERE id = ?').get(id);
  }

  listarTransacoes({ inicio, fim }) {
    return this.db.prepare('SELECT * FROM transacoes WHERE data >= ? AND data < ? ORDER BY data DESC, id DESC').all(inicio, fim);
  }

  /** Altera a categoria; com aprender=true grava a regra e reclassifica o histórico do mesmo estabelecimento. */
  alterarCategoria(id, categoria, aprender = true) {
    const tx = this.obterTransacao(id);
    if (!tx) return null;
    this.db.prepare('UPDATE transacoes SET categoria = ? WHERE id = ?').run(categoria, id);
    let reclassificadas = 0;
    const chave = chaveEstabelecimento(tx.estabelecimento);
    if (aprender && chave) {
      this.db.prepare('INSERT INTO regras (chave, categoria) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET categoria = excluded.categoria').run(chave, categoria);
      for (const outra of this.db.prepare('SELECT id, estabelecimento FROM transacoes WHERE id <> ? AND categoria <> ?').all(id, categoria)) {
        if (chaveEstabelecimento(outra.estabelecimento) === chave) {
          this.db.prepare('UPDATE transacoes SET categoria = ? WHERE id = ?').run(categoria, outra.id);
          reclassificadas++;
        }
      }
    }
    return { transacao: this.obterTransacao(id), reclassificadas };
  }

  removerTransacao(id) {
    return this.db.prepare('DELETE FROM transacoes WHERE id = ?').run(id).changes > 0;
  }

  notificacoesPendentes(limite = 50) {
    return this.db
      .prepare("SELECT id, recebida_em, app, titulo, texto, status, motivo FROM notificacoes WHERE status = 'nao_reconhecida' ORDER BY id DESC LIMIT ?")
      .all(limite);
  }

  resumo({ inicio, fim }) {
    const porCategoria = this.db
      .prepare(`SELECT categoria, ROUND(SUM(valor),2) total, COUNT(*) qtd FROM transacoes
                WHERE natureza = 'despesa' AND data >= ? AND data < ? GROUP BY categoria ORDER BY total DESC`)
      .all(inicio, fim);
    const totais = this.db
      .prepare(`SELECT
                  COALESCE(SUM(CASE WHEN natureza='despesa' THEN valor END),0) despesas,
                  COALESCE(SUM(CASE WHEN natureza='receita' THEN valor END),0) receitas,
                  COUNT(CASE WHEN natureza='despesa' THEN 1 END) qtd
                FROM transacoes WHERE data >= ? AND data < ?`)
      .get(inicio, fim);
    const topEstabelecimentos = this.db
      .prepare(`SELECT estabelecimento, categoria, ROUND(SUM(valor),2) total, COUNT(*) qtd FROM transacoes
                WHERE natureza='despesa' AND data >= ? AND data < ?
                GROUP BY estabelecimento ORDER BY total DESC LIMIT 8`)
      .all(inicio, fim);
    const porConta = this.db
      .prepare(`SELECT COALESCE(conta,'Manual') conta, ROUND(SUM(valor),2) total FROM transacoes
                WHERE natureza='despesa' AND data >= ? AND data < ? GROUP BY 1 ORDER BY total DESC`)
      .all(inicio, fim);
    const naoReconhecidas = this.db.prepare("SELECT COUNT(*) n FROM notificacoes WHERE status='nao_reconhecida'").get().n;
    return { totais, porCategoria, topEstabelecimentos, porConta, naoReconhecidas };
  }

  /** Despesas por mês e categoria nos últimos N meses (para o gráfico de evolução). */
  evolucao(mes, n = 6) {
    const lista = mesesAnteriores(mes, n);
    const linhas = this.db
      .prepare(`SELECT substr(data,1,7) mes, categoria, ROUND(SUM(valor),2) total FROM transacoes
                WHERE natureza='despesa' AND data >= ? AND data < ? GROUP BY 1,2 ORDER BY 1`)
      .all(intervaloDoMes(lista[0]).inicio, intervaloDoMes(mes).fim);
    return { meses: lista, linhas };
  }
}

export { Repositorio };
