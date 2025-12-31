package com.example.encuestassiau.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "preguntas")
data class Question(
    @PrimaryKey val id: Int,
    val tipoEncuesta: String,
    val texto: String,
    val opciones: List<String> = emptyList(),
    val requiereComentario: Boolean = false
)
