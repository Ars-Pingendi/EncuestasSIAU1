package com.example.encuestassiau.network

import android.util.Log
import com.example.encuestassiau.data.Respuesta
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

object NetworkClient {

    // 🔐 Token en memoria (inyectado desde SessionManager)
    @Volatile
    private var authToken: String? = null

    fun setAuthToken(token: String?) {
        authToken = token
        Log.i("NetworkClient", "Token actualizado")
    }
    /**
     * URL del servidor para envío de respuestas.
     * Configurable en local.properties (api.base.url); ver app/build.gradle.kts
     */
    private val BASE_URL = com.example.encuestassiau.BuildConfig.API_BASE_URL

    private val client = HttpClient(CIO) {

        install(ContentNegotiation) {
            json(
                Json {
                    isLenient = true
                    ignoreUnknownKeys = true
                }
            )
        }

        defaultRequest {
            contentType(ContentType.Application.Json)

            authToken?.let {
                header(HttpHeaders.Authorization, "Bearer $it")
            }
        }

        install(HttpTimeout) {
            requestTimeoutMillis = 15_000
            connectTimeoutMillis = 10_000
            socketTimeoutMillis = 15_000
        }

        HttpResponseValidator {
            validateResponse { response ->
                if (response.status == HttpStatusCode.Unauthorized) {
                    Log.w("NetworkClient", "Token inválido o vencido (401)")
                    setAuthToken(null)
                }
            }
        }
    }

    /**
     * Envía una respuesta al servidor.
     * NOTA: El endpoint aún no está disponible. Método preparado para integración futura.
     */

    suspend fun enviarRespuesta(respuesta: Respuesta): Boolean {
        return try {
            client.post("$BASE_URL/respuestas") {
                setBody(respuesta)
            }.status.isSuccess()
        } catch (e: Exception) {
            Log.e("NetworkClient", "❌ Error enviando respuesta", e)
            false
        }
    }
}
