import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { abrirBanco, intervaloDoMes, paraHorarioBrasilia, Repositorio } from './db.js';
import { parseNotificacao, parseLancamentoManual } from './parser.js';
import { CATEGORIAS, CATEGORIA_POR_ID } from './categorias.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLICO = join(RAIZ, 'public');

// Carrega .env simples (KEY=VALUE) sem dependências.
const arquivoEnv = join(RAIZ, '.env');
if (existsSync(arquivoEnv)) {
  for (const linha of readFileSync(arquivoEnv, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export function criarApp({ repo, token }) {
  if (!token || token.length < 16) throw new Error('Defina APP_TOKEN com pelo menos 16 caracteres (veja .env.example).');
  const tokenBuf = Buffer.from(token);

  const autorizado = (req, url) => {
    const h = req.headers.authorization || '';
    const recebido = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token') || '';
    const buf = Buffer.from(recebido);
    return buf.length === tokenBuf.length && timingSafeEqual(buf, tokenBuf);
  };

  const json = (res, status, corpo) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(corpo));
  };

  const lerCorpo = (req) =>
    new Promise((resolve, reject) => {
      let tamanho = 0;
      const partes = [];
      req.on('data', (c) => {
        tamanho += c.length;
        if (tamanho > 64 * 1024) {
          reject(Object.assign(new Error('corpo muito grande'), { status: 413 }));
          req.destroy();
        } else partes.push(c);
      });
      req.on('end', () => {
        const bruto = Buffer.concat(partes).toString('utf8');
        const tipo = req.headers['content-type'] || '';
        try {
          if (!bruto) return resolve({});
          if (tipo.includes('application/json')) return resolve(JSON.parse(bruto));
          if (tipo.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(bruto)));
          // text/plain: trata o corpo inteiro como texto da notificação
          try { return resolve(JSON.parse(bruto)); } catch { return resolve({ text: bruto }); }
        } catch {
          reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });

  const mesAtual = () => paraHorarioBrasilia().slice(0, 7);
  const mesValido = (m) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') ? m : mesAtual());

  async function api(req, res, url) {
    const { pathname } = url;
    const metodo = req.method;

    if (pathname === '/api/saude') return json(res, 200, { ok: true });
    if (!autorizado(req, url)) return json(res, 401, { erro: 'token inválido' });

    // Recebe notificação push encaminhada pelo celular (MacroDroid/Tasker/app próprio).
    if (pathname === '/api/notificacoes' && metodo === 'POST') {
      const corpo = await lerCorpo(req);
      const n = {
        app: corpo.app || corpo.package || corpo.app_package || url.searchParams.get('app') || '',
        title: corpo.title || corpo.titulo || '',
        text: corpo.text || corpo.texto || corpo.message || '',
        ts: corpo.ts || corpo.timestamp,
      };
      const hash = Repositorio.hashNotificacao(n);
      if (repo.ehDuplicada(hash)) {
        repo.registrarNotificacao(n, hash, 'duplicada');
        return json(res, 200, { status: 'duplicada' });
      }
      const r = parseNotificacao(n);
      let transacao = null;
      if (r.status === 'ok') {
        const existente = repo.buscarMesmaCompra(r.transacao);
        if (existente) {
          repo.registrarNotificacao(n, hash, 'duplicada', `mesma compra da transação ${existente.id}`, existente.id);
          return json(res, 200, { status: 'duplicada', transacao: existente });
        }
        transacao = repo.inserirTransacao(r.transacao);
      }
      repo.registrarNotificacao(n, hash, r.status, r.motivo, transacao?.id);
      return json(res, r.status === 'ok' ? 201 : 200, { status: r.status, motivo: r.motivo, transacao });
    }

    if (pathname === '/api/categorias' && metodo === 'GET') {
      return json(res, 200, CATEGORIAS.map(({ id, nome, cor }) => ({ id, nome, cor })));
    }

    if (pathname === '/api/transacoes' && metodo === 'GET') {
      return json(res, 200, repo.listarTransacoes(intervaloDoMes(mesValido(url.searchParams.get('mes')))));
    }

    // Lançamento manual: { texto: "padaria 18,50" } ou campos estruturados.
    if (pathname === '/api/transacoes' && metodo === 'POST') {
      const corpo = await lerCorpo(req);
      let tx = corpo.texto ? parseLancamentoManual(corpo.texto) : null;
      if (!tx && corpo.valor && corpo.estabelecimento) {
        tx = { data: corpo.data || new Date().toISOString(), valor: Math.abs(Number(corpo.valor)), natureza: corpo.natureza === 'receita' ? 'receita' : 'despesa', tipo: corpo.tipo || 'outro', estabelecimento: String(corpo.estabelecimento).slice(0, 120), origem: 'manual' };
      }
      if (!tx || !Number.isFinite(tx.valor) || tx.valor <= 0) return json(res, 400, { erro: 'Não entendi. Exemplo: "padaria 18,50".' });
      if (corpo.categoria && CATEGORIA_POR_ID[corpo.categoria]) tx.categoria = corpo.categoria;
      return json(res, 201, repo.inserirTransacao(tx));
    }

    const m = pathname.match(/^\/api\/transacoes\/(\d+)$/);
    if (m && metodo === 'PATCH') {
      const corpo = await lerCorpo(req);
      if (!CATEGORIA_POR_ID[corpo.categoria]) return json(res, 400, { erro: 'categoria inválida' });
      const r = repo.alterarCategoria(Number(m[1]), corpo.categoria, corpo.aprender !== false);
      return r ? json(res, 200, r) : json(res, 404, { erro: 'não encontrada' });
    }
    if (m && metodo === 'DELETE') {
      return repo.removerTransacao(Number(m[1])) ? json(res, 200, { ok: true }) : json(res, 404, { erro: 'não encontrada' });
    }

    if (pathname === '/api/resumo' && metodo === 'GET') {
      const mes = mesValido(url.searchParams.get('mes'));
      return json(res, 200, { mes, ...repo.resumo(intervaloDoMes(mes)), evolucao: repo.evolucao(mes, 6) });
    }

    if (pathname === '/api/notificacoes/pendentes' && metodo === 'GET') {
      return json(res, 200, repo.notificacoesPendentes());
    }

    return json(res, 404, { erro: 'rota não encontrada' });
  }

  async function estatico(req, res, url) {
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '').replace(/^(\.\.[/\\])+/, '');
    const caminho = join(PUBLICO, rel || 'index.html');
    if (!caminho.startsWith(PUBLICO)) return json(res, 403, { erro: 'proibido' });
    try {
      const conteudo = await readFile(caminho);
      res.writeHead(200, { 'Content-Type': MIME[extname(caminho)] || 'application/octet-stream' });
      res.end(conteudo);
    } catch {
      const index = await readFile(join(PUBLICO, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(index);
    }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await estatico(req, res, url);
    } catch (e) {
      if (!res.headersSent) json(res, e.status || 500, { erro: e.status ? e.message : 'erro interno' });
      if (!e.status) console.error(e);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const porta = Number(process.env.PORT || 3000);
  const app = criarApp({ repo: abrirBanco(), token: process.env.APP_TOKEN });
  // Padrão: só o próprio aparelho acessa (seguro no celular, mesmo em Wi-Fi público).
  // Em servidor/nuvem defina HOST=0.0.0.0.
  const host = process.env.HOST || '127.0.0.1';
  app.listen(porta, host, () => console.log(`Meu Gasto rodando em http://${host === '0.0.0.0' ? 'localhost' : host}:${porta}`));
}
