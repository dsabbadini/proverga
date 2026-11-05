const $ = (s) => document.querySelector(s);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const estado = { token: null, mes: null, categorias: [], nomes: {}, transacoes: [], filtroCategoria: null, busca: '' };

function lerToken() {
  try { return localStorage.getItem('meugasto.token'); } catch { return null; }
}
function salvarToken(t) {
  try { t ? localStorage.setItem('meugasto.token', t) : localStorage.removeItem('meugasto.token'); } catch {}
}

// No app Android, as rotas rodam localmente (nucleo/api-local.js) em vez de num servidor.
let local = null;

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
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Tooltip ----------
const tip = $('#tooltip');
function ligarTooltip(el, texto) {
  el.addEventListener('mousemove', (e) => {
    tip.textContent = texto; tip.hidden = false;
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`; tip.style.top = `${e.clientY - 36}px`;
  });
  el.addEventListener('mouseleave', () => { tip.hidden = true; });
}

// ---------- Render ----------
function renderKpis(r) {
  const { despesas, receitas, qtd } = r.totais;
  const mesAnt = deslocarMes(r.mes, -1);
  const totalAnt = r.evolucao.linhas.filter((l) => l.mes === mesAnt).reduce((s, l) => s + l.total, 0);
  const [a, m] = r.mes.split('-').map(Number);
  const hoje = new Date();
  const dias = r.mes === mesAtual() ? hoje.getDate() : new Date(a, m, 0).getDate();
  let delta = '<span class="delta">sem dados do mês anterior</span>';
  const corrente = r.mes === mesAtual();
  if (corrente && totalAnt > 0) {
    // Mês em andamento: comparar o parcial com um mês fechado engana; projeta pelo ritmo atual.
    // Antes do dia 10 as contas fixas do início do mês distorcem a projeção, então só mostra o parcial.
    const diasMes = new Date(a, m, 0).getDate();
    const parcial = dias < 10
      ? `parcial de ${dias} de ${diasMes} dias`
      : `ritmo atual projeta ${BRL0.format((despesas / dias) * diasMes)}`;
    delta = `<span class="delta">${parcial} · ${rotuloMes(mesAnt)} fechou em ${BRL0.format(totalAnt)}</span>`;
  } else if (totalAnt > 0) {
    const p = ((despesas - totalAnt) / totalAnt) * 100;
    delta = `<span class="delta ${p > 0 ? 'sobe' : 'desce'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs ${rotuloMes(mesAnt)} (${BRL0.format(totalAnt)})</span>`;
  }
  const maior = r.porCategoria[0];
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="rotulo">Gastos no mês</div><div class="valor">${BRL.format(despesas)}</div>${delta}</div>
    <div class="kpi"><div class="rotulo">Média por dia</div><div class="valor">${BRL.format(dias ? despesas / dias : 0)}</div><span class="delta">${qtd} transações em ${dias} dias</span></div>
    <div class="kpi"><div class="rotulo">Maior categoria</div><div class="valor">${maior ? esc(estado.nomes[maior.categoria]) : '—'}</div><span class="delta">${maior ? `${BRL.format(maior.total)} · ${((maior.total / despesas) * 100).toFixed(0)}% do mês` : ''}</span></div>
    <div class="kpi"><div class="rotulo">Entradas</div><div class="valor">${BRL.format(receitas)}</div><span class="delta">saldo ${BRL.format(receitas - despesas)}</span></div>`;
}

function renderCategorias(r) {
  const box = $('#categorias');
  const total = r.totais.despesas || 1;
  const max = r.porCategoria[0]?.total || 1;
  if (!r.porCategoria.length) { box.innerHTML = '<p class="muted">Nenhum gasto neste mês ainda.</p>'; return; }
  box.innerHTML = '';
  for (const c of r.porCategoria) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `barra-h${estado.filtroCategoria === c.categoria ? ' ativa' : ''}`;
    b.innerHTML = `<span class="nome">${esc(estado.nomes[c.categoria] || c.categoria)}</span>
      <span class="trilho"><span class="preenchido" style="display:block;width:${(c.total / max) * 100}%"></span></span>
      <span class="val"><b>${BRL0.format(c.total)}</b> · ${((c.total / total) * 100).toFixed(0)}%</span>`;
    b.setAttribute('aria-label', `${estado.nomes[c.categoria]}: ${BRL.format(c.total)}, ${c.qtd} transações`);
    ligarTooltip(b, `${estado.nomes[c.categoria]}: ${BRL.format(c.total)} em ${c.qtd} transações`);
    b.addEventListener('click', () => {
      estado.filtroCategoria = estado.filtroCategoria === c.categoria ? null : c.categoria;
      renderCategorias(r); renderTransacoes();
    });
    box.appendChild(b);
  }
}

function renderEvolucao(r) {
  const { meses, linhas } = r.evolucao;
  const totais = meses.map((m) => linhas.filter((l) => l.mes === m).reduce((s, l) => s + l.total, 0));
  const max = Math.max(...totais, 1);
  const box = $('#evolucao');
  box.setAttribute('aria-label', meses.map((m, i) => `${rotuloMes(m)}: ${BRL0.format(totais[i])}`).join('; '));
  box.innerHTML = '';
  meses.forEach((m, i) => {
    const col = document.createElement('div');
    col.className = `coluna${m === r.mes ? ' atual' : ''}`;
    col.innerHTML = `<span class="rot-val">${totais[i] ? BRL0.format(totais[i]).replace('R$', '').trim() : ''}</span><span class="bar" style="height:${(totais[i] / max) * 85}%"></span>`;
    const top3 = linhas.filter((l) => l.mes === m).sort((a, b) => b.total - a.total).slice(0, 3)
      .map((l) => `${estado.nomes[l.categoria]} ${BRL0.format(l.total)}`).join(' · ');
    ligarTooltip(col, `${rotuloMes(m)}: ${BRL.format(totais[i])}${top3 ? ` (${top3})` : ''}`);
    box.appendChild(col);
  });
  let rot = box.nextElementSibling;
  if (!rot?.classList.contains('meses-rot')) { rot = document.createElement('div'); rot.className = 'meses-rot'; box.after(rot); }
  rot.innerHTML = meses.map((m) => `<span>${rotuloMes(m)}</span>`).join('');
}

function renderListas(r) {
  $('#top').innerHTML = r.topEstabelecimentos.map((e) =>
    `<li><span>${esc(e.estabelecimento)} <span class="muted pequeno">· ${e.qtd}x</span></span><span class="num">${BRL.format(e.total)}</span></li>`).join('') || '<li class="muted">—</li>';
  $('#contas').innerHTML = r.porConta.map((c) =>
    `<li><span>${esc(c.conta)}</span><span class="num">${BRL.format(c.total)}</span></li>`).join('') || '<li class="muted">—</li>';
}

function renderPendentes(n, lista) {
  const el = $('#alerta-pendentes');
  if (!n) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>${n} notificação(ões) não reconhecida(s).</b> Elas não entraram no dashboard. Copie o texto e lance manualmente ou envie como exemplo para melhorar o leitor.
    <details><summary>Ver textos</summary>${lista.map((p) => `<pre>${esc(p.app || '')}\n${esc(p.titulo || '')}\n${esc(p.texto || '')}</pre>`).join('')}</details>`;
}

function renderTransacoes() {
  const corpo = $('#transacoes');
  const busca = estado.busca.toLowerCase();
  const lista = estado.transacoes.filter((t) =>
    (!estado.filtroCategoria || (t.categoria === estado.filtroCategoria && t.natureza === 'despesa')) &&
    (!busca || t.estabelecimento.toLowerCase().includes(busca)));
  const chip = $('#filtro-ativo');
  chip.hidden = !estado.filtroCategoria;
  chip.textContent = estado.filtroCategoria ? `${estado.nomes[estado.filtroCategoria]} ✕` : '';
  const opcoes = (sel) => estado.categorias.map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  corpo.innerHTML = lista.map((t) => {
    const [d, h] = t.data.split('T');
    const [, mm, dd] = d.split('-');
    const sub = [t.conta, t.cartao_final && `final ${t.cartao_final}`, t.tipo !== 'outro' && t.tipo].filter(Boolean).join(' · ');
    return `<tr class="${t.natureza}" data-id="${t.id}">
      <td>${dd}/${mm}<span class="sub">${h.slice(0, 5)}</span></td>
      <td>${esc(t.estabelecimento)}<span class="sub">${esc(sub)}</span></td>
      <td>${t.natureza === 'receita' ? '<span class="muted">Entrada</span>' : `<select aria-label="Categoria">${opcoes(t.categoria)}</select>`}</td>
      <td class="num">${t.natureza === 'receita' ? '+' : ''}${BRL.format(t.valor)}</td>
      <td><button class="remover" title="Remover" aria-label="Remover">✕</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="muted">Nenhuma transação.</td></tr>';
}

async function carregar() {
  const [resumo, transacoes, pendentes] = await Promise.all([
    api(`/api/resumo?mes=${estado.mes}`),
    api(`/api/transacoes?mes=${estado.mes}`),
    api('/api/notificacoes/pendentes'),
  ]);
  estado.transacoes = transacoes;
  renderKpis(resumo); renderCategorias(resumo); renderEvolucao(resumo); renderListas(resumo);
  renderPendentes(resumo.naoReconhecidas, pendentes); renderTransacoes();
}

// ---------- Eventos ----------
$('#transacoes').addEventListener('change', async (e) => {
  if (e.target.tagName !== 'SELECT') return;
  const id = e.target.closest('tr').dataset.id;
  const r = await api(`/api/transacoes/${id}`, { method: 'PATCH', body: JSON.stringify({ categoria: e.target.value, aprender: true }) });
  $('#msg-rapido').textContent = r.reclassificadas
    ? `Categoria salva e aplicada a mais ${r.reclassificadas} compra(s) do mesmo lugar.`
    : 'Categoria salva. Próximas compras desse lugar já virão assim.';
  await carregar();
});
$('#transacoes').addEventListener('click', async (e) => {
  if (!e.target.classList.contains('remover')) return;
  if (!confirm('Remover esta transação?')) return;
  await api(`/api/transacoes/${e.target.closest('tr').dataset.id}`, { method: 'DELETE' });
  await carregar();
});
$('#form-rapido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = $('#lancamento').value.trim();
  if (!texto) return;
  try {
    const t = await api('/api/transacoes', { method: 'POST', body: JSON.stringify({ texto }) });
    $('#msg-rapido').textContent = `Lançado: ${t.estabelecimento} ${BRL.format(t.valor)} em ${estado.nomes[t.categoria]}.`;
    $('#lancamento').value = '';
    estado.mes = t.data.slice(0, 7); $('#mes').value = estado.mes;
    await carregar();
  } catch (err) { $('#msg-rapido').textContent = err.message; }
});
$('#filtro-ativo').addEventListener('click', () => { estado.filtroCategoria = null; carregar(); });
$('#busca').addEventListener('input', (e) => { estado.busca = e.target.value; renderTransacoes(); });
$('#mes').addEventListener('change', (e) => { if (e.target.value) { estado.mes = e.target.value; estado.filtroCategoria = null; carregar(); } });
$('#mes-ant').addEventListener('click', () => { estado.mes = deslocarMes(estado.mes, -1); $('#mes').value = estado.mes; estado.filtroCategoria = null; carregar(); });
$('#mes-prox').addEventListener('click', () => { estado.mes = deslocarMes(estado.mes, 1); $('#mes').value = estado.mes; estado.filtroCategoria = null; carregar(); });
$('#sair').addEventListener('click', sair);

function sair() {
  salvarToken(null); estado.token = null;
  $('#app').hidden = true; $('#login').hidden = false;
}

async function entrar(token) {
  estado.token = token;
  estado.categorias = await api('/api/categorias');
  estado.nomes = Object.fromEntries(estado.categorias.map((c) => [c.id, c.nome]));
  salvarToken(token);
  $('#login').hidden = true; $('#app').hidden = false;
  estado.mes = mesAtual(); $('#mes').value = estado.mes;
  await carregar();
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await entrar($('#token').value.trim()); } catch (err) { $('#erro-login').textContent = err.message; }
});

// ---------- Modo app Android ----------
function avisoPermissao(nativo) {
  const el = $('#aviso-permissao');
  el.hidden = nativo.temPermissao();
}

async function iniciarApp(nativo) {
  ({ criarApiLocal: estado.criarApiLocal } = await import('./nucleo/api-local.js'));
  local = estado.criarApiLocal(nativo);
  document.body.classList.add('modo-app');
  $('#sair').hidden = true;
  $('#acoes-app').hidden = false;
  $('#btn-permissao').addEventListener('click', () => nativo.abrirPermissao());
  $('#btn-exportar').addEventListener('click', () => local.exportar());
  $('#arquivo-importar').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f || !confirm('Substituir todos os dados deste aparelho pelo backup?')) return;
    try { local.importar(await f.text()); await carregar(); $('#msg-rapido').textContent = 'Backup restaurado.'; }
    catch (err) { $('#msg-rapido').textContent = err.message; }
    e.target.value = '';
  });
  const atualizar = async () => {
    avisoPermissao(nativo);
    const r = local.processarFila();
    if (r.novas) $('#msg-rapido').textContent = `${r.novas} nova(s) compra(s) capturada(s) das notificações.`;
    await carregar();
  };
  // Chamado pelo lado nativo quando chega notificação com o app aberto.
  window.meuGastoNovaNotificacao = () => atualizar().catch(console.error);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar().catch(console.error); });
  estado.categorias = await api('/api/categorias');
  estado.nomes = Object.fromEntries(estado.categorias.map((c) => [c.id, c.nome]));
  $('#app').hidden = false;
  estado.mes = mesAtual(); $('#mes').value = estado.mes;
  await atualizar();
}

if (window.MeuGastoNativo) {
  iniciarApp(window.MeuGastoNativo).catch((e) => { document.body.textContent = `Erro ao iniciar: ${e.message}`; });
} else {
  // Permite abrir já autenticado via ?token=... (útil no atalho da tela inicial do celular)
  const tokenUrl = new URLSearchParams(location.search).get('token');
  if (tokenUrl) history.replaceState(null, '', location.pathname);
  const inicial = tokenUrl || lerToken();
  if (inicial) entrar(inicial).catch(() => { $('#login').hidden = false; });
  else $('#login').hidden = false;
}
