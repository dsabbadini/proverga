// API local do app Android: o dashboard chama as mesmas rotas, mas tudo roda no aparelho.
// O lado nativo (Kotlin) expõe `window.MeuGastoNativo` com:
//   carregarDados(): string   salvarDados(json)        estado persistido em arquivo privado
//   lerFila(): string         confirmarFila(idsJson)   notificações capturadas em segundo plano
//   temPermissao(): boolean   abrirPermissao()         acesso a notificações do Android
//   exportarBackup(json)                               compartilha um arquivo de backup
import { RepositorioMemoria } from './repo-memoria.js';
import { tratar, receberNotificacao } from './rotas.js';

export function criarApiLocal(nativo) {
  let dados = null;
  try {
    const bruto = nativo.carregarDados();
    dados = bruto ? JSON.parse(bruto) : null;
  } catch (e) {
    console.error('Dados salvos ilegíveis; começando vazio', e);
  }

  let adiado = false;
  const repo = new RepositorioMemoria(dados, (d) => { if (!adiado) nativo.salvarDados(JSON.stringify(d)); });

  /** Processa as notificações capturadas pelo serviço nativo enquanto o app estava fechado. */
  function processarFila() {
    let fila = [];
    try { fila = JSON.parse(nativo.lerFila() || '[]'); } catch { fila = []; }
    if (!fila.length) return { processadas: 0, novas: 0 };
    let novas = 0;
    adiado = true; // grava uma vez só no fim, não a cada notificação
    try {
      for (const item of fila.sort((a, b) => a.ts - b.ts)) {
        const r = receberNotificacao(repo, item);
        if (r.status === 201) novas++;
      }
    } finally {
      adiado = false;
    }
    nativo.salvarDados(JSON.stringify(repo.d));
    nativo.confirmarFila(JSON.stringify(fila.map((i) => i.id)));
    return { processadas: fila.length, novas };
  }

  async function chamar(caminhoCompleto, opcoes = {}) {
    const url = new URL(caminhoCompleto, 'https://local.app');
    const corpo = opcoes.body ? JSON.parse(opcoes.body) : {};
    const r = tratar(repo, { metodo: (opcoes.method || 'GET').toUpperCase(), caminho: url.pathname, query: url.searchParams, corpo });
    if (r.status >= 400) throw new Error(r.corpo?.erro || `Erro ${r.status}`);
    return r.corpo;
  }

  function exportar() {
    nativo.exportarBackup(JSON.stringify(repo.d));
  }

  /** Substitui todos os dados por um backup (JSON exportado antes). */
  function importar(json) {
    const d = JSON.parse(json);
    if (!Array.isArray(d?.transacoes)) throw new Error('Arquivo de backup inválido');
    repo.d = { ...repo.d, ...d };
    nativo.salvarDados(JSON.stringify(repo.d));
  }

  return { chamar, processarFila, exportar, importar, repo };
}
