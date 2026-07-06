package com.example.encuestassiau.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.data.Respuesta
import com.example.encuestassiau.model.Question
import com.example.encuestassiau.viewmodel.RespuestasViewModel
import com.example.encuestassiau.viewmodel.RespuestasViewModelFactory
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun QuestionScreen(
    preguntas: List<Question>,
    servicio: String,
    edad: Int,
    sexo: String,
    identificacion: String?,
    informante: String,
    encuestaId: String,
    repository: Repository,
    onFinish: () -> Unit,
    onCancel: () -> Unit
) {
    var currentIndex by remember { mutableIntStateOf(0) }
    var respuestaSeleccionada by remember { mutableStateOf<String?>(null) }
    var comentario by remember { mutableStateOf("") }
    var motivosSeleccionados by remember { mutableStateOf<Set<String>>(emptySet()) }
    var otroTexto by remember { mutableStateOf("") }

    // ✅ Contexto correcto
    val context = LocalContext.current

    val viewModel: RespuestasViewModel = viewModel(
        factory = RespuestasViewModelFactory(repository)
    )

    // 🔄 Cargar respuesta guardada al cambiar de pregunta
    LaunchedEffect(currentIndex) {
        val pregunta = preguntas[currentIndex]
        val guardada = viewModel.cargarRespuesta(pregunta.id)

        if (guardada != null) {
            respuestaSeleccionada = guardada.respuesta
            comentario = guardada.comentario ?: ""
            motivosSeleccionados = guardada.motivos.toSet()
        } else {
            respuestaSeleccionada = null
            comentario = ""
            motivosSeleccionados = emptySet()
        }
        otroTexto = ""
    }

    val fechaActual = SimpleDateFormat(
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        Locale.getDefault()
    ).format(Date())

    val preguntaActual = preguntas[currentIndex]

    // ⚠️ ¿La respuesta seleccionada es de nivel detractor?
    //    Verdadero cuando la pregunta tiene catálogo de motivos y la opción elegida
    //    está en la mitad inferior de la escala (p.ej. Muy malo/Malo/Regular).
    val esDetractor = respuestaSeleccionada != null &&
            preguntaActual.motivos.isNotEmpty() &&
            preguntaActual.opciones.indexOf(respuestaSeleccionada) <= (preguntaActual.opciones.size - 1) / 2

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {

        // 🧠 CONTENIDO DE LA PREGUNTA
        Column {
            Text("Pregunta ${currentIndex + 1} de ${preguntas.size}")

            Spacer(Modifier.height(16.dp))

            Text(
                preguntaActual.texto,
                style = MaterialTheme.typography.titleLarge
            )

            Spacer(Modifier.height(16.dp))

            preguntaActual.opciones.forEach { opcion ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clickable { respuestaSeleccionada = opcion },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    RadioButton(
                        selected = (respuestaSeleccionada == opcion),
                        onClick = { respuestaSeleccionada = opcion }
                    )
                    Text(opcion)
                }
            }

            // ⚠️ Tipificación de motivos (solo si la calificación es detractora)
            if (esDetractor) {
                Spacer(Modifier.height(16.dp))
                Text(
                    "¿Qué ocurrió? (puede marcar varios)",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.error
                )
                preguntaActual.motivos.forEach { motivo ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp)
                            .clickable {
                                motivosSeleccionados =
                                    if (motivo in motivosSeleccionados)
                                        motivosSeleccionados - motivo
                                    else
                                        motivosSeleccionados + motivo
                            },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = motivo in motivosSeleccionados,
                            onCheckedChange = { marcado ->
                                motivosSeleccionados =
                                    if (marcado) motivosSeleccionados + motivo
                                    else motivosSeleccionados - motivo
                            }
                        )
                        Text(motivo)
                    }
                }

                if ("Otro (especifique)" in motivosSeleccionados) {
                    OutlinedTextField(
                        value = otroTexto,
                        onValueChange = { otroTexto = it },
                        label = { Text("Especifique el motivo") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            if (preguntaActual.requiereComentario) {
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = comentario,
                    onValueChange = { comentario = it },
                    label = { Text("Comentario") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // 🔵 BOTONES
        Column {

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Button(
                    onClick = { if (currentIndex > 0) currentIndex-- },
                    enabled = currentIndex > 0
                ) {
                    Text("Atrás")
                }

                Button(
                    onClick = {
                        viewModel.cancelarEncuesta()
                        onCancel()
                    }
                ) {
                    Text("Cancelar")
                }
            }

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    respuestaSeleccionada?.let { respuestaTexto ->

                        // Motivos solo si la calificación es detractora
                        val motivosFinal = if (esDetractor) motivosSeleccionados.toList() else emptyList()
                        val incluyeOtro = esDetractor &&
                                "Otro (especifique)" in motivosSeleccionados && otroTexto.isNotBlank()

                        val comentarioFinal = when {
                            preguntaActual.requiereComentario && comentario.isNotBlank() -> comentario
                            incluyeOtro -> otroTexto
                            else -> null
                        }

                        val nueva = Respuesta(
                            encuestaId = encuestaId,
                            encuestaTipo = preguntaActual.tipoEncuesta,
                            preguntaId = preguntaActual.id,
                            respuesta = respuestaTexto,
                            servicio = servicio,
                            edad = edad,
                            sexo = sexo,
                            informante = informante,
                            identificacion = identificacion,
                            comentario = comentarioFinal,
                            motivos = motivosFinal,
                            fecha = fechaActual,

                            // Controlados por Repository / SessionManager
                            usuarioId = "",
                            usuarioNombre = "",

                            sincronizado = false
                        )

                        // ✅ LLAMADA CORRECTA
                        viewModel.guardarRespuesta(context, nueva)
                    }

                    if (currentIndex < preguntas.lastIndex) {
                        currentIndex++
                    } else {
                        onFinish()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = respuestaSeleccionada != null
            ) {
                Text(
                    if (currentIndex == preguntas.lastIndex)
                        "Finalizar"
                    else
                        "Siguiente"
                )
            }
        }
    }
}
