package com.example.encuestassiau.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "respuestas")
data class Respuesta(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,

    // 🧾 Agrupa todas las respuestas de una misma encuesta (UUID generado al iniciarla)
    val encuestaId: String,

    val encuestaTipo: String,
    val preguntaId: Int,
    val respuesta: String,
    val servicio: String,
    val edad: Int,
    val sexo: String,

    // 🗣️ Quién responde: "Paciente" o "Cuidador principal"
    val informante: String,

    val identificacion: String?,
    val comentario: String?,

    // ⚠️ Tipificación de motivos cuando la calificación es de nivel detractor
    val motivos: List<String> = emptyList(),

    val fecha: String,

    // 👤 Usuario que realizó la encuesta
    val usuarioId: String,
    val usuarioNombre: String,

    val sincronizado: Boolean = false
)
