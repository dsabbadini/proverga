// Categorias e regras de classificação por palavra-chave.
// A ordem importa: a primeira categoria cujo termo aparece no estabelecimento vence.
// Os termos são comparados já normalizados (maiúsculas, sem acento).

export const CATEGORIAS = [
  { id: 'mercado', nome: 'Mercado', cor: '#2f9e44', termos: ['SUPERMERC', 'MERCADO ', 'MERCADINHO', 'ATACAD', 'ASSAI', 'CARREFOUR', 'PAO DE ACUCAR', 'EXTRA ', 'SONDA', 'DIA BRASIL', 'HORTIFRUTI', 'SACOLAO', 'OXXO', 'MINUTO PA', 'ST MARCHE', 'ZAFFARI', 'BIG BOMPRECO', 'GUANABARA', 'MAKRO', 'SAMS CLUB', 'ACOUGUE', 'EMPORIO'] },
  { id: 'padaria', nome: 'Padaria', cor: '#e8590c', termos: ['PADARIA', 'PANIFICADORA', 'PANIF', 'CONFEITARIA', 'BAKERY', 'PAES ', 'BOULANGERIE'] },
  { id: 'combustivel', nome: 'Combustível', cor: '#c92a2a', termos: ['POSTO', 'AUTO POSTO', 'SHELL', 'IPIRANGA', 'PETROBRAS', 'BR MANIA', 'ALE COMBUST', 'COMBUSTIV', 'RAIZEN', 'GASOLINA', 'ETANOL'] },
  { id: 'refeicoes', nome: 'Refeições', cor: '#f08c00', termos: ['IFOOD', 'RAPPI', 'AIQFOME', 'RESTAURANT', 'REST ', 'LANCHONETE', 'LANCHES', 'PIZZ', 'BURGER', 'HAMBURG', 'MCDONALD', 'MC DONALD', 'BK BRASIL', 'BURGER KING', 'SUBWAY', 'OUTBACK', 'BOB S', 'HABIB', 'SUSHI', 'TEMAKI', 'CHURRASC', 'GRILL', 'BAR ', 'BOTECO', 'CAFE', 'CAFETERIA', 'STARBUCKS', 'SORVET', 'ACAI', 'COZINHA', 'BISTRO', 'SPOLETO', 'GIRAFFAS', 'MADERO', 'COCO BAMBU', 'FRANGO'] },
  { id: 'transporte', nome: 'Transporte', cor: '#1971c2', termos: ['UBER', '99 ', '99APP', '99POP', 'CABIFY', 'INDRIVE', 'ESTACIONA', 'ESTAPAR', 'PARK', 'PEDAGIO', 'SEM PARAR', 'CONECTCAR', 'VELOE', 'METRO', 'BILHETE UNICO', 'TOP ', 'CPTM', 'ONIBUS', 'LATAM', 'GOL LINHAS', 'AZUL LINHAS'] },
  { id: 'contas', nome: 'Contas', cor: '#5f3dc4', termos: ['ENEL', 'SABESP', 'CEMIG', 'COPEL', 'LIGHT ', 'CPFL', 'COMGAS', 'NATURGY', 'SANEPAR', 'CEDAE', 'CLARO', 'VIVO', 'TIM ', 'OI ', 'NET SERVICOS', 'CONDOMINIO', 'ALUGUEL', 'IPTU', 'IPVA', 'DETRAN', 'SEGURO', 'PORTO SEGURO', 'BOLETO', 'PAGAMENTO DE CONTA', 'CONVENIO', 'DARF', 'GPS INSS'] },
  { id: 'assinaturas', nome: 'Assinaturas', cor: '#862e9c', termos: ['NETFLIX', 'SPOTIFY', 'DISNEY', 'HBO', 'MAX.COM', 'PRIME VIDEO', 'AMAZON PRIME', 'GLOBOPLAY', 'YOUTUBE', 'GOOGLE ONE', 'GOOGLE STORAGE', 'APPLE.COM', 'ICLOUD', 'MICROSOFT', 'CANVA', 'OPENAI', 'CHATGPT', 'ANTHROPIC', 'CLAUDE.AI', 'DEEZER', 'PARAMOUNT', 'CRUNCHYROLL', 'UBER ONE', 'IFOOD CLUB', 'SMARTFIT', 'SMART FIT', 'BLUEFIT', 'GYMPASS', 'WELLHUB', 'TOTALPASS'] },
  { id: 'saude', nome: 'Saúde', cor: '#0c8599', termos: ['DROGA', 'FARMA', 'RAIA', 'DROGASIL', 'PACHECO', 'PAGUE MENOS', 'PANVEL', 'NISSEI', 'HOSPITAL', 'CLINICA', 'LABORAT', 'ODONTO', 'MEDIC', 'UNIMED', 'AMIL', 'SULAMERICA', 'BRADESCO SAUDE', 'HAPVIDA', 'FLEURY', 'DASA', 'OTICA'] },
  { id: 'compras', nome: 'Compras online', cor: '#e64980', termos: ['MERCADOLIVRE', 'MERCADO LIVRE', 'MERCADOPAGO*', 'AMAZON', 'AMAZONMKTPLC', 'ALIEXPRESS', 'ALIPAY', 'SHOPEE', 'SHEIN', 'MAGALU', 'MAGAZINE LUIZA', 'AMERICANAS', 'CASAS BAHIA', 'KABUM', 'TEMU', 'EBANX'] },
  { id: 'vestuario', nome: 'Vestuário', cor: '#d6336c', termos: ['RENNER', 'RIACHUELO', 'C&A', 'C E A', 'ZARA', 'HERING', 'CENTAURO', 'NETSHOES', 'NIKE', 'ADIDAS', 'ASICS', 'DECATHLON', 'CALCAD', 'CONSTANCE', 'AREZZO', 'MARISA', 'YOUCOM'] },
  { id: 'casa', nome: 'Casa', cor: '#868e96', termos: ['LEROY', 'TELHANORTE', 'C&C', 'TOK STOK', 'TOKSTOK', 'ETNA', 'CAMICADO', 'MADEIRA', 'MATERIAIS DE CONSTR', 'HOME CENTER', 'LAVANDERIA', 'CHAVEIRO', 'PET', 'PETZ', 'COBASI', 'VETERIN'] },
  { id: 'lazer', nome: 'Lazer', cor: '#20c997', termos: ['PLAYSTATION', 'XBOX', 'STEAM', 'NINTENDO', 'CINEMA', 'CINEMARK', 'INGRESSO', 'SYMPLA', 'EVENTIM', 'TICKET', 'TEATRO', 'SHOW ', 'PARQUE', 'HOTEL', 'BOOKING', 'AIRBNB', 'DECOLAR'] },
  { id: 'educacao', nome: 'Educação', cor: '#3bc9db', termos: ['ESCOLA', 'COLEGIO', 'FACULDADE', 'UNIVERSIDADE', 'CURSO', 'UDEMY', 'ALURA', 'HOTMART', 'LIVRARIA', 'SARAIVA', 'KUMON', 'IDIOMAS'] },
  { id: 'transferencias', nome: 'Pix e transferências', cor: '#495057', termos: [] },
  { id: 'outros', nome: 'Outros', cor: '#adb5bd', termos: [] },
];

