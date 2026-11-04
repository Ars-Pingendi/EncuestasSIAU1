package com.personal.reproductor.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.personal.reproductor.data.ThemeMode

private val DarkColors = darkColorScheme(
    primary = Color(0xFFBBA9FF),
    onPrimary = Color(0xFF2A1770),
    primaryContainer = Color(0xFF41308C),
    onPrimaryContainer = Color(0xFFE4DDFF),
    secondary = Color(0xFF4DD9C0),
    onSecondary = Color(0xFF00382F),
    tertiary = Color(0xFFFFB2C7),
    background = Color(0xFF12101A),
    onBackground = Color(0xFFE6E1EC),
    surface = Color(0xFF12101A),
    onSurface = Color(0xFFE6E1EC),
    surfaceVariant = Color(0xFF2B2836),
    onSurfaceVariant = Color(0xFFC9C4D4),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF5A46C2),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE4DDFF),
    onPrimaryContainer = Color(0xFF170058),
    secondary = Color(0xFF006B5C),
    tertiary = Color(0xFF9C405F),
    background = Color(0xFFFFFBFF),
    surface = Color(0xFFFFFBFF),
    surfaceVariant = Color(0xFFE6E0F0),
)

@Composable
fun ReproductorTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
    }
    val context = LocalContext.current
    val colors = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> DarkColors
        else -> LightColors
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }

    MaterialTheme(colorScheme = colors, content = content)
}
