package com.personal.reproductor

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.ui.AppRoot
import com.personal.reproductor.ui.MainViewModel
import com.personal.reproductor.ui.hasAudioPermission
import com.personal.reproductor.ui.theme.ReproductorTheme

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val settings = (application as ReproductorApp).settings
        setContent {
            val mode by settings.themeMode.collectAsStateWithLifecycle()
            ReproductorTheme(mode) {
                AppRoot(viewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // El usuario pudo conceder o revocar el permiso desde los ajustes del sistema.
        viewModel.setPermission(hasAudioPermission(this))
    }
}
