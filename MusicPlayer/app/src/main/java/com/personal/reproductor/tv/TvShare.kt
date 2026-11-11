package com.personal.reproductor.tv

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.Inet4Address
import java.net.NetworkInterface
import java.security.SecureRandom

/** Estado visible en Ajustes y en la notificación. */
data class TvShareStatus(
    val enabled: Boolean = false,
    val running: Boolean = false,
    val port: Int = TvShare.PORT,
    val addresses: List<String> = emptyList(),
    val pin: String = "",
    val paired: Int = 0,
    val error: String? = null,
)

/**
 * Preferencias y estado de «Pipo en la TV»: código de emparejamiento, TV emparejadas
 * (tokens) y si el teléfono comparte su música.
 */
object TvShare {
    const val PORT = 37373
    private const val PREFS = "pipo_tv"
    private const val K_ENABLED = "enabled"
    private const val K_PIN = "pin"
    private const val K_TOKENS = "tokens"
    private val random = SecureRandom()

    private val _status = MutableStateFlow(TvShareStatus())
    val status: StateFlow<TvShareStatus> = _status.asStateFlow()

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(context: Context) = prefs(context).getBoolean(K_ENABLED, false)

    fun setEnabled(context: Context, on: Boolean) {
        prefs(context).edit().putBoolean(K_ENABLED, on).apply()
        refresh(context)
    }

    fun pin(context: Context): String {
        val p = prefs(context)
        return p.getString(K_PIN, null) ?: newPin(context)
    }

    fun newPin(context: Context): String {
        val pin = String.format("%04d", random.nextInt(10000))
        prefs(context).edit().putString(K_PIN, pin).apply()
        refresh(context)
        return pin
    }

    fun tokens(context: Context): Set<String> = prefs(context).getStringSet(K_TOKENS, emptySet()) ?: emptySet()

    fun addToken(context: Context): String {
        val bytes = ByteArray(16).also { random.nextBytes(it) }
        val token = bytes.joinToString("") { "%02x".format(it) }
        // Como mucho 10 TV emparejadas.
        val list = (tokens(context).toList().takeLast(9) + token).toSet()
        prefs(context).edit().putStringSet(K_TOKENS, list).apply()
        refresh(context)
        return token
    }

    fun unpairAll(context: Context) {
        prefs(context).edit().putStringSet(K_TOKENS, emptySet()).apply()
        refresh(context)
    }

    internal fun setRunning(context: Context, running: Boolean, port: Int, error: String? = null) {
        _status.value = _status.value.copy(running = running, port = port, error = error)
        refresh(context)
    }

    fun refresh(context: Context) {
        _status.value = _status.value.copy(
            enabled = isEnabled(context),
            pin = pin(context),
            paired = tokens(context).size,
            addresses = lanAddresses(),
        )
    }

    /** Direcciones IPv4 de la red local (primero el Wi-Fi). */
    fun lanAddresses(): List<String> {
        val out = mutableListOf<Pair<Int, String>>()
        try {
            for (iface in NetworkInterface.getNetworkInterfaces()) {
                if (!iface.isUp || iface.isLoopback) continue
                for (addr in iface.inetAddresses) {
                    if (addr !is Inet4Address || addr.isLoopbackAddress || addr.isLinkLocalAddress) continue
                    val ip = addr.hostAddress ?: continue
                    val score = when {
                        iface.name.startsWith("wlan") -> 0
                        ip.startsWith("192.168.") -> 1
                        ip.startsWith("10.") -> 2
                        else -> 3
                    }
                    out += score to ip
                }
            }
        } catch (_: Exception) {
        }
        return out.sortedBy { it.first }.map { it.second }.distinct()
    }
}
