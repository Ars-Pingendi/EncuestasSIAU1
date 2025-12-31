package com.example.encuestassiau.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp



@Composable
fun EdadSexoScreen(
    onNext: (edad: Int, sexo: String, identificacion: String?) -> Unit
) {
    var edad by remember { mutableStateOf("") }
    var sexoSeleccionado by remember { mutableStateOf<String?>(null) }
    var identificacion by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(
                text = "Datos del usuario",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // 👶 Edad
            OutlinedTextField(
                value = edad,
                onValueChange = { if (it.all(Char::isDigit)) edad = it },
                label = { Text("Edad") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            // 🚻 Selección de sexo
            Text("Sexo", style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                listOf("Masculino", "Femenino", "Otro").forEach { sexo ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = (sexoSeleccionado == sexo),
                            onClick = { sexoSeleccionado = sexo }
                        )
                        Text(text = sexo)
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 🪪 Identificación (opcional)
            OutlinedTextField(
                value = identificacion,
                onValueChange = { identificacion = it },
                label = { Text("Identificación (opcional)") },
                modifier = Modifier.fillMaxWidth()
            )
        }

        // Botón continuar
        Button(
            onClick = {
                if (edad.isNotEmpty() && sexoSeleccionado != null) {
                    onNext(edad.toInt(), sexoSeleccionado!!, identificacion.ifBlank { null })
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            enabled = edad.isNotEmpty() && sexoSeleccionado != null
        ) {
            Text("Continuar")
        }
    }
}
