package com.example.encuestassiau.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.example.encuestassiau.network.RetrofitClient

object SessionManager {

    // v2 evita leer el archivo plano anterior con clave cifrada (causaría crash)
    private const val PREF_NAME = "encuestas_sesion_v2"

    private const val KEY_JWT = "jwt_token"
    private const val KEY_USUARIO_ID = "usuario_id"
    private const val KEY_USUARIO_NOMBRE = "usuario_nombre"
    private const val KEY_ROL = "usuario_rol"

    private fun getPrefs(context: Context): SharedPreferences {
        return try {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                PREF_NAME,
                masterKeyAlias,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e("SessionManager", "Error abriendo prefs cifradas, usando planas como fallback", e)
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        }
    }

    fun saveToken(context: Context, jwt: String) {
        getPrefs(context).edit().putString(KEY_JWT, jwt).apply()
        RetrofitClient.setAuthToken(jwt)
    }

    fun saveUsuario(context: Context, usuarioId: String, usuarioNombre: String) {
        getPrefs(context).edit()
            .putString(KEY_USUARIO_ID, usuarioId)
            .putString(KEY_USUARIO_NOMBRE, usuarioNombre)
            .apply()
    }

    fun saveRol(context: Context, rol: String) {
        getPrefs(context).edit().putString(KEY_ROL, rol).apply()
    }

    fun getRol(context: Context): String =
        getPrefs(context).getString(KEY_ROL, "ROLE_USER") ?: "ROLE_USER"

    fun isAdmin(context: Context): Boolean = getRol(context) == "ROLE_ADMIN"

    fun getToken(context: Context): String? =
        getPrefs(context).getString(KEY_JWT, null)

    fun getUsuarioId(context: Context): String? =
        getPrefs(context).getString(KEY_USUARIO_ID, null)

    fun getUsuarioNombre(context: Context): String? =
        getPrefs(context).getString(KEY_USUARIO_NOMBRE, null)

    fun isLoggedIn(context: Context): Boolean =
        getToken(context) != null && getUsuarioId(context) != null

    fun clearSession(context: Context) {
        getPrefs(context).edit().clear().apply()
        RetrofitClient.setAuthToken(null)
    }

    fun restoreSession(context: Context) {
        val token = getToken(context)
        RetrofitClient.setAuthToken(token)
    }
}
