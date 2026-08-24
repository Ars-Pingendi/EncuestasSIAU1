package com.example.encuestassiau.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.data.SessionManager
import com.example.encuestassiau.network.OrientadorActivo
import com.example.encuestassiau.network.ResumenAdmin
import com.example.encuestassiau.viewmodel.AdminState
import com.example.encuestassiau.viewmodel.AdminViewModel
import com.example.encuestassiau.viewmodel.FiltroFecha
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    repository: Repository,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val vm: AdminViewModel = viewModel()
    val state by vm.state.collectAsState()
    val nombreUsuario = remember { SessionManager.getUsuarioNombre(context) ?: "Administrador" }

    var mostrarDatePicker by remember { mutableStateOf(false) }
    val dateRangeState = rememberDateRangePickerState()

    if (mostrarDatePicker) {
        RangoFechasDialog(
            state = dateRangeState,
            onDismiss = { mostrarDatePicker = false },
            onConfirmar = { desde, hasta ->
                vm.cambiarRango(desde, hasta)
                mostrarDatePicker = false
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Dashboard SIAU", style = MaterialTheme.typography.titleMedium)
                        Text(
                            nombreUsuario,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { vm.recargar() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Recargar")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                TextButton(
                    onClick = onLogout,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) { Text("Cerrar sesión") }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── Filtro de fecha ──────────────────────────────────────
            FiltroFechaRow(
                filtroActual = state.filtro,
                desdePersonalizado = state.desdePersonalizado,
                hastaPersonalizado = state.hastaPersonalizado,
                onCambiarPreset = vm::cambiarFiltro,
                onAbrirDatePicker = { mostrarDatePicker = true }
            )

            // ── Etiqueta del rango activo ────────────────────────────
            RangoActivo(state)

            // ── Tarjetas de resumen ──────────────────────────────────
            when {
                state.cargando -> Box(
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }

                state.error != null -> ErrorCard(
                    mensaje = state.error!!,
                    onReintentar = { vm.recargar() }
                )

                else -> TarjetasResumen(resumen = state.resumen)
            }

            // ── Orientadores activos ─────────────────────────────────
            OrientadoresCard(
                orientadores = state.orientadoresActivos,
                cargando = state.cargando
            )

            // ── Exportar ─────────────────────────────────────────────
            OutlinedButton(
                onClick = { scope.launch { repository.exportarRespuestasCsv(context) } },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Exportar CSV local") }
        }
    }
}

// ── Selector de rango ─────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RangoFechasDialog(
    state: DateRangePickerState,
    onDismiss: () -> Unit,
    onConfirmar: (LocalDate, LocalDate) -> Unit
) {
    val ambosSeleccionados = state.selectedStartDateMillis != null &&
        state.selectedEndDateMillis != null

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                enabled = ambosSeleccionados,
                onClick = {
                    val desde = state.selectedStartDateMillis!!
                        .let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    val hasta = state.selectedEndDateMillis!!
                        .let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    onConfirmar(desde, hasta)
                }
            ) { Text("Aplicar") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        }
    ) {
        DateRangePicker(
            state = state,
            title = {
                Text(
                    "Selecciona el rango de fechas",
                    modifier = Modifier.padding(start = 24.dp, top = 16.dp)
                )
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(500.dp)
        )
    }
}

// ── Fila de chips de filtro ───────────────────────────────────────────

