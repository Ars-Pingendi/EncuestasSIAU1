package com.example.encuestassiau.ui

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.viewmodel.SurveyFlowViewModel
import com.example.encuestassiau.viewmodel.SurveyFlowViewModelFactory
import kotlinx.coroutines.launch

@Composable
fun AppNavigation(repository: Repository, onLogout: () -> Unit) {

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val viewModel: SurveyFlowViewModel = viewModel(
        factory = SurveyFlowViewModelFactory(repository)
    )
    val state by viewModel.state.collectAsState()

    when (state.screen) {

        "start" -> StartScreen(
            onSelectTipo = { tipo -> viewModel.seleccionarTipo(tipo) },
            onSync = {
                scope.launch { repository.sincronizarPendientes(context) }
            },
            repository = repository,
            onLogout = onLogout,
            onExportCsv = {
                scope.launch {
                    val archivo = repository.exportarRespuestasCsv(context)
                    Log.i("CSV", "Archivo generado en: ${archivo.path}")
                }
            }
        )

        "servicio" -> ServiceScreen(
            tipoEncuesta = state.tipoEncuesta,
            onServiceSelected = { viewModel.seleccionarServicio(it) },
            onBack = { viewModel.retrocederAInicio() }
        )

        "edadSexo" -> EdadSexoScreen(
            edadInicial = state.edad,
            sexoInicial = state.sexo,
            personaInicial = state.personaQueResponde,
            onBack = { viewModel.retrocederAServicio() },
            onNext = { e, s, persona -> viewModel.guardarEdadSexo(e, s, persona) }
        )

        "preguntas" -> when {
            state.preguntasCargando -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { CircularProgressIndicator() }

            state.preguntasError != null -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { Text("⚠️ ${state.preguntasError}") }

            else -> QuestionScreen(
                preguntas = state.preguntas,
                tipoEncuesta = state.tipoEncuesta,
                servicio = state.servicio,
                edad = state.edad,
                sexo = state.sexo,
                personaQueResponde = state.personaQueResponde,
                repository = repository,
                onFinish = { viewModel.finalizarEncuesta() },
                onCancel = { viewModel.volverAInicio() },
                onBack = { viewModel.retrocederAEdadSexo() }
            )
        }

        "gracias" -> GraciasScreen {
            viewModel.volverAInicio()
        }
    }
}