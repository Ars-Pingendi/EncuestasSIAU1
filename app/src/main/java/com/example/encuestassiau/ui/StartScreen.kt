package com.example.encuestassiau.ui

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.R
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

    LaunchedEffect(Unit) {
        nombreUsuario = repository.obtenerNombreDesdeToken(context) ?: ""
    }

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

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {

            if (nombreUsuario.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.start_usuario, nombreUsuario),
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            Text(
                text = stringResource(R.string.start_titulo),
                style = MaterialTheme.typography.headlineMedium
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onSelectTipo("ambulatoria") }
            ) { Text(stringResource(R.string.start_btn_ambulatoria)) }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onSelectTipo("internacion") }
            ) { Text(stringResource(R.string.start_btn_internacion)) }

            Spacer(modifier = Modifier.height(24.dp))

            if (!cargando && pendientes > 0) {
                Text(
                    text = "🕓 ${stringResource(R.string.start_pendientes, pendientes)}",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        Column {
            HorizontalDivider()
            Spacer(modifier = Modifier.height(12.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { scope.launch { onSync() } }
            ) { Text(stringResource(R.string.start_btn_sincronizar)) }

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { scope.launch { onExportCsv() } }
            ) { Text(stringResource(R.string.start_btn_exportar)) }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) { Text(stringResource(R.string.start_btn_cerrar_sesion)) }
        }
    }
}
