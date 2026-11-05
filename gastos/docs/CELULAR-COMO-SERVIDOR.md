# Rodando tudo no próprio celular (Android)

O servidor roda no próprio celular, dentro do **Termux**. O MacroDroid entrega as
notificações em `http://127.0.0.1:3000`, o endereço do próprio aparelho, e o dashboard abre
no Chrome. Não precisa de hospedagem, domínio nem HTTPS, e os dados não saem do celular.

## O que instalar

Instale os três apps **pela mesma loja, o F-Droid** (https://f-droid.org). As versões do
Termux e do Termux:Boot precisam vir da mesma origem para conversarem entre si.

1. **Termux**: o terminal Linux onde o servidor roda.
2. **Termux:Boot**: liga o servidor sozinho quando o celular reinicia. Abra-o **uma vez**
   depois de instalar, para o Android liberar o início automático.
3. **MacroDroid** (Play Store): encaminha as notificações dos bancos.

## Passo a passo

No Termux:

```bash
pkg install -y git
git clone -b claude/expense-dashboard-app-97fisy https://github.com/dsabbadini/proverga.git
cd proverga/gastos
bash scripts/termux-instalar.sh
```

Se o repositório for privado, o `git clone` pede usuário e senha. Use seu usuário do
GitHub e, como senha, um *token de acesso pessoal* criado em GitHub → Settings → Developer
settings → Personal access tokens, com permissão de leitura do repositório.

O instalador:
- instala o Node.js e gera um **token secreto** aleatório;
- guarda os dados em `~/meugasto/gastos.db`;
- programa o início automático quando o celular liga (Termux:Boot) e um **backup diário**
  em `Documentos/MeuGasto` (os 30 mais recentes);
- liga o servidor e mostra **o link do dashboard e os dados para o MacroDroid**.

Depois, configure o MacroDroid como em [CAPTURA-CELULAR.md](CAPTURA-CELULAR.md), usando
`http://127.0.0.1:3000/api/notificacoes` como URL.

## Samsung: impedir que o sistema desligue o servidor

Em Configurações → Cuidados com o dispositivo → Bateria → Limites de uso em segundo plano
→ **Apps que nunca entram em suspensão**, adicione **Termux**, **Termux:Boot** e
**MacroDroid**. Em Configurações → Apps → Termux → Bateria, escolha **Sem restrições**.

O servidor fica parado quase o tempo todo (só acorda quando chega uma notificação), então o
consumo de bateria é pequeno.

## Prós e contras

| | Celular como servidor | Servidor na nuvem |
|---|---|---|
| Custo | zero | poucos dólares/mês |
| Privacidade | dados só no celular | dados num servidor seu |
| Ver no computador | só se ligar o acesso pela rede (abaixo) | de qualquer lugar |
| Se perder o celular | restaura pelo backup em Documentos (copie para o Drive) | dados intactos |
| Manutenção | depende do Android não encerrar o Termux | nenhuma no celular |

## Opcional: ver o dashboard no computador

Por padrão só o próprio celular acessa o servidor, mesmo em Wi-Fi público. Para abrir no
computador **na mesma rede de casa**, troque `HOST=127.0.0.1` por `HOST=0.0.0.0` em
`gastos/.env`, reinicie (`pkill -f src/server.js; ~/meugasto/iniciar.sh`) e acesse
`http://IP-DO-CELULAR:3000`. Faça isso só em redes confiáveis: o token continua sendo
exigido, mas a conexão não é criptografada.

## Comandos úteis no Termux

```bash
~/meugasto/iniciar.sh                 # liga (se não estiver ligado)
pkill -f src/server.js                # desliga
tail -f ~/meugasto/servidor.log       # acompanha as notificações chegando
cd ~/proverga/gastos && git pull && pkill -f src/server.js; ~/meugasto/iniciar.sh   # atualiza
```

## Restaurar um backup

```bash
pkill -f src/server.js
cp ~/storage/shared/Documents/MeuGasto/gastos-AAAA-MM-DD.db ~/meugasto/gastos.db
rm -f ~/meugasto/gastos.db-wal ~/meugasto/gastos.db-shm
~/meugasto/iniciar.sh
```
