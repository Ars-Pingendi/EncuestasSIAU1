package com.example.encuestassiau.util

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

object AppPreferences {
    var textoGrande by mutableStateOf(false)
        private set

    fun cargar(context: Context) {
        val prefs = context.getSharedPreferences("encuestas_preferencias", Context.MODE_PRIVATE)
        textoGrande = prefs.getBoolean("texto_grande", false)
    }

    fun alternarTextoGrande(context: Context) {
        textoGrande = !textoGrande
        context.getSharedPreferences("encuestas_preferencias", Context.MODE_PRIVATE)
            .edit().putBoolean("texto_grande", textoGrande).apply()
    }
}
