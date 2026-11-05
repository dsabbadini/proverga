import { icone } from './icones.js';
import { parseLancamentoManual } from './nucleo/parser.js';
import { categorizar } from './nucleo/categorias.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const SEM_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)').matches;

const estado = { token: null, mes: null, categorias: [], nomes: {}, transacoes: [], resumo: null, filtroCategoria: null, busca: '', vista: 'resumo' };
let local = null; // API local no app Android (nucleo/api-local.js)
let nativo = null;

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const vibrar = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
function preencherIcones(raiz = document) {
  for (const el of $$('[data-ic]', raiz)) { el.innerHTML = icone(el.dataset.ic); el.removeAttribute('data-ic'); }
}
function lerToken() { try { return localStorage.getItem('meugasto.token'); } catch { return null; } }
function salvarToken(t) { try { t ? localStorage.setItem('meugasto.token', t) : localStorage.removeItem('meugasto.token'); } catch {} }

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function deslocarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const rotuloMes = (mes) => { const [a, m] = mes.split('-'); return `${MES_CURTO[Number(m) - 1]}/${a.slice(2)}`; };
const nomeMes = (mes) => { const [a, m] = mes.split('-'); return `${MES_LONGO[Number(m) - 1]} ${a}`; };

/** Conta de um valor a outro com desaceleração suave. */
function animarNumero(el, para, fmt = BRL.format) {
  const de = Number(el.dataset.valor || 0);
  el.dataset.valor = para;
  if (SEM_MOVIMENTO || de === para) { el.textContent = fmt(para); return; }
  const inicio = performance.now();
  const dur = 900;
  const passo = (t) => {
    const p = Math.min(1, (t - inicio) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    el.textContent = fmt(de + (para - de) * e);
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

let timerToast;
function toast(msg, ic = 'check') {
  const el = $('#toast');
  el.innerHTML = `${icone(ic)}<span>${esc(msg)}</span>`;
  el.classList.add('visivel');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove('visivel'), 2800);
}

// ---------- API ----------
async function api(caminho, opcoes = {}) {
  if (local) return local.chamar(caminho, opcoes);
  const r = await fetch(caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${estado.token}`, ...(opcoes.headers || {}) },
  });
  if (r.status === 401) { sair(); throw new Error('Token inválido'); }
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ${r.status}`);
  return corpo;
}

// ---------- Navegação ----------
function mostrarVista(nome) {
  if (estado.vista === nome) return;
  estado.vista = nome;
  for (const v of $$('.vista')) v.classList.toggle('ativa', v.id === `v-${nome}`);
  for (const a of $$('.aba')) a.classList.toggle('ativa', a.dataset.vista === nome);
  window.scrollTo({ top: 0, behavior: SEM_MOVIMENTO ? 'auto' : 'smooth' });
  if (nome === 'transacoes') renderTransacoes();
}

// ---------- Resumo ----------
function renderHero(r) {
  const { despesas, receitas, qtd } = r.totais;
  $('#mes-rotulo').textContent = nomeMes(r.mes);
  animarNumero($('#hero-total'), despesas);

  const [a, m] = r.mes.split('-').map(Number);
  const corrente = r.mes === mesAtual();
  const diasMes = new Date(a, m, 0).getDate();
  const dias = corrente ? new Date().getDate() : diasMes;
  const mesAnt = deslocarMes(r.mes, -1);
  const totalAnt = r.evolucao.linhas.filter((l) => l.mes === mesAnt).reduce((s, l) => s + l.total, 0);

  let comp = `${qtd} ${qtd === 1 ? 'compra' : 'compras'}`;
  if (corrente && totalAnt > 0) {
    comp = dias < 10
      ? `${icone('inicio')} parcial de ${dias} de ${diasMes} dias · ${rotuloMes(mesAnt)}: ${BRL0.format(totalAnt)}`
      : `${icone('inicio')} no ritmo atual, <span class="selo">${BRL0.format((despesas / dias) * diasMes)}</span> no mês`;
  } else if (totalAnt > 0) {
    const p = ((despesas - totalAnt) / totalAnt) * 100;
    comp = `${icone(p > 0 ? 'seta_cima' : 'seta_baixo')} <span class="selo">${Math.abs(p).toFixed(0)}% ${p > 0 ? 'a mais' : 'a menos'}</span> que ${rotuloMes(mesAnt)}`;
  }
  $('#hero-comp').innerHTML = comp;
  animarNumero($('#st-media'), dias ? despesas / dias : 0, BRL0.format);
  animarNumero($('#st-entradas'), receitas, BRL0.format);
  animarNumero($('#st-saldo'), receitas - despesas, BRL0.format);
}

function renderCategorias(r) {
  const box = $('#categorias');
  const total = r.totais.despesas || 1;
  const max = r.porCategoria[0]?.total || 1;
  $('#cat-total').textContent = r.porCategoria.length ? `${r.porCategoria.length} categorias` : '';
  if (!r.porCategoria.length) {
    box.innerHTML = `<div class="vazio"><div class="ic-circulo">${icone('inicio')}</div>Nenhum gasto neste mês ainda.<br>Toque em <b>+</b> para lançar o primeiro.</div>`;
    return;
  }
  box.innerHTML = r.porCategoria.map((c, i) => `
    <button class="cat" style="--i:${i}" data-cat="${c.categoria}" aria-label="${esc(estado.nomes[c.categoria])}: ${BRL.format(c.total)}, ${c.qtd} transações. Ver transações">
      <span class="ic-circulo">${icone(c.categoria)}</span>
      <span class="cat-meio">
        <span class="cat-nome"><span>${esc(estado.nomes[c.categoria] || c.categoria)}</span><span>${((c.total / total) * 100).toFixed(0)}%</span></span>
        <span class="cat-trilho"><span class="cat-barra" style="display:block;width:${Math.max(2, (c.total / max) * 100)}%"></span></span>
      </span>
      <span class="cat-valor">${BRL0.format(c.total)}</span>
    </button>`).join('');
}

function renderEvolucao(r) {
  const { meses, linhas } = r.evolucao;
  const totais = meses.map((m) => linhas.filter((l) => l.mes === m).reduce((s, l) => s + l.total, 0));
  const max = Math.max(...totais, 1);
  const box = $('#evolucao');
  box.setAttribute('aria-label', meses.map((m, i) => `${rotuloMes(m)}: ${BRL0.format(totais[i])}`).join('; '));
  box.innerHTML = meses.map((m, i) => `
    <div class="col${m === r.mes ? ' atual' : ''}" style="--i:${i}" title="${rotuloMes(m)}: ${BRL.format(totais[i])}">
      <span class="col-val">${totais[i] ? BRL0.format(totais[i]).replace('R$', '').trim() : ''}</span>
      <span class="col-barra" style="height:${Math.max(3, (totais[i] / max) * 78)}%"></span>
      <span class="col-mes">${MES_CURTO[Number(m.slice(5)) - 1]}</span>
    </div>`).join('');
}

function renderRankings(r) {
  $('#top').innerHTML = r.topEstabelecimentos.slice(0, 5).map((e, i) => `
    <li style="--i:${i}"><span class="ic-circulo">${icone(e.categoria)}</span>
      <span style="min-width:0"><div class="rk-nome">${esc(e.estabelecimento)}</div><div class="rk-sub">${e.qtd}x · ${esc(estado.nomes[e.categoria] || '')}</div></span>
      <span class="rk-valor">${BRL0.format(e.total)}</span></li>`).join('') || '<li class="muted">Sem dados</li>';
  $('#contas').innerHTML = r.porConta.map((c, i) => `
    <li style="--i:${i}"><span class="ic-circulo">${icone('cartao')}</span>
      <span class="rk-nome">${esc(c.conta)}</span><span class="rk-valor">${BRL0.format(c.total)}</span></li>`).join('') || '<li class="muted">Sem dados</li>';
}

function renderPendentes(n, lista) {
  const el = $('#alerta-pendentes');
  if (!n) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>${n} ${n === 1 ? 'notificação não reconhecida' : 'notificações não reconhecidas'}</b>. Lance manualmente ou envie o texto como exemplo para melhorar o leitor.
    <details><summary>Ver textos</summary>${lista.map((p) => `<pre>${esc(p.app || '')}\n${esc(p.titulo || '')}\n${esc(p.texto || '')}</pre>`).join('')}</details>`;
}

// ---------- Transações ----------
function rotuloDia(dataStr) {
  const hoje = new Date();
  const d = new Date(`${dataStr}T12:00:00`);
  const diff = Math.round((new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12) - d) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${DIA_SEMANA[d.getDay()]}, ${d.getDate()} de ${MES_CURTO[d.getMonth()]}`;
}

function linhaTransacao(t, i) {
  const receita = t.natureza === 'receita';
  const sub = [receita ? 'Entrada' : estado.nomes[t.categoria], t.conta].filter(Boolean).join(' · ');
  return `<button class="tx ${t.natureza}" style="--i:${i}" data-id="${t.id}">
    <span class="ic-circulo">${icone(receita ? 'receita' : t.categoria)}</span>
    <span style="min-width:0"><div class="tx-nome">${esc(t.estabelecimento)}</div><div class="tx-sub">${esc(sub)}</div></span>
    <span class="tx-valor">${receita ? '+ ' : ''}${BRL.format(t.valor)}<small>${t.data.slice(11, 16)}</small></span>
  </button>`;
}

function renderTransacoes() {
  const busca = estado.busca.toLowerCase();
  const lista = estado.transacoes.filter((t) =>
    (!estado.filtroCategoria || (t.categoria === estado.filtroCategoria && t.natureza === 'despesa')) &&
    (!busca || t.estabelecimento.toLowerCase().includes(busca)));

  const chip = $('#filtro-ativo');
  chip.hidden = !estado.filtroCategoria;
  chip.innerHTML = estado.filtroCategoria ? `${esc(estado.nomes[estado.filtroCategoria])} ${icone('fechar')}` : '';
  const total = lista.filter((t) => t.natureza === 'despesa').reduce((s, t) => s + t.valor, 0);
  $('#tx-sub').textContent = `${nomeMes(estado.mes)} · ${lista.length} ${lista.length === 1 ? 'lançamento' : 'lançamentos'} · ${BRL.format(total)}`;

  if (!lista.length) {
    $('#transacoes').innerHTML = `<div class="vazio"><div class="ic-circulo">${icone('busca')}</div>Nada encontrado.</div>`;
    return;
  }
  const dias = new Map();
  for (const t of lista) {
    const d = t.data.slice(0, 10);
    if (!dias.has(d)) dias.set(d, []);
    dias.get(d).push(t);
  }
  let i = 0;
  $('#transacoes').innerHTML = [...dias.entries()].map(([d, txs]) => {
    const gasto = txs.filter((t) => t.natureza === 'despesa').reduce((s, t) => s + t.valor, 0);
    return `<section class="dia"><div class="dia-topo"><span>${rotuloDia(d)}</span><span>${gasto ? BRL.format(gasto) : ''}</span></div>
      <div class="dia-lista">${txs.map((t) => linhaTransacao(t, i++)).join('')}</div></section>`;
  }).join('');
}

// ---------- Folha inferior ----------
function abrirFolha(html, aoMontar) {
  const folha = $('#folha');
  const veu = $('#veu');
  $('#folha-conteudo').innerHTML = html;
  folha.classList.remove('saindo'); veu.classList.remove('saindo');
  folha.hidden = false; veu.hidden = false;
  document.body.style.overflow = 'hidden';
  aoMontar?.(folha);
}
function fecharFolha() {
  const folha = $('#folha');
  const veu = $('#veu');
  if (folha.hidden) return;
  folha.classList.add('saindo'); veu.classList.add('saindo');
  setTimeout(() => { folha.hidden = true; veu.hidden = true; folha.style.transform = ''; document.body.style.overflow = ''; }, SEM_MOVIMENTO ? 0 : 230);
}
// Arrastar para baixo fecha a folha.
(() => {
  let y0 = null;
  const folha = $('#folha');
  folha.addEventListener('touchstart', (e) => { if (folha.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  folha.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) folha.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  folha.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    if (dy > 110) fecharFolha(); else folha.style.transform = '';
  });
})();

function abrirDetalhe(id) {
  const t = estado.transacoes.find((x) => String(x.id) === String(id));
  if (!t) return;
  vibrar();
  const receita = t.natureza === 'receita';
  const [d, h] = t.data.split('T');
  const detalhes = [
    ['Data', `${rotuloDia(d)}, ${h.slice(0, 5)}`],
    ['Conta', t.conta],
    ['Cartão', t.cartao_final && `final ${t.cartao_final}`],
    ['Tipo', { credito: 'Crédito', debito: 'Débito', pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência' }[t.tipo]],
    ['Origem', t.origem === 'manual' ? 'Lançado por você' : 'Notificação'],
  ].filter(([, v]) => v);
  abrirFolha(`
    <div class="folha-cab"><span class="ic-circulo">${icone(receita ? 'receita' : t.categoria)}</span>
      <div><h3>${esc(t.estabelecimento)}</h3><span class="muted pequeno">${receita ? 'Entrada' : esc(estado.nomes[t.categoria])}</span></div></div>
    <p class="folha-valor">${receita ? '+' : ''}${BRL.format(t.valor)}</p>
    <dl class="detalhes">${detalhes.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${receita ? '' : `<p class="rotulo-secao">Categoria</p>
    <div class="grade-cats">${estado.categorias.map((c, i) => `
      <button class="opcao-cat${c.id === t.categoria ? ' sel' : ''}" style="--i:${i}" data-cat="${c.id}">${icone(c.id)}<span>${esc(c.nome)}</span></button>`).join('')}</div>
    <p class="muted pequeno" style="margin:-6px 0 16px">O app lembra da escolha para as próximas compras deste lugar.</p>`}
    <button class="btn-perigo" id="btn-remover">${icone('lixo')}Remover lançamento</button>`, (folha) => {
    for (const b of $$('.opcao-cat', folha)) {
      b.addEventListener('click', async () => {
        if (b.classList.contains('sel')) return;
        vibrar(12);
        $$('.opcao-cat', folha).forEach((x) => x.classList.toggle('sel', x === b));
        try {
          const r = await api(`/api/transacoes/${t.id}`, { method: 'PATCH', body: JSON.stringify({ categoria: b.dataset.cat, aprender: true }) });
          fecharFolha();
          toast(r.reclassificadas ? `Salvo e aplicado a mais ${r.reclassificadas} compra(s)` : `Movido para ${estado.nomes[b.dataset.cat]}`);
          await carregar();
        } catch (e) { toast(e.message, 'alerta'); }
      });
    }
    const rem = $('#btn-remover', folha);
    rem.addEventListener('click', async () => {
      if (!rem.dataset.confirmar) { rem.dataset.confirmar = '1'; rem.lastChild.textContent = 'Toque de novo para confirmar'; vibrar(20); return; }
      await api(`/api/transacoes/${t.id}`, { method: 'DELETE' });
      fecharFolha(); toast('Lançamento removido', 'lixo');
      await carregar();
    });
  });
}

function abrirLancamento() {
  vibrar();
  const exemplos = ['padaria 18,50', 'mercado 230', 'gastei 120 no posto', 'almoço 42,90'];
  abrirFolha(`
    <h3>Novo lançamento</h3>
    <p class="muted pequeno" style="margin:0 0 14px">Escreva do seu jeito: o lugar e o valor.</p>
    <form id="form-lancar">
      <input id="lancamento" class="campo campo-grande" placeholder="padaria 18,50" autocomplete="off" enterkeyhint="done">
      <div class="previa" id="previa"></div>
      <div class="sugestoes">${exemplos.map((e, i) => `<button type="button" class="sugestao" style="--i:${i}">${e}</button>`).join('')}</div>
      <button class="btn-primario" type="submit">Lançar</button>
    </form>`, (folha) => {
    const campo = $('#lancamento', folha);
    const previa = () => {
      const tx = parseLancamentoManual(campo.value);
      $('#previa', folha).innerHTML = tx
        ? linhaTransacao({ ...tx, id: 0, categoria: categorizar(tx.estabelecimento, { tipo: tx.tipo }), data: `0000-00-00T${new Date().toTimeString().slice(0, 5)}` }, 0)
        : '';
    };
    campo.addEventListener('input', previa);
    for (const s of $$('.sugestao', folha)) s.addEventListener('click', () => { campo.value = s.textContent; previa(); campo.focus(); });
    setTimeout(() => campo.focus(), 250);
    $('#form-lancar', folha).addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!campo.value.trim()) return;
      try {
        const t = await api('/api/transacoes', { method: 'POST', body: JSON.stringify({ texto: campo.value.trim() }) });
        vibrar(15);
        fecharFolha();
        toast(`${t.estabelecimento} · ${BRL.format(t.valor)} em ${estado.nomes[t.categoria]}`);
        estado.mes = t.data.slice(0, 7);
        await carregar();
      } catch (err) { toast(err.message, 'alerta'); }
    });
  });
}

// ---------- Carregamento ----------
async function carregar() {
  const [resumo, transacoes, pendentes] = await Promise.all([
    api(`/api/resumo?mes=${estado.mes}`),
    api(`/api/transacoes?mes=${estado.mes}`),
    api('/api/notificacoes/pendentes'),
  ]);
  estado.resumo = resumo;
  estado.transacoes = transacoes;
  $('#mes').value = estado.mes;
  renderHero(resumo); renderCategorias(resumo); renderEvolucao(resumo); renderRankings(resumo);
  renderPendentes(resumo.naoReconhecidas, pendentes);
  renderTransacoes();
}

function mudarMes(novo) {
  if (!novo || novo === estado.mes) return;
  estado.mes = novo; estado.filtroCategoria = null;
  vibrar(6);
  carregar().catch((e) => toast(e.message, 'alerta'));
}

// ---------- Eventos ----------
preencherIcones();
$('#mes-ant').innerHTML = icone('esquerda');
$('#mes-prox').innerHTML = icone('direita');
$('#marca-login').innerHTML = icone('inicio');
$('#mes-ant').addEventListener('click', () => mudarMes(deslocarMes(estado.mes, -1)));
$('#mes-prox').addEventListener('click', () => mudarMes(deslocarMes(estado.mes, 1)));
$('#mes-rotulo').addEventListener('click', () => { try { $('#mes').showPicker(); } catch { mudarMes(mesAtual()); } });
$('#mes').addEventListener('change', (e) => mudarMes(e.target.value));
for (const a of $$('.aba')) a.addEventListener('click', () => { vibrar(5); mostrarVista(a.dataset.vista); });
$('#fab').addEventListener('click', abrirLancamento);
$('#veu').addEventListener('click', fecharFolha);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharFolha(); });
$('#categorias').addEventListener('click', (e) => {
  const b = e.target.closest('.cat');
  if (!b) return;
  estado.filtroCategoria = b.dataset.cat;
  mostrarVista('transacoes');
  renderTransacoes();
});
$('#transacoes').addEventListener('click', (e) => { const b = e.target.closest('.tx'); if (b) abrirDetalhe(b.dataset.id); });
$('#filtro-ativo').addEventListener('click', () => { estado.filtroCategoria = null; renderTransacoes(); });
$('#busca').addEventListener('input', (e) => { estado.busca = e.target.value; renderTransacoes(); });
$('#sair').addEventListener('click', sair);

