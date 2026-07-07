package com.example.encuestassiau.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.example.encuestassiau.model.Question

@Dao
interface PreguntaDao {

    @Query("SELECT * FROM preguntas WHERE tipoEncuesta = :tipo ORDER BY id ASC")
    suspend fun obtenerPreguntasPorTipo(tipo: String): List<Question>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertarTodas(preguntas: List<Question>)

    @Query("SELECT COUNT(*) FROM preguntas")
    suspend fun count(): Int

    @Query("DELETE FROM preguntas")
    suspend fun borrarPreguntas()
}