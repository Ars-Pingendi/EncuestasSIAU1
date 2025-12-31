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
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.network.NetworkClient
import kotlinx.coroutines.launch
@Composable
fun ServiceScreen(
    onServiceSelected: (String) -> Unit
) {
    // 🔹 Lista local por defecto (fallback)
    val serviciosLocales = listOf(
        "ANGIOGRAFÍA", "BANCO DE LECHE", "BANCO DE SANGRE",
        "CARDIOLOGÍA", "CENTRO DE INFUSIÓN PEDIÁTRICA", "CITAS MÉDICAS",
        "CONSULTA EXTERNA", "ESTADISTICA", "FACTURACIÓN", "FARMACIA",
        "GINECOLOGÍA", "IMÁGENES DIAGNÓSTICAS", "LABORATORIO", "MADRE CANGURO",
        "MÉDICAS 1", "MÉDICAS 2", "MÉDICAS 3",
        "MÉDICO QUIRÚRGICAS 1", "MÉDICO QUIRÚRGICAS 2", "MÉDICO QUIRÚRGICAS 3",
        "MÉDICO QUIRÚRGICAS 4", "NEONATOS", "ONCOLOGÍA", "PATOLOGÍA",
        "PEDIATRÍA", "PROGRAMACIÓN DE CIRUGÍA", "QUEMADOS", "QUIRÓFANO",
        "QUIRÚRGICAS 1", "QUIRÚRGICAS 2", "REFERENCIA Y CONTRA REFERENCIA",
        "REHABILITACIÓN", "SALA GINECOLÓGICA", "TRAUMATOLOGÍA",
        "UCI 4TO PISO", "UCI I", "UCI II", "UCI III",
        "UCI PEDIÁTRICO 1ER PISO", "UCI PEDIÁTRICO 4TO PISO",
        "UCINT 3ER PISO", "UCINT 4TO PISO", "UNIDAD SALUD MENTAL",
        "URGENCIAS ADULTOS", "URGENCIAS GINECOLÓGICAS", "URGENCIAS PEDIÁTRICA"
    )

    // 🔹 Estado de servicios (SIEMPRE List<String>)
    var servicios by remember { mutableStateOf(serviciosLocales) }
    var cargando by remember { mutableStateOf(false) }

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
                    "No se encontraron servicios disponibles.",
                    modifier = Modifier.align(Alignment.Center)
                )
            }

            else -> {
                Column(modifier = Modifier.fillMaxSize()) {

                    Text(
                        "Selecciona el servicio",
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
