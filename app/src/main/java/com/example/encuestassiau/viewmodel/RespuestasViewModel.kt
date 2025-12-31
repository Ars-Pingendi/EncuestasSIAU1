package com.example.encuestassiau.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.data.Respuesta
import kotlinx.coroutines.launch

class RespuestasViewModel(
    private val repository: Repository
) : ViewModel() {

    fun guardarRespuesta(
        context: Context,
        respuesta: Respuesta
    ) {
        viewModelScope.launch {
            repository.guardarRespuesta(context, respuesta)
        }
    }

    fun sincronizarPendientes(context: Context) {
        viewModelScope.launch {
            repository.sincronizarPendientes(context)
        }
    }

    fun cancelarEncuesta() {
        viewModelScope.launch {
            repository.borrarTodo()
        }
    }

    suspend fun cargarRespuesta(preguntaId: Int): Respuesta? {
        return repository.obtenerRespuestaGuardada(preguntaId)
    }
}
