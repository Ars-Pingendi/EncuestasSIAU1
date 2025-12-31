package com.example.encuestassiau.ui

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.encuestassiau.data.Repository
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    repository: Repository,
    onLoginSuccess: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var errorMensaje by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        Text("Ingreso al sistema", style = MaterialTheme.typography.titleLarge)

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Usuario") },
            modifier = Modifier.fillMaxWidth(),
            enabled = !loading
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Contraseña") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            enabled = !loading
        )

        Spacer(modifier = Modifier.height(16.dp))

        errorMensaje?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(8.dp))
        }

        Button(
            onClick = {
                scope.launch {
                    loading = true
                    errorMensaje = null

                    val result = repository.login(
                        context = context,
                        username = username,
                        password = password
                    )

                    loading = false

                    result
                        .onSuccess {
                            Toast.makeText(
                                context,
                                "Ingreso exitoso",
                                Toast.LENGTH_SHORT
                            ).show()
                            onLoginSuccess()
                        }
                        .onFailure { error ->
                            errorMensaje = when {
                                error.message?.contains("Credenciales", true) == true ->
                                    "Usuario o contraseña incorrectos"
                                else ->
                                    "No fue posible conectarse al servidor"
                            }
                        }
                }
            },
            enabled = !loading && username.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp
                )
            } else {
                Text("Ingresar")
            }
        }
    }
}
