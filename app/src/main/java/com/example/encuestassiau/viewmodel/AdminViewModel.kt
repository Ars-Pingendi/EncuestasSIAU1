package com.example.encuestassiau.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.encuestassiau.BuildConfig
import com.example.encuestassiau.network.OrientadorActivo
import com.example.encuestassiau.network.ResumenAdmin
import com.example.encuestassiau.network.RetrofitClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

enum class FiltroFecha(val etiqueta: String) {
    HOY("Hoy"),
    SEMANA("Esta semana"),
    MES("Este mes"),
    PERSONALIZADO("Personalizado")
}

data class AdminState(
    val filtro: FiltroFecha = FiltroFecha.HOY,
    val desdePersonalizado: LocalDate? = null,
    val hastaPersonalizado: LocalDate? = null,
    val resumen: ResumenAdmin? = null,
    val orientadoresActivos: List<OrientadorActivo> = emptyList(),
    val cargando: Boolean = true,
    val error: String? = null,
    val esMock: Boolean = false
)

class AdminViewModel : ViewModel() {

    private val _state = MutableStateFlow(AdminState())
    val state: StateFlow<AdminState> = _state.asStateFlow()

    init { cargar() }

    fun cambiarFiltro(filtro: FiltroFecha) {
        if (filtro == FiltroFecha.PERSONALIZADO) return
        _state.update { it.copy(filtro = filtro) }
        cargar()
    }

    fun cambiarRango(desde: LocalDate, hasta: LocalDate) {
        _state.update {
            it.copy(
                filtro = FiltroFecha.PERSONALIZADO,
                desdePersonalizado = desde,
                hastaPersonalizado = hasta
            )
        }
        cargar()
    }

    fun recargar() = cargar()

    private fun cargar() {
        viewModelScope.launch {
            _state.update { it.copy(cargando = true, error = null) }
            val hoy = LocalDate.now()
            val s = _state.value
            val desde = when (s.filtro) {
                FiltroFecha.HOY           -> hoy
                FiltroFecha.SEMANA        -> hoy.minusDays(6)
                FiltroFecha.MES           -> hoy.withDayOfMonth(1)
                FiltroFecha.PERSONALIZADO -> s.desdePersonalizado ?: hoy
            }
            val hasta = when (s.filtro) {
                FiltroFecha.PERSONALIZADO -> s.hastaPersonalizado ?: hoy
                else                      -> hoy
            }
            try {
                val resumenResp      = RetrofitClient.adminApi.getResumen(desde.toString(), hasta.toString())
                val orientadoresResp = RetrofitClient.adminApi.getOrientadoresActivos()
                _state.update {
                    it.copy(
                        resumen = resumenResp.body().takeIf { resumenResp.isSuccessful },
                        orientadoresActivos = orientadoresResp.body()
                            .takeIf { orientadoresResp.isSuccessful } ?: emptyList(),
                        cargando = false,
                        esMock = false,
                        error = if (!resumenResp.isSuccessful) "Error ${resumenResp.code()}" else null
                    )
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    // Fallback a datos ficticios en modo DEBUG
                    val dias = ChronoUnit.DAYS.between(desde, hasta).coerceAtLeast(1)
                    _state.update {
                        it.copy(
                            resumen = mockResumen(dias),
                            orientadoresActivos = mockOrientadores(),
                            cargando = false,
                            error = null,
                            esMock = true
                        )
                    }
                } else {
                    _state.update { it.copy(cargando = false, error = "Sin conexión con el servidor") }
                }
            }
        }
    }

    // ── Datos ficticios para pruebas (solo DEBUG) ─────────────────────

    private fun mockResumen(dias: Long): ResumenAdmin {
        val base = (dias * 13.7).toInt().coerceAtLeast(1)
        return ResumenAdmin(
            totalEncuestas      = base,
            npsPromedio         = 8.2 - (dias * 0.01).coerceAtMost(1.0),
            satisfaccionPromedio = 4.3 - (dias * 0.005).coerceAtMost(0.5)
        )
    }

    private fun mockOrientadores(): List<OrientadorActivo> = listOf(
        OrientadorActivo("maria.gonzalez",  "MARÍA JOSÉ GONZÁLEZ RUIZ",  "2026-08-24T10:55:00Z", 5.0),
        OrientadorActivo("carlos.ramirez",  "CARLOS ANDRÉS RAMÍREZ",     "2026-08-24T10:42:00Z", 18.0),
        OrientadorActivo("ana.quintero",    "ANA LUCÍA QUINTERO MORA",   "2026-08-24T10:33:00Z", 27.0)
    )
}
