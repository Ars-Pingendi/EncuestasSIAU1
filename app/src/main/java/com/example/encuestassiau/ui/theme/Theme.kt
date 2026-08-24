package com.example.encuestassiau.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val HusjColorScheme = lightColorScheme(
    primary = Azul50,
    onPrimary = Color.White,
    primaryContainer = Azul10,
    onPrimaryContainer = Azul90,
    secondary = Azul70,
    onSecondary = Color.White,
    secondaryContainer = Azul10,
    onSecondaryContainer = Azul90,
    tertiary = Dorado60,
    onTertiary = Color.White,
    tertiaryContainer = Dorado10,
    onTertiaryContainer = NavyTexto,
    background = AzulSurface,
    onBackground = NavyTexto,
    surface = Color.White,
    onSurface = NavyTexto,
    surfaceVariant = Azul10,
    onSurfaceVariant = NavyMedio,
    error = Rojo,
    errorContainer = RojoClaro,
    onError = Color.White,
    outline = NavyClaro
)

@Composable
fun EncuestasSIAUTheme(
    largeText: Boolean = false,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = HusjColorScheme,
        typography = if (largeText) LargeTypography else Typography,
        content = content
    )
}
