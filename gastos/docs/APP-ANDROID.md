# App Android (APK)

O app junta tudo num só lugar: lê as notificações dos bancos sozinho, categoriza e mostra o
dashboard. Não precisa de MacroDroid, Termux nem servidor. O app **não tem permissão de
internet**: os dados ficam só no celular.

## Baixar e instalar

1. No celular, abra
   **https://github.com/dsabbadini/proverga/releases/latest/download/MeuGasto.apk**
   (se o repositório for privado, entre na sua conta do GitHub no navegador antes).
2. Toque no arquivo baixado. O Android pede para **permitir instalar apps desta fonte**
   (Chrome ou Arquivos): permita e volte.
3. Se o Play Protect avisar que o app é desconhecido, toque em **Mais detalhes → Instalar
   assim mesmo**. Ele avisa porque o app não veio da Play Store.

## Liberar a leitura de notificações

1. Abra o Meu Gasto e toque em **Liberar acesso**.
2. Ative **Meu Gasto** na lista de acesso a notificações.

**Se a opção aparecer cinza ou com o aviso "Configuração restrita"** (Android 13 ou
superior, comum em Samsung): o Android bloqueia essa permissão para apps instalados fora da
loja até você liberar manualmente.
1. Vá em **Configurações → Aplicativos → Meu Gasto**.
2. Toque nos **três pontinhos (⋮)** no canto superior direito → **Permitir configurações
   restritas** e confirme com sua senha/digital.
3. Volte ao app e toque em **Liberar acesso** de novo.

## Samsung: manter o leitor ativo

Configurações → Cuidados com o dispositivo → Bateria → Limites de uso em segundo plano →
**Apps que nunca entram em suspensão** → adicione **Meu Gasto**.

## Como funciona

- O leitor de notificações guarda só as de **bancos, carteiras e SMS** que mencionam
  **R$**. Notificações de outros apps (WhatsApp, e-mail, redes sociais) são descartadas sem
  serem gravadas.
- Cada notificação guardada é interpretada quando você abre o app (ou na hora, se ele
  estiver aberto), com o horário original da compra.
- A mesma compra avisada pela Carteira do Google e pelo app do banco conta uma vez só.
- Notificações que o leitor não entendeu aparecem na faixa azul para revisão.

## Backup

- **Automático**: se o backup do Google estiver ativo no celular, o Android salva os dados
  do app junto com o backup do aparelho.
- **Manual**: no fim do dashboard, **Exportar backup** salva um arquivo `.json` onde você
  escolher (por exemplo, no Google Drive). **Restaurar backup** carrega esse arquivo.

## Atualizar

Baixe o APK pelo mesmo link e instale por cima; os dados são mantidos **desde que todas as
versões tenham a mesma assinatura** (veja abaixo). Enquanto a chave fixa não estiver
configurada, cada versão sai com uma assinatura diferente: o Android recusa instalar por
cima e é preciso **exportar o backup, desinstalar, instalar a nova e restaurar**.

## Para desenvolvedores

- Código nativo em `gastos/android` (Kotlin, sem bibliotecas além de `androidx.webkit`).
- O dashboard (`gastos/public`) e o núcleo (`gastos/nucleo`) são copiados para dentro do
  APK na compilação, então o app e o servidor usam exatamente a mesma lógica.
- O GitHub Actions (`.github/workflows/meugasto-apk.yml`) roda os testes, compila e publica
  em Releases a cada mudança em `gastos/`.
- **Assinatura**: a chave **não fica no repositório** (quem a tivesse poderia publicar
  APKs se passando pelo app). Para ter atualizações por cima, crie uma chave uma vez e
  cadastre em GitHub → Settings → Secrets and variables → Actions:
  `KEYSTORE_BASE64` (o arquivo `.keystore` em base64), `KEYSTORE_PASSWORD` e, opcionalmente,
  `KEY_ALIAS` (padrão `meugasto`). Para gerar num computador com Java:
  ```bash
  keytool -genkeypair -keystore meugasto.keystore -alias meugasto -keyalg RSA \
    -keysize 2048 -validity 10000 -dname "CN=Meu Gasto"
  base64 -w0 meugasto.keystore   # conteúdo para KEYSTORE_BASE64
  ```
  Guarde o arquivo e a senha fora do repositório: perder a chave obriga a reinstalar o app.
