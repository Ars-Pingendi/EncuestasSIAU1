package com.example.encuestassiau.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.encuestassiau.R
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.data.Respuesta
import com.example.encuestassiau.model.Question
import com.example.encuestassiau.util.TIPIFICACION_OTRO
import com.example.encuestassiau.util.extractOtroText
import com.example.encuestassiau.util.tipificacionFromString
import com.example.encuestassiau.util.tipificacionPorPregunta
import com.example.encuestassiau.util.tipificacionToString
import com.example.encuestassiau.viewmodel.RespuestasViewModel
import com.example.encuestassiau.viewmodel.RespuestasViewModelFactory
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.roundToInt

private val CARITAS = mapOf(
    "Muy malo"  to "😡",
    "Malo"      to "😞",
    "Regular"   to "😐",
    "Bueno"     to "🙂",
    "Muy bueno" to "😄"
)

@Composable
fun QuestionScreen(
    preguntas: List<Question>,
    tipoEncuesta: String,
    servicio: String,
    edad: Int,
    sexo: String,
    personaQueResponde: String,
    repository: Repository,
    onFinish: () -> Unit,
    onCancel: () -> Unit
) {
    // Bloquea el botón Atrás del sistema durante la encuesta
    BackHandler(enabled = true) { }

    var currentIndex by remember { mutableIntStateOf(0) }
    var respuestaSeleccionada by remember { mutableStateOf<String?>(null) }
    var textoLibre by remember { mutableStateOf("") }
    var tipificacionSeleccionada by remember { mutableStateOf<Set<String>>(emptySet()) }
    var textoOtroTipificacion by remember { mutableStateOf("") }
    // NPS: posición visual del slider (arranca al centro) e indicador de interacción real
    var npsPos by remember { mutableFloatStateOf(5f) }
    var npsInteractuado by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val viewModel: RespuestasViewModel = viewModel(
        factory = RespuestasViewModelFactory(repository)
    )

    LaunchedEffect(currentIndex) {
        val pregunta = preguntas[currentIndex]
        val guardada = viewModel.cargarRespuesta(pregunta.id)
        if (guardada != null) {
            if (pregunta.tipo == "texto_libre") {
                textoLibre = guardada.respuesta
            } else {
                respuestaSeleccionada = guardada.respuesta
                if (pregunta.tipo == "nps") {
                    npsPos = guardada.respuesta.toFloatOrNull() ?: 5f
                    npsInteractuado = true
                }
            }
            tipificacionSeleccionada = tipificacionFromString(guardada.tipificacion)
            textoOtroTipificacion = extractOtroText(guardada.tipificacion)
        } else {
            respuestaSeleccionada = null
            textoLibre = ""
            tipificacionSeleccionada = emptySet()
            textoOtroTipificacion = ""
            npsPos = 5f
            npsInteractuado = false
        }
    }

    val fechaActual = remember {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.getDefault()).format(Date())
    }

    val preguntaActual = preguntas[currentIndex]
    val mostrarSeccion = currentIndex == 0 ||
        preguntas[currentIndex].seccion != preguntas[currentIndex - 1].seccion

    val tipConfig = tipificacionPorPregunta[preguntaActual.id]
    val mostrarTipificacion = tipConfig != null && respuestaSeleccionada in tipConfig.activadoPor

    val puedeAvanzar = when (preguntaActual.tipo) {
        "texto_libre" -> true
        "nps" -> npsInteractuado
        else -> respuestaSeleccionada != null
    }

    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
        ) {
            if (mostrarSeccion && preguntaActual.seccion.isNotEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Text(
                        text = preguntaActual.seccion,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            Text(
                stringResource(R.string.pregunta_contador, currentIndex + 1, preguntas.size),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.outline
            )
            Spacer(Modifier.height(8.dp))
            Text(preguntaActual.texto, style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(20.dp))

            when (preguntaActual.tipo) {

                // Caritas para preguntas de escala 1-5
                "escala" -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        preguntaActual.opciones.forEach { opcion ->
                            val sel = respuestaSeleccionada == opcion
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier
                                    .clickable { respuestaSeleccionada = opcion }
                                    .padding(4.dp)
                            ) {
                                Card(
                                    modifier = Modifier.size(72.dp),
                                    shape = CircleShape,
                                    colors = CardDefaults.cardColors(
                                        containerColor = if (sel)
                                            MaterialTheme.colorScheme.primaryContainer
                                        else
                                            MaterialTheme.colorScheme.surfaceVariant
                                    ),
                                    border = if (sel) BorderStroke(
                                        2.dp, MaterialTheme.colorScheme.primary
                                    ) else null
                                ) {
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier.fillMaxSize()
                                    ) {
                                        Text(
                                            text = CARITAS[opcion] ?: opcion,
                                            fontSize = 34.sp
                                        )
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = opcion,
                                    style = MaterialTheme.typography.labelSmall,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }
                }

                // Botones grandes Sí / No
                "sino" -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        preguntaActual.opciones.forEach { opcion ->
                            val sel = respuestaSeleccionada == opcion
                            OutlinedButton(
                                onClick = { respuestaSeleccionada = opcion },
                                modifier = Modifier.size(width = 140.dp, height = 80.dp),
                                border = BorderStroke(2.dp, MaterialTheme.colorScheme.primary),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    containerColor = if (sel)
                                        MaterialTheme.colorScheme.primary
                                    else Color.Transparent,
                                    contentColor = if (sel)
                                        MaterialTheme.colorScheme.onPrimary
                                    else MaterialTheme.colorScheme.primary
                                )
                            ) {
                                Text(opcion, style = MaterialTheme.typography.titleLarge)
                            }
                        }
                    }
                }

                // Deslizador numérico NPS 0-10
                "nps" -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "0 = Nunca recomendaría",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                        Text(
                            "10 = Seguro recomendaría",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                    Slider(
                        value = npsPos,
                        onValueChange = {
                            npsPos = it
                            npsInteractuado = true
                            respuestaSeleccionada = it.roundToInt().toString()
                        },
                        valueRange = 0f..10f,
                        steps = 9,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (npsInteractuado) {
                            Text(
                                text = npsPos.roundToInt().toString(),
                                style = MaterialTheme.typography.displaySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        } else {
                            Text(
                                text = "Desliza para calificar",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.outline
                            )
                        }
                    }
                }

                // Campo de texto libre (Q13)
                "texto_libre" -> {
                    OutlinedTextField(
                        value = textoLibre,
                        onValueChange = { textoLibre = it },
                        label = { Text(stringResource(R.string.pregunta_campo_comentario)) },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 4
                    )
                }
            }

            // Menú de tipificación condicional
            if (mostrarTipificacion && tipConfig != null) {
                Spacer(Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(Modifier.height(12.dp))
                Text(
                    stringResource(R.string.tipificacion_titulo),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.error
                )
                Spacer(Modifier.height(8.dp))
                tipConfig.opciones.forEach { motivo ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp)
                            .clickable {
                                tipificacionSeleccionada =
                                    if (motivo in tipificacionSeleccionada)
                                        tipificacionSeleccionada - motivo
                                    else
                                        tipificacionSeleccionada + motivo
                            },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = motivo in tipificacionSeleccionada,
                            onCheckedChange = { checked ->
                                tipificacionSeleccionada =
                                    if (checked) tipificacionSeleccionada + motivo
                                    else tipificacionSeleccionada - motivo
                            }
                        )
                        Text(
                            text = motivo,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(start = 4.dp)
                        )
                    }
                }
                // Campo de texto que aparece debajo de los checkboxes cuando "Otro" está seleccionado
                if (TIPIFICACION_OTRO in tipificacionSeleccionada) {
                    Spacer(Modifier.height(4.dp))
                    OutlinedTextField(
                        value = textoOtroTipificacion,
                        onValueChange = { textoOtroTipificacion = it },
                        label = { Text("Describa el motivo") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 40.dp),
                        minLines = 2
                    )
                }
            }
        }

        // Botones fijos al fondo
        Column {
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Button(
                    onClick = { if (currentIndex > 0) currentIndex-- },
                    enabled = currentIndex > 0
                ) { Text(stringResource(R.string.pregunta_btn_atras)) }

                Button(
                    onClick = {
                        viewModel.cancelarEncuesta()
                        onCancel()
                    }
                ) { Text(stringResource(R.string.pregunta_btn_cancelar)) }
            }

            Spacer(Modifier.height(8.dp))

            Button(
                onClick = {
                    val respuestaTexto = when (preguntaActual.tipo) {
                        "texto_libre" -> textoLibre
                        else -> respuestaSeleccionada ?: return@Button
                    }

                    viewModel.guardarRespuesta(
                        context,
                        Respuesta(
                            encuestaTipo = tipoEncuesta,
                            preguntaId = preguntaActual.id,
                            respuesta = respuestaTexto,
                            servicio = servicio,
                            edad = edad,
                            sexo = sexo,
                            identificacion = null,
                            comentario = null,
                            fecha = fechaActual,
                            usuarioId = "",
                            usuarioNombre = "",
                            personaQueResponde = personaQueResponde,
                            tipificacion = if (mostrarTipificacion) {
                                val items = tipificacionSeleccionada.map { item ->
                                    if (item == TIPIFICACION_OTRO && textoOtroTipificacion.isNotBlank())
                                        "$TIPIFICACION_OTRO: $textoOtroTipificacion"
                                    else item
                                }.toSet()
                                tipificacionToString(items)
                            } else null,
                            sincronizado = false
                        )
                    )

                    if (currentIndex < preguntas.lastIndex) currentIndex++
                    else onFinish()
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = puedeAvanzar
            ) {
                Text(
                    if (currentIndex == preguntas.lastIndex)
                        stringResource(R.string.pregunta_btn_finalizar)
                    else
                        stringResource(R.string.pregunta_btn_siguiente)
                )
            }
        }
    }
}
