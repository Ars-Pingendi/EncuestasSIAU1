package com.example.encuestassiau.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.R

@Composable
fun EdadSexoScreen(
    onNext: (edad: Int, sexo: String, personaQueResponde: String) -> Unit
) {
    var edad by remember { mutableStateOf("") }
    var sexoSeleccionado by remember { mutableStateOf<String?>(null) }
    var personaQueResponde by remember { mutableStateOf<String?>(null) }

    val edadInt = edad.toIntOrNull()
    val edadValida = edadInt != null && edadInt in 1..120

    val opcionesSexo = listOf(
        stringResource(R.string.edad_sexo_masculino),
        stringResource(R.string.edad_sexo_femenino),
        stringResource(R.string.edad_sexo_otro)
    )
    val opcionesPersona = listOf(
        stringResource(R.string.persona_responde_paciente),
        stringResource(R.string.persona_responde_cuidador)
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {

            Text(
                text = stringResource(R.string.edad_sexo_titulo),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            OutlinedTextField(
                value = edad,
                onValueChange = { if (it.all(Char::isDigit)) edad = it },
                label = { Text(stringResource(R.string.edad_sexo_campo_edad)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = edad.isNotEmpty() && !edadValida,
                supportingText = if (edad.isNotEmpty() && !edadValida) {
                    { Text(stringResource(R.string.edad_sexo_error_edad)) }
                } else null,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                stringResource(R.string.edad_sexo_campo_sexo),
                style = MaterialTheme.typography.titleMedium
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                opcionesSexo.forEach { sexo ->
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

            Text(
                stringResource(R.string.persona_responde_titulo),
                style = MaterialTheme.typography.titleMedium
            )
            opcionesPersona.forEach { opcion ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp)
                ) {
                    RadioButton(
                        selected = (personaQueResponde == opcion),
                        onClick = { personaQueResponde = opcion }
                    )
                    Text(text = opcion)
                }
            }
        }

        Button(
            onClick = { onNext(edadInt!!, sexoSeleccionado!!, personaQueResponde!!) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
            enabled = edadValida && sexoSeleccionado != null && personaQueResponde != null
        ) {
            Text(stringResource(R.string.edad_sexo_btn_continuar))
        }
    }
}
