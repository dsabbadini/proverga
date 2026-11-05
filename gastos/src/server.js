import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { abrirBanco } from './db.js';
import { tratar } from '../nucleo/rotas.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLICO = join(RAIZ, 'public');
const NUCLEO = join(RAIZ, 'nucleo');

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

  async function api(req, res, url) {
    if (url.pathname === '/api/saude') return json(res, 200, { ok: true });
    if (!autorizado(req, url)) return json(res, 401, { erro: 'token inválido' });
    const corpo = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
    const r = tratar(repo, { metodo: req.method, caminho: url.pathname, query: url.searchParams, corpo });
    return json(res, r.status, r.corpo);
  }

  async function estatico(req, res, url) {
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '').replace(/^(\.\.[/\\])+/, '');
    const base = rel.startsWith('nucleo/') ? RAIZ : PUBLICO;
    const caminho = join(base, rel || 'index.html');
    if (!caminho.startsWith(PUBLICO) && !caminho.startsWith(NUCLEO + '/')) return json(res, 403, { erro: 'proibido' });
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