// Gesto horizontal na área do hero troca de mês.
(() => {
  let x0 = null;
  const hero = $('.hero');
  hero.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 70) mudarMes(deslocarMes(estado.mes, dx < 0 ? 1 : -1));
  });
})();

function sair() {
  salvarToken(null); estado.token = null;
  $('#app').hidden = true; $('#login').hidden = false;
}

async function iniciarComum() {
  estado.categorias = await api('/api/categorias');
  estado.nomes = Object.fromEntries(estado.categorias.map((c) => [c.id, c.nome]));
  estado.mes = mesAtual();
  $('#login').hidden = true; $('#app').hidden = false;
  await carregar();
}

async function entrar(token) {
  estado.token = token;
  await iniciarComum();
  salvarToken(token);
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await entrar($('#token').value.trim()); } catch (err) { $('#erro-login').textContent = err.message; }
});

// ---------- Modo app Android ----------
function atualizarPermissao() {
  const ok = nativo.temPermissao();
  $('#aviso-permissao').hidden = ok;
  $('#aj-perm-status').textContent = ok ? 'Ativa: compras entram sozinhas' : 'Desativada: toque para liberar';
  $('#aj-perm-btn').textContent = ok ? 'Ajustar' : 'Liberar';
}

async function iniciarApp(ponte) {
  nativo = ponte;
  const { criarApiLocal } = await import('./nucleo/api-local.js');
  local = criarApiLocal(nativo);
  document.body.classList.add('modo-app');
  $('#aj-sair').hidden = true;
  $('#aj-permissao').hidden = false;
  $('#acoes-app').hidden = false;
  const abrir = () => nativo.abrirPermissao();
  $('#btn-permissao').addEventListener('click', abrir);
  $('#aj-perm-btn').addEventListener('click', abrir);
  $('#btn-exportar').addEventListener('click', () => local.exportar());
  $('#arquivo-importar').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f || !confirm('Substituir todos os dados deste aparelho pelo backup?')) return;
    try { local.importar(await f.text()); await carregar(); toast('Backup restaurado'); }
    catch (err) { toast(err.message, 'alerta'); }
    e.target.value = '';
  });
  const atualizar = async () => {
    atualizarPermissao();
    const r = local.processarFila();
    await carregar();
    if (r.novas) { vibrar(15); toast(`${r.novas} ${r.novas === 1 ? 'nova compra capturada' : 'novas compras capturadas'}`, 'sino'); }
  };
  window.meuGastoNovaNotificacao = () => atualizar().catch(console.error);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar().catch(console.error); });
  await iniciarComum();
  await atualizar();
}

if (window.MeuGastoNativo) {
  iniciarApp(window.MeuGastoNativo).catch((e) => { document.body.textContent = `Erro ao iniciar: ${e.message}`; });
} else {
  // Permite abrir já autenticado via ?token=... (atalho na tela inicial do celular)
  const tokenUrl = new URLSearchParams(location.search).get('token');
  if (tokenUrl) history.replaceState(null, '', location.pathname);
  const inicial = tokenUrl || lerToken();
  if (inicial) entrar(inicial).catch(() => { $('#login').hidden = false; });
  else $('#login').hidden = false;
}
