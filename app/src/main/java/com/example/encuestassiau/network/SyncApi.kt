package com.example.encuestassiau.network

import com.example.encuestassiau.data.Respuesta
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface SyncApi {
    @POST("respuestas")
    suspend fun enviarRespuesta(@Body respuesta: Respuesta): Response<Unit>
}