@Composable
private fun FiltroFechaRow(
    filtroActual: FiltroFecha,
    desdePersonalizado: LocalDate?,
    hastaPersonalizado: LocalDate?,
    onCambiarPreset: (FiltroFecha) -> Unit,
    onAbrirDatePicker: () -> Unit
) {
    val fmt = remember { DateTimeFormatter.ofPattern("d MMM", Locale("es", "CO")) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        listOf(FiltroFecha.HOY, FiltroFecha.SEMANA, FiltroFecha.MES).forEach { filtro ->
            FilterChip(
                selected = filtro == filtroActual,
                onClick = { onCambiarPreset(filtro) },
                label = { Text(filtro.etiqueta, maxLines = 1) },
                modifier = Modifier.weight(1f)
            )
        }
        // Chip de rango personalizado
        val etiqueta = if (filtroActual == FiltroFecha.PERSONALIZADO &&
            desdePersonalizado != null && hastaPersonalizado != null
        ) {
            "${desdePersonalizado.format(fmt)} – ${hastaPersonalizado.format(fmt)}"
        } else {
            "Rango"
        }
        FilterChip(
            selected = filtroActual == FiltroFecha.PERSONALIZADO,
            onClick = onAbrirDatePicker,
            leadingIcon = {
                Icon(
                    Icons.Filled.DateRange,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
            },
            label = { Text(etiqueta, maxLines = 1) },
            modifier = Modifier.weight(1.4f)
        )
    }
}

// ── Etiqueta del período activo ───────────────────────────────────────

@Composable
private fun RangoActivo(state: AdminState) {
    val fmt = remember { DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", Locale("es", "CO")) }
    val hoy = remember { LocalDate.now() }

    val descripcion = when (state.filtro) {
        FiltroFecha.HOY    -> "Mostrando: hoy, ${hoy.format(fmt)}"
        FiltroFecha.SEMANA -> "Mostrando: ${hoy.minusDays(6).format(fmt)} al ${hoy.format(fmt)}"
        FiltroFecha.MES    -> "Mostrando: ${hoy.withDayOfMonth(1).format(fmt)} al ${hoy.format(fmt)}"
        FiltroFecha.PERSONALIZADO -> if (state.desdePersonalizado != null && state.hastaPersonalizado != null)
            "Mostrando: ${state.desdePersonalizado.format(fmt)} al ${state.hastaPersonalizado.format(fmt)}"
        else "Selecciona un rango personalizado"
    }

    Text(
        text = descripcion,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

// ── Tarjetas de estadísticas ──────────────────────────────────────────

@Composable
private fun TarjetasResumen(resumen: ResumenAdmin?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TarjetaStat(
            valor = resumen?.totalEncuestas?.toString() ?: "—",
            etiqueta = "Encuestas",
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.weight(1f)
        )
        TarjetaStat(
            valor = resumen?.npsPromedio?.let { "%.1f".format(it) } ?: "—",
            etiqueta = "NPS prom.",
            color = npsColor(resumen?.npsPromedio),
            modifier = Modifier.weight(1f)
        )
        TarjetaStat(
            valor = resumen?.satisfaccionPromedio?.let { "%.1f".format(it) } ?: "—",
            etiqueta = "Satisf. /5",
            color = satisfColor(resumen?.satisfaccionPromedio),
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun TarjetaStat(
    valor: String,
    etiqueta: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = valor,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = color,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = etiqueta,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

// ── Orientadores activos ──────────────────────────────────────────────

@Composable
private fun OrientadoresCard(
    orientadores: List<OrientadorActivo>,
    cargando: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(
                            if (orientadores.isNotEmpty()) Color(0xFF4CAF50) else Color(0xFF9E9E9E),
                            CircleShape
                        )
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "Orientadores activos (${orientadores.size})",
                    style = MaterialTheme.typography.titleSmall
                )
            }

            Spacer(Modifier.height(8.dp))

            when {
                cargando -> LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                orientadores.isEmpty() -> Text(
                    "Ningún orientador activo en los últimos 30 minutos",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                else -> orientadores.forEach { o ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(o.nombre, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "hace ${o.minutosInactivo.toInt()} min",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

// ── Tarjeta de error ──────────────────────────────────────────────────

@Composable
private fun ErrorCard(mensaje: String, onReintentar: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "⚠️ $mensaje",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "El dashboard se poblará cuando Sistemas active los endpoints del servidor.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.7f),
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onReintentar) { Text("Reintentar") }
        }
    }
}

// ── Helpers de color ──────────────────────────────────────────────────

private fun npsColor(nps: Double?): Color = when {
    nps == null -> Color(0xFF9E9E9E)
    nps >= 9.0  -> Color(0xFF4CAF50)
    nps >= 7.0  -> Color(0xFFFF9800)
    else        -> Color(0xFFF44336)
}

private fun satisfColor(sat: Double?): Color = when {
    sat == null -> Color(0xFF9E9E9E)
    sat >= 4.0  -> Color(0xFF4CAF50)
    sat >= 3.0  -> Color(0xFFFF9800)
    else        -> Color(0xFFF44336)
}
