package com.example.encuestassiau.data

import androidx.room.*

@Dao
interface RespuestaDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertarRespuesta(respuesta: Respuesta)

    @Update
    suspend fun actualizarRespuesta(respuesta: Respuesta)

    @Query("SELECT * FROM respuestas WHERE sincronizado = 0")
    suspend fun obtenerNoSincronizadas(): List<Respuesta>

    @Query("SELECT * FROM respuestas ORDER BY fecha DESC")
    suspend fun obtenerTodas(): List<Respuesta>

    @Query("DELETE FROM respuestas")
    suspend fun borrarTodo()

    @Query("SELECT * FROM respuestas WHERE preguntaId = :preguntaId LIMIT 1")
    suspend fun obtenerPorPregunta(preguntaId: Int): Respuesta?

    @Query("SELECT COUNT(*) FROM respuestas WHERE sincronizado = 0")
    suspend fun contarNoSincronizadas(): Int


}

