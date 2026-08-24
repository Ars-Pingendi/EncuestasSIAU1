package com.example.encuestassiau

import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import com.example.encuestassiau.BuildConfig
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.example.encuestassiau.data.AppDatabase
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.data.SessionManager
import com.example.encuestassiau.ui.AppNavigation
import com.example.encuestassiau.ui.LoginScreen
import com.example.encuestassiau.util.IdleTimeoutManager
import com.example.encuestassiau.util.NetworkObserver
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    // Estado elevado al nivel de Activity para evitar recreate() en Lock Task Mode
    private var autenticado by mutableStateOf(false)

    private lateinit var networkObserver: NetworkObserver

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Pantalla siempre encendida (tablet de kiosco)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        aplicarModoInmersivo()

        // Modo kiosco: solo en builds de producción.
        // En DEBUG, el lock task bloquea la reinstalación desde Android Studio.
        if (!BuildConfig.DEBUG) {
            try {
                startLockTask()
            } catch (e: SecurityException) {
                Log.w("KIOSK", "Lock task no disponible en este dispositivo: ${e.message}")
            }
        }

        val database = AppDatabase.getDatabase(this)
        val repository = Repository(
            database.respuestaDao(),
            database.preguntaDao()
        )

        networkObserver = NetworkObserver(this) {
            Log.i("SYNC", "Red disponible — sincronizando pendientes")
            lifecycleScope.launch {
                repository.sincronizarPendientes(this@MainActivity.applicationContext)
            }
        }
        networkObserver.register()

        SessionManager.restoreSession(this)
        if (repository.isTokenExpired(this)) {
            SessionManager.clearSession(this)
        }
        autenticado = SessionManager.isLoggedIn(this)

        setContent {
            MaterialTheme {
                Surface {

                    LaunchedEffect(autenticado) {
                        if (autenticado) {
                            IdleTimeoutManager.start { cerrarSesion() }
                        } else {
                            IdleTimeoutManager.stop()
                        }
                    }

                    if (autenticado) {
                        AppNavigation(
                            repository = repository,
                            onLogout = { cerrarSesion() }
                        )
                    } else {
                        LoginScreen(repository) {
                            autenticado = true
                        }
                    }
                }
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Re-aplica modo inmersivo si el sistema lo interrumpió (p.ej. una notificación)
        if (hasFocus) aplicarModoInmersivo()
    }

    private fun aplicarModoInmersivo() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun cerrarSesion() {
        SessionManager.clearSession(this)
        autenticado = false
    }

    override fun onDestroy() {
        super.onDestroy()
        networkObserver.unregister()
    }
}