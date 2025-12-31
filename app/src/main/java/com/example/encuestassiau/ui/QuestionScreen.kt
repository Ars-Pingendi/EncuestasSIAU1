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
    repository: Repository,
    onFinish: () -> Unit,
    onCancel: () -> Unit
) {
    var currentIndex by remember { mutableIntStateOf(0) }
    var respuestaSeleccionada by remember { mutableStateOf<String?>(null) }
    var comentario by remember { mutableStateOf("") }

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
        } else {
            respuestaSeleccionada = null
            comentario = ""
        }
    }

    val fechaActual = SimpleDateFormat(
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        Locale.getDefault()
    ).format(Date())

    val preguntaActual = preguntas[currentIndex]

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

                        val nueva = Respuesta(
                            encuestaTipo = preguntaActual.tipoEncuesta,
                            preguntaId = preguntaActual.id,
                            respuesta = respuestaTexto,
                            servicio = servicio,
                            edad = edad,
                            sexo = sexo,
                            identificacion = identificacion,
                            comentario = if (preguntaActual.requiereComentario) comentario else null,
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
