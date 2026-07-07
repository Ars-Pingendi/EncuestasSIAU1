package com.example.encuestassiau.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "respuestas")
data class Respuesta(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,

    val encuestaTipo: String,
    val preguntaId: Int,
    val respuesta: String,
    val servicio: String,
    val edad: Int,
    val sexo: String,
    val identificacion: String?,
    val comentario: String?,
    val fecha: String,

    val usuarioId: String,
    val usuarioNombre: String,
    val personaQueResponde: String = "",

    /** Motivos de insatisfacción seleccionados; ítems separados por "|". Null si no aplica. */
    val tipificacion: String? = null,

    val sincronizado: Boolean = false
)
