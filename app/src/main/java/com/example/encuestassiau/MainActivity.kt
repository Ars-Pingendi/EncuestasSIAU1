package com.example.encuestassiau

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
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

    private lateinit var networkObserver: NetworkObserver

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val database = AppDatabase.getDatabase(this)
        val repository = Repository(
            database.respuestaDao(),
            database.preguntaDao()
        )

        // 🌐 Sincronización automática al volver la red
        networkObserver = NetworkObserver(this) {
            Log.i("SYNC", "🌐 Red disponible → sincronizando pendientes")
            lifecycleScope.launch {
                repository.sincronizarPendientes(
                    this@MainActivity.applicationContext
                )
            }
        }
        networkObserver.register()

        // 🔐 Restaurar sesión si existe
        SessionManager.getToken(this)

        setContent {
            MaterialTheme {
                Surface {

                    val context = LocalContext.current
                    var autenticado by remember {
                        mutableStateOf(SessionManager.isLoggedIn(context))
                    }

                    // ⏳ Timeout por inactividad
                    LaunchedEffect(autenticado) {
                        if (autenticado) {
                            IdleTimeoutManager.start {
                                cerrarSesion()
                            }
                        } else {
                            IdleTimeoutManager.stop()
                        }
                    }

                    if (autenticado) {
                        AppNavigation(repository)
                    } else {
                        LoginScreen(repository) {
                            autenticado = true
                        }
                    }
                }
            }
        }
    }

    private fun cerrarSesion() {
        SessionManager.clearSession(this)
        recreate()
    }

    override fun onDestroy() {
        super.onDestroy()
        networkObserver.unregister()
    }
}