export const CATEGORIA_POR_ID = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

// Termos mais específicos precisam ser testados antes dos genéricos:
// "AMAZON PRIME" é assinatura antes de ser compra; "MERCADO LIVRE" é compra antes de ser mercado.
const PRIORIDADE = ['assinaturas', 'compras'];
const ORDEM_AVALIACAO = [
  ...PRIORIDADE.map((id) => CATEGORIA_POR_ID[id]),
  ...CATEGORIAS.filter((c) => !PRIORIDADE.includes(c.id)),
];

export function normalizar(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9&*.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Chave estável do estabelecimento, usada para "aprender" a categoria escolhida pelo usuário.
// Remove números de loja, cidades comuns no fim e prefixos de adquirentes (ex.: "PG *", "IFD*").
export function chaveEstabelecimento(estabelecimento = '') {
  return normalizar(estabelecimento)
    .replace(/^(PG|PAG|MP|MERCADOPAGO|IFD|EC|SUMUP|PICPAY|STONE|CIELO|GETNET|REDE)\s*\*\s*/, '')
    .replace(/\b\d{2,}\b/g, '')
    .replace(/\s+(SAO PAULO|SP|RJ|RIO DE JANEIRO|BH|BELO HORIZONTE|CURITIBA|BRA|BR)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sugere categoria para um estabelecimento.
 * @param {string} estabelecimento
 * @param {{tipo?: string, regras?: Map<string,string>}} opts regras = aprendizado do usuário (chave -> categoria)
 */
export function categorizar(estabelecimento, { tipo, regras } = {}) {
  const chave = chaveEstabelecimento(estabelecimento);
  if (regras && chave && regras.has(chave)) return regras.get(chave);

  // Espaços nas pontas permitem termos como "BAR " ou "99 " casarem com palavra inteira.
  const alvo = ` ${normalizar(estabelecimento)} `;
  for (const cat of ORDEM_AVALIACAO) {
    if (cat.termos.some((t) => alvo.includes(t.endsWith(' ') ? ` ${t}` : t))) return cat.id;
  }
  if (tipo === 'pix' || tipo === 'transferencia') return 'transferencias';
  return 'outros';
}
