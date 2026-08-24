package com.example.encuestassiau.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.encuestassiau.network.AdminApi
import com.example.encuestassiau.network.OrientadorActivo
import com.example.encuestassiau.network.ResumenAdmin
import com.example.encuestassiau.network.RetrofitClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

enum class FiltroFecha(val etiqueta: String) {
    HOY("Hoy"),
    SEMANA("Esta semana"),
    MES("Este mes")
}

data class AdminState(
    val filtro: FiltroFecha = FiltroFecha.HOY,
    val resumen: ResumenAdmin? = null,
    val orientadoresActivos: List<OrientadorActivo> = emptyList(),
    val cargando: Boolean = true,
    val error: String? = null
)

class AdminViewModel : ViewModel() {

    private val _state = MutableStateFlow(AdminState())
    val state: StateFlow<AdminState> = _state.asStateFlow()

    init { cargar() }

    fun cambiarFiltro(filtro: FiltroFecha) {
        _state.update { it.copy(filtro = filtro) }
        cargar()
    }

    fun recargar() = cargar()

    private fun cargar() {
        viewModelScope.launch {
            _state.update { it.copy(cargando = true, error = null) }
            try {
                val hoy = LocalDate.now()
                val desde = when (_state.value.filtro) {
                    FiltroFecha.HOY    -> hoy.toString()
                    FiltroFecha.SEMANA -> hoy.minusDays(6).toString()
                    FiltroFecha.MES    -> hoy.withDayOfMonth(1).toString()
                }
                val hasta = hoy.toString()

                val resumenResp      = RetrofitClient.adminApi.getResumen(desde, hasta)
                val orientadoresResp = RetrofitClient.adminApi.getOrientadoresActivos()

                _state.update {
                    it.copy(
                        resumen = resumenResp.body().takeIf { resumenResp.isSuccessful },
                        orientadoresActivos = orientadoresResp.body()
                            .takeIf { orientadoresResp.isSuccessful } ?: emptyList(),
                        cargando = false,
                        error = if (!resumenResp.isSuccessful) "Error ${resumenResp.code()}" else null
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(cargando = false, error = "Sin conexión con el servidor")
                }
            }
        }
    }
}
