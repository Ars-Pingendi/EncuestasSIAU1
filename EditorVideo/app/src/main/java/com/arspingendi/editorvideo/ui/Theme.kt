package com.arspingendi.editorvideo.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val scheme = darkColorScheme(
    primary = Color(0xFF9C87FF),
    onPrimary = Color(0xFF1B0C5C),
    primaryContainer = Color(0xFF3E2C9E),
    onPrimaryContainer = Color(0xFFE5DEFF),
    secondary = Color(0xFF4FD8C4),
    onSecondary = Color(0xFF00382F),
    secondaryContainer = Color(0xFF1F4F48),
    onSecondaryContainer = Color(0xFFBDF6EA),
    background = Color(0xFF121318),
    onBackground = Color(0xFFE4E1EA),
    surface = Color(0xFF121318),
    onSurface = Color(0xFFE4E1EA),
    surfaceVariant = Color(0xFF2A2B33),
    onSurfaceVariant = Color(0xFFC6C4D0),
    surfaceContainer = Color(0xFF1C1D24),
    surfaceContainerHigh = Color(0xFF25262E),
    outline = Color(0xFF8F8D99),
    error = Color(0xFFFFB4AB),
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
