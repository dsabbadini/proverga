// Datas são gravadas no horário de Brasília (UTC-3, sem horário de verão desde 2019)
// como texto "YYYY-MM-DDTHH:MM:SS", para que agrupar por mês use o calendário local.
// Módulo puro: roda no Node (servidor) e no navegador/WebView (app Android).
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
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7));
}

/** Soma ±minutos a uma data "YYYY-MM-DDTHH:MM:SS" (horário de Brasília) mantendo o formato. */
export function deslocarMinutos(dataBr, minutos) {
  return new Date(new Date(`${dataBr}Z`).getTime() + minutos * 60e3).toISOString().slice(0, 19);
}

/** Hash estável de 53 bits (cyrb53) para deduplicar notificações sem depender de crypto. */
export function hashTexto(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export const hashNotificacao = ({ app = '', title = '', text = '' }) => hashTexto(`${app}|${title}|${text}`);
