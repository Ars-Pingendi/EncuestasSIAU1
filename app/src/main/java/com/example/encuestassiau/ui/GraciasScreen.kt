package com.example.encuestassiau.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.R

@Composable
fun GraciasScreen(
    onVolverInicio: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        Text(
            text = stringResource(R.string.gracias_titulo),
            style = MaterialTheme.typography.titleLarge
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = stringResource(R.string.gracias_subtitulo),
            style = MaterialTheme.typography.bodyLarge
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = onVolverInicio,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(R.string.gracias_btn_volver))
        }
    }
}

@Composable
@Preview(showBackground = true)
fun PreviewGraciasScreen() {
    GraciasScreen(onVolverInicio = {})
}
