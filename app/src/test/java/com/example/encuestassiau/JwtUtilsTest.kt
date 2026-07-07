package com.example.encuestassiau

import com.example.encuestassiau.util.JwtUtils
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64

class JwtUtilsTest {

    private fun makeToken(payloadJson: String): String {
        val header = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
        val payload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payloadJson.toByteArray())
        return "$header.$payload.fakesignature"
    }

    @Test
    fun `token with future exp is not expired`() {
        val futureExp = System.currentTimeMillis() / 1000 + 3600
        val token = makeToken("""{"sub":"user1","exp":$futureExp}""")
        assertFalse(JwtUtils.isExpired(token))
    }

    @Test
    fun `token with past exp is expired`() {
        val pastExp = System.currentTimeMillis() / 1000 - 3600
        val token = makeToken("""{"sub":"user1","exp":$pastExp}""")
        assertTrue(JwtUtils.isExpired(token))
    }

    @Test
    fun `token without exp claim is treated as valid`() {
        val token = makeToken("""{"sub":"user1","name_user":"Dr. García"}""")
        assertFalse(JwtUtils.isExpired(token))
    }

    @Test
    fun `malformed token returns null payload`() {
        assertNull(JwtUtils.decodePayload("not-a-jwt"))
    }

    @Test
    fun `decodePayload extracts name_user correctly`() {
        val token = makeToken("""{"name_user":"Dr. García","exp":9999999999}""")
        val payload = JwtUtils.decodePayload(token)
        assertEquals("Dr. García", payload?.optString("name_user"))
    }

    @Test
    fun `completely empty token returns null`() {
        assertNull(JwtUtils.decodePayload(""))
    }
}
