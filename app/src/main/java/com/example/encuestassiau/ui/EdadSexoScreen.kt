package com.example.encuestassiau.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EdadSexoScreen(
    edadInicial: Int = 0,
    sexoInicial: String = "",
    personaInicial: String = "",
    onBack: () -> Unit,
    onNext: (edad: Int, sexo: String, personaQueResponde: String) -> Unit
) {
    var edad by remember { mutableStateOf(if (edadInicial > 0) edadInicial.toString() else "") }
    var sexoSeleccionado by remember { mutableStateOf(sexoInicial.ifBlank { null }) }
    var personaQueResponde by remember { mutableStateOf(personaInicial.ifBlank { null }) }

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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.edad_sexo_titulo)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                Button(
                    onClick = { onNext(edadInt!!, sexoSeleccionado!!, personaQueResponde!!) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    enabled = edadValida && sexoSeleccionado != null && personaQueResponde != null
                ) {
                    Text(stringResource(R.string.edad_sexo_btn_continuar))
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp, vertical = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            OutlinedTextField(
                value = edad,
                onValueChange = { if (it.all(Char::isDigit)) edad = it },
                label = { Text(stringResource(R.string.edad_sexo_campo_edad)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = edad.isNotEmpty() && !edadValida,
                supportingText = if (edad.isNotEmpty() && !edadValida) {
                    { Text(stringResource(R.string.edad_sexo_error_edad)) }
                } else null,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Column {
                Text(
                    stringResource(R.string.edad_sexo_campo_sexo),
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    opcionesSexo.forEach { sexo ->
                        FilterChip(
                            selected = sexoSeleccionado == sexo,
                            onClick = { sexoSeleccionado = sexo },
                            label = { Text(sexo) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            Column {
                Text(
                    stringResource(R.string.persona_responde_titulo),
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                opcionesPersona.forEach { opcion ->
                    val seleccionado = personaQueResponde == opcion
                    Card(
                        onClick = { personaQueResponde = opcion },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (seleccionado)
                                MaterialTheme.colorScheme.primaryContainer
                            else
                                MaterialTheme.colorScheme.surface
                        ),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = seleccionado,
                                onClick = { personaQueResponde = opcion }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                opcion,
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (seleccionado)
                                    MaterialTheme.colorScheme.onPrimaryContainer
                                else
                                    MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }
        }
    }
}
