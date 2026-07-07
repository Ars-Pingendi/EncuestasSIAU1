package com.example.encuestassiau.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.R

@Composable
fun ServiceScreen(
    tipoEncuesta: String,
    onServiceSelected: (String) -> Unit
) {
    val context = LocalContext.current

    var servicios by remember { mutableStateOf<List<String>>(emptyList()) }
    var cargando by remember { mutableStateOf(true) }

    LaunchedEffect(tipoEncuesta) {
        val json = context.assets.open("servicios.json").bufferedReader().use { it.readText() }
        val array = org.json.JSONArray(json)
        servicios = (0 until array.length())
            .map { array.getJSONObject(it) }
            .filter { it.getString("tipo") == tipoEncuesta }
            .map { it.getString("nombre") }
        cargando = false
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .background(Color.White)
    ) {
        when {
            cargando -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }

            servicios.isEmpty() -> {
                Text(
                    stringResource(R.string.servicio_vacio),
                    modifier = Modifier.align(Alignment.Center)
                )
            }

            else -> {
                Column(modifier = Modifier.fillMaxSize()) {

                    Text(
                        stringResource(R.string.servicio_titulo),
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .padding(bottom = 16.dp)
                    )

                    LazyColumn {
                        items(servicios) { serv ->
                            Text(
                                text = serv,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onServiceSelected(serv) }
                                    .padding(12.dp)
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}