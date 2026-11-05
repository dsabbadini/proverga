package br.com.meugasto

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Serviço que o Android chama a cada notificação publicada (com a permissão concedida).
 * Guarda só as de bancos, carteiras e SMS que mencionam valor em reais; o resto é ignorado
 * e nunca é gravado. A interpretação (valor, loja, categoria) acontece no dashboard.
 */
class LeitorNotificacoes : NotificationListenerService() {

    companion object {
        /** Apps financeiros conhecidos. */
        private val APPS = setOf(
            "com.nu.production", "com.itau", "com.itau.iti", "br.com.itau.personnalite",
            "com.santander.app", "br.com.santander.way", "com.bradesco", "br.com.bradesco.cartoes",
            "br.com.bradescard.app", "br.com.bb.android", "br.com.gabba.Caixa", "br.gov.caixa.tem",
            "br.com.intermedium", "com.c6bank.app", "com.picpay", "com.mercadopago.wallet",
            "com.btgpactual.pf", "br.com.xp.carteira", "com.neon", "com.pagbank.app",
            "br.com.uol.ps.myaccount", "com.google.android.apps.walletnfcrel", "com.samsung.android.spay",
            "com.samsung.android.samsungpay.gear", "br.com.original.bank", "br.com.bancopan",
            "com.sicredi.app", "br.com.sicoobnet", "com.willbank", "br.com.digio", "br.com.nextbank",
            "com.safra.cartoes", "br.com.ourocard", "com.vivo.pay", "com.ame.ame", "com.recargapay",
        )

        /** Apps de SMS: muitos bancos ainda avisam compras por SMS. */
        private val SMS = setOf(
            "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
        )

        /** Pedaços de nome de pacote típicos de bancos, para cobrir apps fora da lista. */
        private val PISTAS = listOf("bank", "banco", "bradesco", "itau", "santander", "sicoob", "sicredi", "caixa", "carteira", "wallet")

        private const val JANELA_REPETIDA_MS = 10 * 60 * 1000L
        private val recentes = LinkedHashMap<String, Long>()

        fun ehFinanceiro(pacote: String): Boolean =
            pacote in APPS || pacote in SMS || PISTAS.any { pacote.contains(it, ignoreCase = true) }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            processar(sbn)
        } catch (e: Exception) {
            // Nunca derrubar o serviço por causa de uma notificação malformada.
        }
    }

    private fun processar(sbn: StatusBarNotification) {
        val pacote = sbn.packageName ?: return
        if (pacote == packageName || !ehFinanceiro(pacote)) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val extras = n.extras ?: return
        val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty().trim()
        val texto = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty().trim()
        if (!"$titulo $texto".contains("R$")) return

        // O Android reenvia a mesma notificação quando ela é atualizada; registra uma vez só.
        val chave = "$pacote|$titulo|$texto"
        val agora = System.currentTimeMillis()
        synchronized(recentes) {
            recentes.entries.removeAll { agora - it.value > JANELA_REPETIDA_MS }
            if (recentes.containsKey(chave)) return
            recentes[chave] = agora
        }

        Armazenamento.enfileirar(applicationContext, pacote, titulo, texto, sbn.postTime)
        MainActivity.avisarNovaNotificacao()
    }
}
