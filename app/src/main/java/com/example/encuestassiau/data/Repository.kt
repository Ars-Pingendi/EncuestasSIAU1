package com.example.encuestassiau.data

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.example.encuestassiau.BuildConfig
import com.example.encuestassiau.model.Question
import com.example.encuestassiau.network.LoginRequest
import com.example.encuestassiau.network.RetrofitClient
import com.example.encuestassiau.util.JwtUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class Repository(
    private val respuestaDao: RespuestaDao,
    private val preguntaDao: PreguntaDao
) {

    /* =========================
       🔐 TOKEN / USUARIO
       ========================= */

    fun obtenerNombreDesdeToken(context: Context): String? {
        val token = SessionManager.getToken(context) ?: return null
        return JwtUtils.decodePayload(token)
            ?.optString("name_user", "")
            ?.takeIf { it.isNotEmpty() }
    }

    fun isTokenExpired(context: Context): Boolean {
        val token = SessionManager.getToken(context) ?: return true
        return JwtUtils.isExpired(token)
    }

    /* =========================
       🔐 AUTENTICACIÓN
       ========================= */

    suspend fun login(
        context: Context,
        username: String,
        password: String
    ): Result<Unit> {

        // Bypasses de prueba — solo en builds DEBUG, no llegan a producción
        if (BuildConfig.DEBUG) {
            val fakeCreds = mapOf(
                "admin_test"  to Triple("siau2024", "Orientador Test", "ROLE_USER"),
                "admin_admin" to Triple("siau2024", "Administrador SIAU", "ROLE_ADMIN")
            )
            fakeCreds[username]?.let { (pwd, nombre, rol) ->
                if (password == pwd) {
                    // JWT ficticio: payload no tiene authorities real, el rol se guarda directamente
                    val fakeJwt = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0" +
                        ".eyJzdWIiOiJ0ZXN0IiwibmFtZV91c2VyIjoiVGVzdCIsImV4cCI6OTk5OTk5OTk5OX0" +
                        ".test_sig"
                    SessionManager.saveToken(context, fakeJwt)
                    SessionManager.saveUsuario(context, username, nombre)
                    SessionManager.saveRol(context, rol)
                    Log.i("LOGIN", "🧪 Sesión de prueba: $nombre ($rol)")
                    return Result.success(Unit)
                }
            }
        }

        return try {

            val response = RetrofitClient.authApi.login(
                LoginRequest(username, password)
            )

            if (response.isSuccessful) {
                val jwt = response.body()?.jwt

                if (!jwt.isNullOrBlank()) {

                    SessionManager.saveToken(context, jwt)

                    val nombreUsuario =
                        obtenerNombreDesdeToken(context) ?: "Usuario"
                    val rol = JwtUtils.extractRole(jwt)

                    SessionManager.saveUsuario(
                        context = context,
                        usuarioId = username,
                        usuarioNombre = nombreUsuario
                    )
                    SessionManager.saveRol(context, rol)

                    Log.i("LOGIN", "✅ Sesión iniciada: $nombreUsuario ($username) [$rol]")

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
            Log.d("PREGUNTAS", "Tipo=$tipoEncuesta | total=${lista.size}")
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
            Log.e("Repository", "❌ No hay usuario logueado. Respuesta NO guardada.")
            return@withContext
        }

        respuestaDao.insertarRespuesta(
            respuesta.copy(usuarioId = usuarioId, usuarioNombre = usuarioNombre)
        )

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

            pendientes.forEach { respuesta ->
                try {
                    val response = RetrofitClient.syncApi.enviarRespuesta(respuesta)
                    if (response.isSuccessful) {
                        respuestaDao.actualizarRespuesta(respuesta.copy(sincronizado = true))
                        Log.i("SYNC", "✅ Sincronizada pregunta ${respuesta.preguntaId}")
                    } else {
                        Log.w(
                            "SYNC",
                            "⚠️ Servidor rechazó pregunta ${respuesta.preguntaId}: ${response.code()}"
                        )
                    }
                } catch (e: Exception) {
                    Log.e("SYNC", "❌ Error sincronizando pregunta ${respuesta.preguntaId}", e)
                }
            }
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
                        "Usuario,PersonaQueResponde,Servicio,TipoEncuesta,Edad,Sexo,PreguntaId,Respuesta,Tipificacion,Fecha,Sincronizado\n"
                    )
                    respuestas.forEach { r ->
                        val fila = listOf(
                            csvEscape(r.usuarioNombre),
                            csvEscape(r.personaQueResponde),
                            csvEscape(r.servicio),
                            csvEscape(r.encuestaTipo),
                            r.edad.toString(),
                            csvEscape(r.sexo),
                            r.preguntaId.toString(),
                            csvEscape(r.respuesta),
                            csvEscape(r.tipificacion?.replace("|", "; ") ?: ""),
                            csvEscape(r.fecha),
                            if (r.sincronizado) "Sí" else "No"
                        ).joinToString(",")
                        out.write("$fila\n")
                    }
                }

            Log.i("Repository", "📁 CSV generado en Documentos/EncuestasSIAU")

            uri
        }

    /* =========================
       🔤 UTILIDADES
       ========================= */

    private fun csvEscape(texto: String): String =
        "\"${texto.replace("\"", "\"\"").replace("\n", " ").trim()}\""
}
