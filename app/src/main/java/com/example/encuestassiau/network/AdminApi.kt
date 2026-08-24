package com.example.encuestassiau.network

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Query

// ── Modelos de respuesta ──────────────────────────────────────────────

data class OrientadorActivo(
    val username: String,
    val nombre: String,
    val ultimaActividad: String,
    val minutosInactivo: Double
)

data class ResumenAdmin(
    val totalEncuestas: Int,
    val npsPromedio: Double?,
    val satisfaccionPromedio: Double?
)

data class RespuestaRemota(
    val id: Long,
    val sesionId: String?,
    val encuestaTipo: String,
    val preguntaId: Int,
    val respuesta: String,
    val servicio: String,
    val edad: Int,
    val sexo: String,
    val personaQueResponde: String,
    val comentario: String?,
    val fecha: String,
    val usuarioId: String,
    val usuarioNombre: String,
    val tipificacion: String?
)

// ── Interfaz Retrofit ─────────────────────────────────────────────────

interface AdminApi {

    /** Resumen estadístico para las tarjetas del dashboard. */
    @GET("respuestas/resumen")
    suspend fun getResumen(
        @Query("desde") desde: String? = null,
        @Query("hasta") hasta: String? = null
    ): Response<ResumenAdmin>

    /** Lista detallada de respuestas con filtros opcionales. */
    @GET("respuestas")
    suspend fun getRespuestas(
        @Query("desde") desde: String? = null,
        @Query("hasta") hasta: String? = null,
        @Query("usuarioId") usuarioId: String? = null,
        @Query("encuestaTipo") tipo: String? = null
    ): Response<List<RespuestaRemota>>

    /** Orientadores con actividad en los últimos 30 minutos. */
    @GET("orientadores/activos")
    suspend fun getOrientadoresActivos(): Response<List<OrientadorActivo>>

    /**
     * Actualiza la marca de tiempo de última actividad del usuario autenticado.
     * La app lo llama automáticamente cada 5 minutos cuando hay sesión activa.
     */
    @PATCH("usuarios/actividad")
    suspend fun actualizarActividad(): Response<Unit>
}
