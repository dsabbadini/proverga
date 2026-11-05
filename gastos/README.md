# Meu Gasto

Assistente de gastos pessoais no estilo "assessor financeiro": captura as **notificações
push dos bancos** no celular, entende valor e estabelecimento, **categoriza sozinho**
(mercado, padaria, combustível, refeições, contas, transporte, assinaturas...) e mostra
um **dashboard** de onde o dinheiro está indo.

```
Celular (Android)                Servidor (Node 22, sem dependências)         Navegador / PWA
┌──────────────────┐   POST     ┌───────────────────────────────────┐       ┌──────────────┐
│ Notificação do   │──────────▶ │ /api/notificacoes                 │       │ Dashboard    │
│ banco/carteira   │  MacroDroid│  parser.js  → valor, local, cartão│ ◀──── │ categorias,  │
└──────────────────┘            │  categorias.js → categoria        │  API  │ evolução,    │
                                │  regras aprendidas (SQLite)       │       │ transações   │
"padaria 18,50" ──────────────▶ │ /api/transacoes (lançamento livre)│       └──────────────┘
                                └───────────────────────────────────┘
```

## Funcionalidades

- **Leitura de notificações** de Nubank, Itaú, Santander, Bradesco/Bradescard, Banco do
  Brasil, Caixa, Inter, C6, PicPay, Mercado Pago, PagBank e Google/Samsung Wallet (o
  leitor é genérico: entende os formatos "Compra de R$ X em LOJA", "LOJA - R$ X",
  "Você pagou R$ X para LOJA", Pix enviado/recebido).
- **Filtra o que não é gasto**: compras recusadas, avisos de fatura e limite, códigos de
  segurança, ofertas. Pix recebido e estornos entram como **entrada**.
- **Deduplicação**: a mesma notificação repetida em 10 minutos conta uma vez.
- **Categorização automática** por palavras-chave e **aprendizado**: ao trocar a
  categoria de uma compra, o app grava a regra para aquele estabelecimento e reclassifica
  o histórico.
- **Lançamento em linguagem natural**: "padaria 18,50", "gastei 120 no posto".
- **Dashboard**: total do mês, média diária, maior categoria, entradas e saldo, gasto por
  categoria (clique filtra), evolução de 6 meses, maiores estabelecimentos, gasto por
  conta/cartão, fila de notificações não reconhecidas. Tema claro/escuro, funciona no
  celular e pode ser instalado na tela inicial.
- Datas sempre no **horário de Brasília**.

## Rodando localmente

Requer Node.js 22.13 ou superior (usa o SQLite embutido do Node, sem `npm install`).

```bash
cd gastos
cp .env.example .env          # defina APP_TOKEN (mínimo 16 caracteres)
npm test                      # testes do leitor de notificações
npm run demo                  # opcional: cria ./data/demo.db com 4 meses fictícios
DB_PATH=./data/demo.db npm start   # ou só "npm start" para o banco real
```

Abra `http://localhost:3000` e entre com o `APP_TOKEN`.

## Opção 1: app Android (recomendado)

Um APK que lê as notificações sozinho e mostra o dashboard, sem servidor nem outros apps.
O GitHub compila e publica a cada mudança. Baixe em
**https://github.com/dsabbadini/proverga/releases/latest/download/MeuGasto.apk** e siga
**[docs/APP-ANDROID.md](docs/APP-ANDROID.md)**.

## Opção 1b: servidor no próprio celular (Termux)

O servidor roda no celular via Termux, sem hospedagem nem custo, e os dados não saem do
aparelho. Um instalador faz tudo: **[docs/CELULAR-COMO-SERVIDOR.md](docs/CELULAR-COMO-SERVIDOR.md)**.

## Opção 2: servidor na nuvem ou em casa

Para ver o dashboard de qualquer lugar, o celular precisa alcançar o servidor por **HTTPS**. Opções simples:

- **Railway / Render / Fly.io** com o `Dockerfile` incluído. Configure as variáveis
  `APP_TOKEN`, `HOST=0.0.0.0` e `DB_PATH=/data/gastos.db` e **monte um volume persistente em `/data`**
  (sem volume, o banco é apagado a cada deploy).
- **Computador ou Raspberry Pi em casa** + Cloudflare Tunnel ou Tailscale Funnel para
  expor com HTTPS sem abrir portas no roteador.

Depois configure o celular: **[docs/CAPTURA-CELULAR.md](docs/CAPTURA-CELULAR.md)**.

## API

Todas as rotas exigem `Authorization: Bearer APP_TOKEN` (ou `?token=`), exceto `/api/saude`.

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/notificacoes` | `{app, title, text}` em JSON, formulário ou texto puro |
| GET | `/api/resumo?mes=AAAA-MM` | totais, por categoria, top estabelecimentos, por conta, evolução 6 meses |
| GET | `/api/transacoes?mes=AAAA-MM` | lista do mês |
| POST | `/api/transacoes` | `{texto: "padaria 18,50"}` ou `{valor, estabelecimento, categoria?}` |
| PATCH | `/api/transacoes/:id` | `{categoria, aprender: true}` |
| DELETE | `/api/transacoes/:id` | remove |
| GET | `/api/notificacoes/pendentes` | notificações não reconhecidas |
| GET | `/api/categorias` | lista de categorias |

## Segurança e privacidade

- Os dados ficam **no seu servidor** (um arquivo SQLite). Nada é enviado a terceiros.
- O token protege a API; use um valor longo e aleatório (`openssl rand -hex 24`) e
  sempre HTTPS. Faça backup do arquivo do banco.
- Esta versão é **para um usuário**. Para virar produto com vários clientes, o roteiro
  abaixo prevê contas, senhas e isolamento por usuário.

## Roteiro

| Fase | Entrega | Status |
|---|---|---|
| 1 | Servidor, leitor de notificações, categorização com aprendizado, dashboard, captura via MacroDroid | **pronto** |
| 1.1 | Rodar no próprio celular (Termux), início automático e backup diário | **pronto** |
| 2 | App Android próprio (APK compilado pelo GitHub), leitura nativa de notificações, backup | **pronto** |
| 3 | Bot de WhatsApp (WhatsApp Cloud API): lançar gasto e pedir resumo por mensagem, alertas de orçamento | planejado |
| 4 | Orçamento por categoria e alertas; importação de extrato/fatura (OFX/CSV/PDF) para conciliar | planejado |
| 5 | Multiusuário (login, senha, isolamento de dados) e Open Finance via agregador (Pluggy/Belvo) | planejado |
