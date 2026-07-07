package com.example.encuestassiau.util

import java.util.Base64

object JwtUtils {

    fun decodePayload(token: String): org.json.JSONObject? {
        return try {
            val raw = token.split(".")[1]
            val bytes = Base64.getUrlDecoder().decode(raw)
            org.json.JSONObject(String(bytes, Charsets.UTF_8))
        } catch (e: Exception) {
            null
        }
    }

    fun isExpired(token: String): Boolean {
        val payload = decodePayload(token) ?: return true
        val exp = payload.optLong("exp", 0L)
        if (exp == 0L) return false
        return System.currentTimeMillis() / 1000 >= exp
    }
}
