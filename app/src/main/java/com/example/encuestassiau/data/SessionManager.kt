package com.example.encuestassiau.data

import android.content.Context
import com.example.encuestassiau.network.NetworkClient

object SessionManager {

    private const val PREF_NAME = "encuestas_sesion"

    // 🔐 Auth
    private const val KEY_JWT = "jwt_token"

    // 👤 Usuario
    private const val KEY_USUARIO_ID = "usuario_id"
    private const val KEY_USUARIO_NOMBRE = "usuario_nombre"

    /**
     * Guarda SOLO el token JWT y lo inyecta en el cliente de red
     */
    fun saveToken(context: Context, jwt: String) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_JWT, jwt)
            .apply()

        NetworkClient.setAuthToken(jwt)
    }

    /**
     * Guarda los datos del usuario logueado
     */
    fun saveUsuario(
        context: Context,
        usuarioId: String,
        usuarioNombre: String
    ) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_USUARIO_ID, usuarioId)
            .putString(KEY_USUARIO_NOMBRE, usuarioNombre)
            .apply()
    }

    fun getToken(context: Context): String? =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getString(KEY_JWT, null)

    fun getUsuarioId(context: Context): String? =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getString(KEY_USUARIO_ID, null)

    fun getUsuarioNombre(context: Context): String? =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getString(KEY_USUARIO_NOMBRE, null)

    fun isLoggedIn(context: Context): Boolean =
        getToken(context) != null && getUsuarioId(context) != null

    fun clearSession(context: Context) {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit().clear().apply()

        NetworkClient.setAuthToken(null)
    }

    fun restoreSession(context: Context) {
        val token = getToken(context)
        NetworkClient.setAuthToken(token)
    }
}
