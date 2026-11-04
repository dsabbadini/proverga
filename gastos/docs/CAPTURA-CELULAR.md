# Captura automática das notificações do celular

O servidor recebe cada notificação de banco em `POST /api/notificacoes`, identifica valor,
estabelecimento, cartão e conta, categoriza e grava. O celular só precisa **encaminhar** a
notificação. Abaixo, como fazer isso em cada sistema.

## Android (recomendado): MacroDroid

O Android permite que um app autorizado leia as notificações de outros apps
(permissão "Acesso a notificações"). O MacroDroid faz isso sem programar e a versão
gratuita comporta esta macro.

1. Instale o **MacroDroid** pela Play Store.
2. **Adicionar macro**:
   - **Gatilho**: *Notificação* → *Notificação recebida* → *Selecionar apps* e marque os
     apps dos seus bancos e carteiras (Santander, Itaú, Bradescard, PicPay, Nubank,
     Mercado Pago, Google Wallet etc.). Texto: *Qualquer*.
   - **Ação**: *Conectividade* → *Requisição HTTP*:
     - Método: `POST`
     - URL: `https://SEU-SERVIDOR/api/notificacoes`
     - Cabeçalho: `Authorization` = `Bearer SEU_APP_TOKEN`
     - Corpo: tipo **formulário** (`application/x-www-form-urlencoded`) com os campos
       abaixo, usando o botão de *texto mágico* (`...`) para inserir as variáveis:

       | Campo   | Valor (texto mágico)                    |
       |---------|-----------------------------------------|
       | `app`   | nome do pacote do app da notificação     |
       | `title` | título da notificação                    |
       | `text`  | texto da notificação                     |

       Prefira formulário a JSON: aspas dentro do texto da notificação quebram um JSON
       montado à mão, e o servidor aceita os dois formatos.
3. Conceda ao MacroDroid **Acesso a notificações** e desative a **otimização de bateria**
   para ele (Configurações → Apps → MacroDroid → Bateria → Sem restrições). Sem isso o
   Android encerra o app em segundo plano e notificações se perdem.
   **Samsung (One UI)**: além disso, em Configurações → Cuidados com o dispositivo →
   Bateria → Limites de uso em segundo plano, adicione o MacroDroid em **Apps que nunca
   entram em suspensão**. A Samsung é a fabricante que mais encerra apps em segundo plano.
4. Teste: faça uma compra pequena ou use o *Testar ação* do MacroDroid. A transação deve
   aparecer no dashboard em segundos.

### Carteira do Google + app do banco

Marque **os dois** no gatilho. A Carteira do Google avisa pagamentos por aproximação com o
celular (formato `MP *LOJA` / `R$ 25,00 com Nubank Mastercard Platinum ••9975`), e o app
do banco avisa as compras com cartão físico e online. Quando os dois avisam a mesma
compra, o servidor reconhece (mesmo valor e mesmo final de cartão em até 10 minutos) e
conta uma vez só.

**Alternativa**: Tasker + plugin AutoNotification, com a mesma requisição HTTP.

### Por que alguns bancos podem não aparecer

- Alguns bancos agrupam notificações ou mostram só "Você tem uma nova mensagem".
  Ative nas configurações do app do banco as **notificações de compra/transação**
  com valor e estabelecimento.
- Notificações que o servidor não entende ficam na faixa azul **"notificação não
  reconhecida"** do dashboard, com o texto original. Esses exemplos servem para ensinar
  novos formatos ao leitor (`src/parser.js`, padrões em `PADROES_ESTABELECIMENTO`).

## iPhone

O iOS **não permite** que nenhum app leia notificações de outros apps. As opções são:

1. **Atalhos → Automação → Transação** (iOS 17 ou superior): dispara quando você paga
   com um cartão da **Carteira (Apple Pay)** e entrega comerciante e valor. Adicione a ação
   *Obter conteúdo de URL* com método `POST`, a URL acima, o cabeçalho `Authorization` e
   corpo JSON `{"app": "Apple Pay", "title": "Compra aprovada", "text": "Compra de R$ <Valor> em <Comerciante>"}`.
   Cobre só pagamentos por aproximação com o iPhone/Watch.
2. **Lançamento manual** no campo "Lançar gasto" do dashboard (instale como app na tela
   inicial: Safari → Compartilhar → Adicionar à Tela de Início).
3. Futuro: bot de WhatsApp e Open Finance (veja o roteiro no README).

## Testando sem celular

```bash
curl -X POST https://SEU-SERVIDOR/api/notificacoes \
  -H "Authorization: Bearer SEU_APP_TOKEN" \
  --data-urlencode "app=com.santander.app" \
  --data-urlencode "title=Santander" \
  --data-urlencode "text=Compra aprovada de R$ 23,40 em PADARIA BELLA no cartão final 9012."
```

Resposta `201` com `"status":"ok"` significa que entrou. `"ignorada"` indica algo que não é
gasto (compra recusada, aviso de fatura, código de segurança). `"duplicada"` indica a mesma
notificação repetida em até 10 minutos.
