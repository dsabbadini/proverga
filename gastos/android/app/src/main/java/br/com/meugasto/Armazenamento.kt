package br.com.meugasto

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Persistência em arquivos privados do app:
 *  - dados.json: estado completo (transações, regras, histórico), escrito pelo dashboard;
 *  - fila.json: notificações capturadas em segundo plano, aguardando o dashboard processar.
 * O serviço de notificações e a tela rodam no mesmo processo; o lock evita escritas simultâneas.
 */
object Armazenamento {
    private val lock = Any()
    private const val MAX_FILA = 2000

    private fun arquivo(ctx: Context, nome: String) = File(ctx.filesDir, nome)

    /** Grava em arquivo temporário e renomeia, para nunca deixar um JSON pela metade. */
    private fun gravarAtomico(destino: File, conteudo: String) {
        val tmp = File(destino.parentFile, destino.name + ".tmp")
        tmp.writeText(conteudo, Charsets.UTF_8)
        if (!tmp.renameTo(destino)) {
            destino.writeText(conteudo, Charsets.UTF_8)
            tmp.delete()
        }
    }

    fun lerDados(ctx: Context): String = synchronized(lock) {
        val f = arquivo(ctx, "dados.json")
        if (f.exists()) f.readText(Charsets.UTF_8) else ""
    }

    fun salvarDados(ctx: Context, json: String) = synchronized(lock) {
        gravarAtomico(arquivo(ctx, "dados.json"), json)
    }

    private fun lerFilaInterno(ctx: Context): JSONArray {
        val f = arquivo(ctx, "fila.json")
        if (!f.exists()) return JSONArray()
        return try { JSONArray(f.readText(Charsets.UTF_8)) } catch (e: Exception) { JSONArray() }
    }

    fun enfileirar(ctx: Context, app: String, titulo: String, texto: String, ts: Long) = synchronized(lock) {
        val fila = lerFilaInterno(ctx)
        val item = JSONObject()
            .put("id", "$ts-${(app + titulo + texto).hashCode()}")
            .put("app", app)
            .put("title", titulo)
            .put("text", texto)
            .put("ts", ts)
        fila.put(item)
        // Proteção: se o app ficar meses sem abrir, mantém só as mais recentes.
        while (fila.length() > MAX_FILA) fila.remove(0)
        gravarAtomico(arquivo(ctx, "fila.json"), fila.toString())
    }

    fun lerFila(ctx: Context): String = synchronized(lock) { lerFilaInterno(ctx).toString() }

    /** Remove da fila os itens já processados pelo dashboard. */
    fun confirmarFila(ctx: Context, idsJson: String) = synchronized(lock) {
        val ids = JSONArray(idsJson)
        val confirmados = HashSet<String>()
        for (i in 0 until ids.length()) confirmados.add(ids.getString(i))
        val fila = lerFilaInterno(ctx)
        val resto = JSONArray()
        for (i in 0 until fila.length()) {
            val item = fila.getJSONObject(i)
            if (item.optString("id") !in confirmados) resto.put(item)
        }
        gravarAtomico(arquivo(ctx, "fila.json"), resto.toString())
    }
}
