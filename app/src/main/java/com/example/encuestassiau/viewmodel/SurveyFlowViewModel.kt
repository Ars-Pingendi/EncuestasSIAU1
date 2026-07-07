package com.example.encuestassiau.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.model.Question
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SurveyFlowState(
    val screen: String = "start",
    val tipoEncuesta: String = "",
    val servicio: String = "",
    val edad: Int = 0,
    val sexo: String = "",
    val personaQueResponde: String = "",
    val preguntas: List<Question> = emptyList(),
    val preguntasCargando: Boolean = false,
    val preguntasError: String? = null
)

class SurveyFlowViewModel(
    private val repository: Repository
) : ViewModel() {

    private val _state = MutableStateFlow(SurveyFlowState())
    val state: StateFlow<SurveyFlowState> = _state.asStateFlow()

    fun seleccionarTipo(tipo: String) {
        _state.update { it.copy(tipoEncuesta = tipo, screen = "servicio") }
        cargarPreguntas()
    }

    fun seleccionarServicio(servicio: String) {
        _state.update { it.copy(servicio = servicio, screen = "edadSexo") }
    }

    fun guardarEdadSexo(edad: Int, sexo: String, personaQueResponde: String) {
        _state.update {
            it.copy(
                edad = edad,
                sexo = sexo,
                personaQueResponde = personaQueResponde,
                screen = "preguntas"
            )
        }
    }

    fun finalizarEncuesta() {
        _state.update { it.copy(screen = "gracias") }
    }

    fun volverAInicio() {
        _state.value = SurveyFlowState()
    }

    private fun cargarPreguntas() {
        viewModelScope.launch {
            _state.update { it.copy(preguntasCargando = true, preguntasError = null) }
            try {
                val preguntas = repository.obtenerPreguntasLocales("unificado")
                _state.update { it.copy(preguntas = preguntas, preguntasCargando = false) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(preguntasCargando = false, preguntasError = "Error al cargar preguntas")
                }
            }
        }
    }
}
