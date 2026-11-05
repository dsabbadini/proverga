#!/usr/bin/env bash
# Instala o Meu Gasto no próprio celular Android, dentro do Termux.
# Uso (no Termux, dentro da pasta "gastos"):  bash scripts/termux-instalar.sh
set -euo pipefail

if [ -z "${PREFIX:-}" ] || [ ! -d "$PREFIX" ] || ! command -v pkg >/dev/null 2>&1; then
  echo "Este script é para o Termux no Android. Veja docs/CELULAR-COMO-SERVIDOR.md" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DADOS="$HOME/meugasto"
PORTA=3000

echo "==> Instalando Node.js e agendador de tarefas"
pkg update -y
pkg install -y nodejs-lts cronie procps curl 2>/dev/null || pkg install -y nodejs cronie procps curl

versao_ok=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(a>22||(a===22&&b>=13)?1:0)')
if [ "$versao_ok" != "1" ]; then
  echo "==> Node $(node -v) é antigo; instalando a versão atual"
  pkg install -y nodejs
fi
echo "    Node $(node -v)"

echo "==> Criando configuração"
mkdir -p "$DADOS"
if [ ! -f "$APP_DIR/.env" ]; then
  TOKEN=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')
  cat > "$APP_DIR/.env" <<EOF
APP_TOKEN=$TOKEN
HOST=127.0.0.1
PORT=$PORTA
DB_PATH=$DADOS/gastos.db
EOF
  chmod 600 "$APP_DIR/.env"
fi
TOKEN=$(grep '^APP_TOKEN=' "$APP_DIR/.env" | cut -d= -f2-)

echo "==> Permissão de armazenamento (para salvar backups em Documentos)"
if [ ! -d "$HOME/storage/shared" ]; then
  termux-setup-storage || true
  sleep 3
fi
BACKUP_DIR="$HOME/storage/shared/Documents/MeuGasto"
[ -d "$HOME/storage/shared" ] || BACKUP_DIR="$DADOS/backups"

echo "==> Script de inicialização"
cat > "$DADOS/iniciar.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Mantém o Termux acordado e sobe o servidor e o agendador de backups.
termux-wake-lock 2>/dev/null
pgrep crond >/dev/null || crond
if ! pgrep -f "node --no-warnings src/server.js" >/dev/null; then
  cd "$APP_DIR" && nohup node --no-warnings src/server.js >> "$DADOS/servidor.log" 2>&1 &
fi
EOF
chmod +x "$DADOS/iniciar.sh"

# Termux:Boot executa o que estiver em ~/.termux/boot ao ligar o celular.
mkdir -p "$HOME/.termux/boot"
ln -sf "$DADOS/iniciar.sh" "$HOME/.termux/boot/meugasto.sh"

echo "==> Backup diário às 03:17"
LINHA="17 3 * * * cd $APP_DIR && DB_PATH=$DADOS/gastos.db node --no-warnings src/backup.js $BACKUP_DIR >> $DADOS/backup.log 2>&1"
{ crontab -l 2>/dev/null | grep -v 'src/backup.js' || true; echo "$LINHA"; } | crontab -

echo "==> Iniciando"
"$DADOS/iniciar.sh"
sleep 2
if curl -fsS "http://127.0.0.1:$PORTA/api/saude" >/dev/null 2>&1; then
  echo "    Servidor no ar."
else
  echo "    Servidor não respondeu. Veja $DADOS/servidor.log" >&2
fi

cat <<EOF

=================================================================
 Meu Gasto instalado.

 Dashboard (abra no Chrome e use "Adicionar à tela inicial"):
   http://127.0.0.1:$PORTA/?token=$TOKEN

 MacroDroid -> Requisição HTTP:
   URL:        http://127.0.0.1:$PORTA/api/notificacoes
   Cabeçalho:  Authorization = Bearer $TOKEN

 Backups diários em: $BACKUP_DIR
 Guarde o token acima. Ele também está em $APP_DIR/.env
=================================================================
EOF
