package com.example.encuestassiau.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.BuildConfig
import com.example.encuestassiau.R
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.util.AppPreferences
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
private fun rememberIsConnected(): Boolean {
    val context = LocalContext.current
    val cm = remember {
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }

    fun connected(): Boolean {
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    var isConnected by remember { mutableStateOf(connected()) }

    DisposableEffect(Unit) {
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { isConnected = true }
            override fun onLost(network: Network) { isConnected = false }
        }
        cm.registerDefaultNetworkCallback(cb)
        onDispose { cm.unregisterNetworkCallback(cb) }
    }
    return isConnected
}

@Composable
private fun SyncStatusRow(isConnected: Boolean, pendientes: Int) {
    val dotColor = when {
        !isConnected -> MaterialTheme.colorScheme.error
        pendientes > 0 -> Color(0xFFFF9800)
        else -> Color(0xFF4CAF50)
    }
    val label = if (isConnected)
        stringResource(R.string.admin_red_conectado)
    else
        stringResource(R.string.admin_red_sin_conexion)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(bottom = 8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(9.dp)
                .background(dotColor, CircleShape)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = if (pendientes > 0 && isConnected)
                "$label · ${stringResource(R.string.admin_pendientes, pendientes)}"
            else if (pendientes > 0)
                "${stringResource(R.string.admin_red_sin_conexion)} · ${stringResource(R.string.admin_pendientes, pendientes)}"
            else
                label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun AdminDialog(
    isConnected: Boolean,
    pendientes: Int,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val version = remember {
        val suffix = if (BuildConfig.DEBUG) " (debug)" else ""
        "${BuildConfig.VERSION_NAME}$suffix"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.admin_titulo)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Estado de red
                val dotColor = if (isConnected) Color(0xFF4CAF50) else MaterialTheme.colorScheme.error
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).background(dotColor, CircleShape))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (isConnected)
                            stringResource(R.string.admin_red_conectado)
                        else
                            stringResource(R.string.admin_red_sin_conexion),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                Text(
                    stringResource(R.string.admin_pendientes, pendientes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (pendientes > 0) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.onSurface
                )

                HorizontalDivider()

                // Toggle texto grande
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        stringResource(R.string.admin_texto_grande),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Switch(
                        checked = AppPreferences.textoGrande,
                        onCheckedChange = { AppPreferences.alternarTextoGrande(context) }
                    )
                }

                HorizontalDivider()

                Text(
                    stringResource(R.string.admin_version, version),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text(stringResource(R.string.admin_cerrar))
            }
        }
    )
}

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

    // Contador de taps para panel oculto
    var adminTaps by remember { mutableIntStateOf(0) }
    var mostrarAdmin by remember { mutableStateOf(false) }

    val isConnected = rememberIsConnected()

    LaunchedEffect(Unit) {
        nombreUsuario = repository.obtenerNombreDesdeToken(context) ?: ""
    }

    LaunchedEffect(Unit) {
        cargando = true
        pendientes = withContext(kotlinx.coroutines.Dispatchers.IO) { repository.contarPendientes() }
        cargando = false
    }

    // Resetea el contador de taps si no llegan a 5 en 3 segundos
    LaunchedEffect(adminTaps) {
        if (adminTaps in 1..4) {
            delay(3000)
            adminTaps = 0
        }
    }

    if (mostrarAdmin) {
        AdminDialog(
            isConnected = isConnected,
            pendientes = pendientes,
            onDismiss = { mostrarAdmin = false }
        )
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Header: logo + nombre + título
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Image(
                    painter = painterResource(R.drawable.escudo),
                    contentDescription = null,
                    modifier = Modifier
                        .height(80.dp)
                        .clickable {
                            adminTaps++
                            if (adminTaps >= 5) {
                                mostrarAdmin = true
                                adminTaps = 0
                            }
                        },
                    contentScale = ContentScale.Fit
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.nombre_hospital),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.secondary,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = stringResource(R.string.start_titulo),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center
                )
                if (nombreUsuario.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.start_usuario, nombreUsuario),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Botones principales
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth(0.8f)
            ) {
                ElevatedButton(
                    onClick = { onSelectTipo("ambulatoria") },
                    modifier = Modifier.fillMaxWidth().height(72.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.elevatedButtonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    ),
                    elevation = ButtonDefaults.elevatedButtonElevation(defaultElevation = 4.dp)
                ) {
                    Text(stringResource(R.string.start_btn_ambulatoria), style = MaterialTheme.typography.titleMedium)
                }

                Spacer(modifier = Modifier.height(16.dp))

                ElevatedButton(
                    onClick = { onSelectTipo("internacion") },
                    modifier = Modifier.fillMaxWidth().height(72.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.elevatedButtonColors(
                        containerColor = MaterialTheme.colorScheme.secondary,
                        contentColor = MaterialTheme.colorScheme.onSecondary
                    ),
                    elevation = ButtonDefaults.elevatedButtonElevation(defaultElevation = 4.dp)
                ) {
                    Text(stringResource(R.string.start_btn_internacion), style = MaterialTheme.typography.titleMedium)
                }

                if (!cargando && pendientes > 0) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = stringResource(R.string.start_pendientes, pendientes),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(12.dp),
                            textAlign = TextAlign.Center
        )
                    }
                }
            }

            // Controles de administrador + indicador de sync
            Column(modifier = Modifier.fillMaxWidth()) {
                SyncStatusRow(isConnected = isConnected, pendientes = pendientes)
                HorizontalDivider()
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { scope.launch { onSync() } },
                        modifier = Modifier.weight(1f)
                    ) { Text(stringResource(R.string.start_btn_sincronizar)) }

                    OutlinedButton(
                        onClick = { scope.launch { onExportCsv() } },
                        modifier = Modifier.weight(1f)
                    ) { Text(stringResource(R.string.start_btn_exportar)) }
                }
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(
                    onClick = onLogout,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) { Text(stringResource(R.string.start_btn_cerrar_sesion)) }
            }
        }
        IconButton(
            onClick = { mostrarAdmin = true },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(8.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.Settings,
                contentDescription = stringResource(R.string.admin_titulo),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        }
    }
}
