package com.example.encuestassiau.data

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.example.encuestassiau.model.Question
import com.example.encuestassiau.network.LoginRequest
import com.example.encuestassiau.network.NetworkClient
import com.example.encuestassiau.network.RetrofitClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class Repository(
    private val respuestaDao: RespuestaDao,
    private val preguntaDao: PreguntaDao
) {

    /* =========================
       🔐 TOKEN / USUARIO
       ========================= */

    /** Decodifica el payload (claims) del JWT almacenado en sesión. */
    private fun decodificarToken(context: Context): org.json.JSONObject? {
        val token = SessionManager.getToken(context) ?: return null
        return try {
            val payload = token.split(".")[1]
            val decodedBytes = android.util.Base64.decode(
                payload,
                android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP
            )
            org.json.JSONObject(String(decodedBytes, Charsets.UTF_8))
        } catch (e: Exception) {
            Log.e("JWT", "Error decodificando token", e)
            null
        }
    }

    fun obtenerNombreDesdeToken(context: Context): String? =
        decodificarToken(context)?.optString("name_user")?.ifBlank { null }

    /* =========================
       🔐 AUTENTICACIÓN
       ========================= */

    suspend fun login(
        context: Context,
        username: String,
        password: String
    ): Result<Unit> {
        return try {

            val response = RetrofitClient.authApi.login(
                LoginRequest(username, password)
            )

            if (response.isSuccessful) {
                val jwt = response.body()?.jwt

                if (!jwt.isNullOrBlank()) {

                    SessionManager.saveToken(context, jwt)

                    // 🔐 La identidad se toma de los claims del propio JWT
                    val claims = decodificarToken(context)
                    val nombreUsuario =
                        claims?.optString("name_user")?.ifBlank { null } ?: "Usuario"
                    val usuarioId =
                        claims?.optString("sub")?.ifBlank { null } ?: username
                    val usuarioRol =
                        claims?.optString("authorities")?.ifBlank { null } ?: ""

                    SessionManager.saveUsuario(
                        context = context,
                        usuarioId = usuarioId,
                        usuarioNombre = nombreUsuario,
                        usuarioRol = usuarioRol
                    )

                    Log.i(
                        "LOGIN",
                        "✅ Sesión iniciada: $nombreUsuario ($usuarioId) [$usuarioRol]"
                    )

                    Result.success(Unit)
                } else {
                    Result.failure(Exception("Token vacío"))
                }
            } else {
                Result.failure(
                    Exception("Credenciales inválidas (${response.code()})")
                )
            }

        } catch (e: Exception) {
            Log.e("LOGIN", "❌ Error en login", e)
            Result.failure(e)
        }
    }

    /* =========================
       🧠 PREGUNTAS (ROOM)
       ========================= */

    suspend fun obtenerPreguntasLocales(
        tipoEncuesta: String
    ): List<Question> =
        withContext(Dispatchers.IO) {
            val lista = preguntaDao.obtenerPreguntasPorTipo(tipoEncuesta)
            Log.d(
                "PREGUNTAS",
                "Tipo=$tipoEncuesta | total=${lista.size}"
            )
            lista
        }

    /* =========================
       💾 RESPUESTAS
       ========================= */

    suspend fun guardarRespuesta(
        context: Context,
        respuesta: Respuesta
    ) = withContext(Dispatchers.IO) {

        val usuarioId = SessionManager.getUsuarioId(context)
        val usuarioNombre = SessionManager.getUsuarioNombre(context)

        if (usuarioId == null || usuarioNombre == null) {
            Log.e(
                "Repository",
                "❌ No hay usuario logueado. Respuesta NO guardada."
            )
            return@withContext
        }

        val respuestaConUsuario = respuesta.copy(
            usuarioId = usuarioId,
            usuarioNombre = usuarioNombre
        )

        respuestaDao.insertarRespuesta(respuestaConUsuario)

        Log.i(
            "Repository",
            "💾 Respuesta guardada (preguntaId=${respuesta.preguntaId}, usuario=$usuarioNombre)"
        )
    }

    suspend fun obtenerRespuestaGuardada(
        preguntaId: Int
    ): Respuesta? =
        withContext(Dispatchers.IO) {
            respuestaDao.obtenerPorPregunta(preguntaId)
        }

    suspend fun sincronizarPendientes(context: Context) {
        withContext(Dispatchers.IO) {

            val pendientes = respuestaDao.obtenerNoSincronizadas()

            if (pendientes.isEmpty()) {
                Log.i("SYNC", "✅ No hay respuestas pendientes")
                return@withContext
            }

            var enviadas = 0
            pendientes.forEach { respuesta ->
                try {
                    // 📤 Envía al servidor; solo se marca sincronizado si tuvo éxito
                    val ok = NetworkClient.enviarRespuesta(respuesta)
                    if (ok) {
                        respuestaDao.actualizarRespuesta(
                            respuesta.copy(sincronizado = true)
                        )
                        enviadas++
                    } else {
                        Log.w(
                            "SYNC",
                            "⚠️ El servidor rechazó la respuesta ${respuesta.preguntaId}; queda pendiente"
                        )
                    }
                } catch (e: Exception) {
                    Log.e(
                        "SYNC",
                        "❌ Error sincronizando pregunta ${respuesta.preguntaId}",
                        e
                    )
                }
            }
            Log.i("SYNC", "📤 Sincronización: $enviadas/${pendientes.size} enviadas")
        }
    }

    suspend fun contarPendientes(): Int =
        withContext(Dispatchers.IO) {
            respuestaDao.contarNoSincronizadas()
        }

    suspend fun borrarTodo() =
        withContext(Dispatchers.IO) {
            respuestaDao.borrarTodo()
        }

    /* =========================
       📤 EXPORTACIÓN CSV (PÚBLICO)
       ========================= */

    suspend fun exportarRespuestasCsv(
        context: Context
    ): Uri =
        withContext(Dispatchers.IO) {

            val respuestas = respuestaDao.obtenerTodas()
            val nombreArchivo = "respuestas_siau.csv"

            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, nombreArchivo)
                put(MediaStore.MediaColumns.MIME_TYPE, "text/csv")
                put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOCUMENTS + "/EncuestasSIAU"
                )
            }

            val uri = context.contentResolver.insert(
                MediaStore.Files.getContentUri("external"),
                values
            ) ?: throw Exception("No se pudo crear el archivo CSV")

            context.contentResolver
                .openOutputStream(uri)
                ?.bufferedWriter()
                ?.use { out ->

                    out.write(
                        "EncuestaId,Usuario,Servicio,Edad,Sexo,Informante,TipoEncuesta,PreguntaId,Respuesta,Comentario,Motivos,Fecha,Sincronizado\n"
                    )

                    respuestas.forEach { r ->
                        val fila = listOf(
                            limpiarTexto(r.encuestaId),
                            limpiarTexto(r.usuarioNombre),
                            limpiarTexto(r.servicio),
                            r.edad.toString(),
                            limpiarTexto(r.sexo),
                            limpiarTexto(r.informante),
                            limpiarTexto(r.encuestaTipo),
                            r.preguntaId.toString(),
                            "\"${limpiarTexto(r.respuesta)}\"",
                            "\"${limpiarTexto(r.comentario ?: "")}\"",
                            "\"${limpiarTexto(r.motivos.joinToString("; "))}\"",
                            limpiarTexto(r.fecha),
                            if (r.sincronizado) "Sí" else "No"
                        ).joinToString(",")

                        out.write("$fila\n")
                    }
                }

            Log.i(
                "Repository",
                "📁 CSV generado en Documentos/EncuestasSIAU"
            )

            uri
        }

    /* =========================
       🔤 UTILIDADES
       ========================= */

    private fun limpiarTexto(texto: String): String =
        texto
            .replace("\"", "\"\"")
            .replace(",", ";")
            .replace("\n", " ")
            .trim()
}
