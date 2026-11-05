package br.com.meugasto

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import java.lang.ref.WeakReference
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Tela única: o dashboard (HTML do projeto) num WebView, ligado ao Android por uma ponte. */
class MainActivity : Activity() {

    companion object {
        private const val PEDIDO_EXPORTAR = 1
        private const val PEDIDO_IMPORTAR = 2
        private const val URL_INICIAL = "https://appassets.androidplatform.net/assets/web/index.html"
        private var atual: WeakReference<MainActivity>? = null

        /** Chamado pelo serviço quando chega notificação com o app aberto. */
        fun avisarNovaNotificacao() {
            val tela = atual?.get() ?: return
            tela.runOnUiThread {
                tela.webView.evaluateJavascript("window.meuGastoNovaNotificacao && window.meuGastoNovaNotificacao()", null)
            }
        }
    }

    private lateinit var webView: WebView
    private var backupPendente: String? = null
    private var escolhaArquivo: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        atual = WeakReference(this)

        // Serve assets/web por https://appassets.androidplatform.net, o que permite módulos JS.
        val carregador = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.addJavascriptInterface(Ponte(), "MeuGastoNativo")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                carregador.shouldInterceptRequest(request.url)

            // Nenhuma navegação para fora do app.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams,
            ): Boolean {
                escolhaArquivo?.onReceiveValue(null)
                escolhaArquivo = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*")
                startActivityForResult(intent, PEDIDO_IMPORTAR)
                return true
            }
        }
        setContentView(webView)
        webView.loadUrl(URL_INICIAL)
    }

    override fun onDestroy() {
        if (atual?.get() === this) atual = null
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("API de Activity simples, sem dependência de AndroidX Activity")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    @Deprecated("API de Activity simples, sem dependência de AndroidX Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            PEDIDO_EXPORTAR -> {
                val uri = data?.data
                val json = backupPendente
                backupPendente = null
                if (resultCode == RESULT_OK && uri != null && json != null) {
                    try {
                        contentResolver.openOutputStream(uri, "wt")?.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                        Toast.makeText(this, "Backup salvo", Toast.LENGTH_SHORT).show()
                    } catch (e: Exception) {
                        Toast.makeText(this, "Não foi possível salvar o backup", Toast.LENGTH_LONG).show()
                    }
                }
            }
            PEDIDO_IMPORTAR -> {
                val uri = data?.data
                escolhaArquivo?.onReceiveValue(if (resultCode == RESULT_OK && uri != null) arrayOf(uri) else null)
                escolhaArquivo = null
            }
        }
    }

    private fun temPermissao(): Boolean {
        val habilitados = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val meu = ComponentName(this, LeitorNotificacoes::class.java)
        return habilitados.split(":").any { ComponentName.unflattenFromString(it) == meu }
    }

    private fun abrirPermissao() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    ComponentName(this, LeitorNotificacoes::class.java).flattenToString(),
                )
        } else {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }

    /** Métodos visíveis ao JavaScript como window.MeuGastoNativo (ver nucleo/api-local.js). */
    inner class Ponte {
        private val principal = Handler(Looper.getMainLooper())

        @JavascriptInterface fun carregarDados(): String = Armazenamento.lerDados(applicationContext)
        @JavascriptInterface fun salvarDados(json: String) = Armazenamento.salvarDados(applicationContext, json)
        @JavascriptInterface fun lerFila(): String = Armazenamento.lerFila(applicationContext)
        @JavascriptInterface fun confirmarFila(ids: String) = Armazenamento.confirmarFila(applicationContext, ids)
        @JavascriptInterface fun temPermissao(): Boolean = this@MainActivity.temPermissao()
        @JavascriptInterface fun abrirPermissao() { principal.post { this@MainActivity.abrirPermissao() } }

        @JavascriptInterface
        fun exportarBackup(json: String) {
            principal.post {
                backupPendente = json
                val data = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE, "meugasto-backup-$data.json")
                startActivityForResult(intent, PEDIDO_EXPORTAR)
            }
        }
    }
}
