package com.example.encuestassiau.ui

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.example.encuestassiau.MainActivity
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.data.SessionManager
import com.example.encuestassiau.model.Question
import com.example.encuestassiau.util.IdleTimeoutManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AppNavigation(repository: Repository) {

    val context = LocalContext.current
    val scope = rememberCoroutineScope() // Coroutine scope para llamadas suspend

    var currentScreen by remember { mutableStateOf("start") }
    var tipoEncuesta by remember { mutableStateOf<String?>(null) }
    var servicioSeleccionado by remember { mutableStateOf<String?>(null) }
    var edad by remember { mutableIntStateOf(0) }
    var sexo by remember { mutableStateOf("") }
    var identificacion by remember { mutableStateOf<String?>(null) }

    when (currentScreen) {

        "start" -> StartScreen(
            onSelectTipo = { tipo ->
                tipoEncuesta = tipo
                currentScreen = "servicio"
            },
            onSync = {
                // Lanza coroutine para sincronizar respuestas pendientes
                scope.launch {
                    repository.sincronizarPendientes(context)
                }
            },
            repository = repository,
            onLogout = {
                SessionManager.clearSession(context)
                IdleTimeoutManager.stop()
                (context as MainActivity).recreate()
            },
            onExportCsv = {
                // Lanza coroutine para exportar CSV
                scope.launch {
                    val archivo = repository.exportarRespuestasCsv(context)
                    Log.i("CSV", "Archivo generado en: ${archivo.path}")
                    // Opcional: mostrar Toast o Snackbar
                }
            }
        )

        "servicio" -> ServiceScreen {
            servicioSeleccionado = it
            currentScreen = "edadSexo"
        }

        "edadSexo" -> EdadSexoScreen { e, s, id ->
            edad = e
            sexo = s
            identificacion = id
            currentScreen = "preguntas"
        }

        "preguntas" -> {

            var preguntas by remember { mutableStateOf<List<Question>>(emptyList()) }
            var cargando by remember { mutableStateOf(true) }
            var errorMensaje by remember { mutableStateOf<String?>(null) }

            LaunchedEffect(tipoEncuesta) {
                cargando = true
                try {
                    preguntas = withContext(Dispatchers.IO) {
                        repository.obtenerPreguntasLocales(tipoEncuesta ?: "ambulatoria")
                    }
                    if (preguntas.isEmpty()) {
                        errorMensaje = "No se encontraron preguntas."
                    }
                } catch (e: Exception) {
                    Log.e("NAV", "Error cargando preguntas", e)
                    errorMensaje = "Error al cargar preguntas"
                } finally {
                    cargando = false
                }
            }

            when {
                cargando -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }

                errorMensaje != null -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { Text("⚠️ $errorMensaje") }

                else -> QuestionScreen(
                    preguntas = preguntas,
                    servicio = servicioSeleccionado ?: "",
                    edad = edad,
                    sexo = sexo,
                    identificacion = identificacion,
                    repository = repository,
                    onFinish = { currentScreen = "gracias" },
                    onCancel = { currentScreen = "start" }
                )
            }
        }

        "gracias" -> GraciasScreen {
            currentScreen = "start"
        }
    }
}
