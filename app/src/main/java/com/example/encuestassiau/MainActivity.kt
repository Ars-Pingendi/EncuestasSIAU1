package com.example.encuestassiau

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import com.example.encuestassiau.ui.theme.EncuestasSIAUTheme
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.example.encuestassiau.data.AppDatabase
import com.example.encuestassiau.data.Repository
import com.example.encuestassiau.data.SessionManager
import com.example.encuestassiau.ui.AppNavigation
import com.example.encuestassiau.ui.LoginScreen
import com.example.encuestassiau.ui.admin.AdminNavigation
import com.example.encuestassiau.util.AppPreferences
import com.example.encuestassiau.util.IdleTimeoutManager
import com.example.encuestassiau.util.NetworkObserver
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    // Estado elevado al nivel de Activity para evitar recreate() en Lock Task Mode
    private var autenticado by mutableStateOf(false)
    private var esAdmin by mutableStateOf(false)

    private lateinit var networkObserver: NetworkObserver

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Pantalla siempre encendida (tablet de kiosco)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        aplicarModoInmersivo()

        // startLockTask solo si el dispositivo tiene Device Owner configurado.
        // Sin Device Owner dispara el diálogo de "Fijar pantalla" que oculta la app.
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (dpm.isDeviceOwnerApp(packageName)) {
            startLockTask()
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
        esAdmin = SessionManager.isAdmin(this)

        AppPreferences.cargar(this)

        setContent {
            EncuestasSIAUTheme(largeText = AppPreferences.textoGrande) {

                // Bloquea el botón Atrás del sistema en todas las pantallas (modo kiosco)
                BackHandler(enabled = true) {}

                LaunchedEffect(autenticado) {
                    if (autenticado) {
                        IdleTimeoutManager.start { cerrarSesion() }
                    } else {
                        IdleTimeoutManager.stop()
                    }
                }

                if (autenticado) {
                    if (esAdmin) {
                        AdminNavigation(
                            repository = repository,
                            onLogout = { cerrarSesion() }
                        )
                    } else {
                        AppNavigation(
                            repository = repository,
                            onLogout = { cerrarSesion() }
                        )
                    }
                } else {
                    LoginScreen(repository) {
                        autenticado = true
                        esAdmin = SessionManager.isAdmin(this@MainActivity)
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
        esAdmin = false
    }

    override fun onDestroy() {
        super.onDestroy()
        networkObserver.unregister()
    }
}