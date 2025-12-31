package com.example.encuestassiau.ui

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.data.Repository
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun StartScreen(
    onSelectTipo: (String) -> Unit,
    onSync: () -> Unit,
    repository: Repository,
    onLogout: () -> Unit,
    onExportCsv: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var nombreUsuario by remember { mutableStateOf("") }
    var pendientes by remember { mutableIntStateOf(0) }
    var cargando by remember { mutableStateOf(true) }

    // 🔹 Cargar nombre de usuario desde JWT

    LaunchedEffect(Unit) {
        nombreUsuario = repository.obtenerNombreDesdeToken(context) ?: ""
    }

    // 🔹 Contador de pendientes
    LaunchedEffect(Unit) {
        cargando = true
        pendientes = withContext(kotlinx.coroutines.Dispatchers.IO) { repository.contarPendientes() }
        cargando = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {

        /* =========================
           ENCABEZADO Y CONTENIDO PRINCIPAL
           ========================= */
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {

            // Nombre del usuario
            if (nombreUsuario.isNotEmpty()) {
                Text(
                    text = "Usuario: $nombreUsuario",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            Text(
                text = "Encuestas SIAU",
                style = MaterialTheme.typography.headlineMedium
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onSelectTipo("ambulatoria") }
            ) { Text("Encuesta Ambulatoria") }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onSelectTipo("internacion") }
            ) { Text("Encuesta Hospitalización") }

            Spacer(modifier = Modifier.height(24.dp))

            // 🕓 Indicador visual de pendientes
            if (!cargando && pendientes > 0) {
                Text(
                    text = "🕓 $pendientes respuestas pendientes de sincronizar",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        /* =========================
           PIE DE PANTALLA
           ========================= */
        Column {
            Divider()
            Spacer(modifier = Modifier.height(12.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { scope.launch { onSync() } }
            ) { Text("Sincronizar manualmente") }

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { scope.launch { onExportCsv() } }
            ) { Text("Exportar CSV") }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) { Text("Cerrar sesión") }
        }
    }
}
