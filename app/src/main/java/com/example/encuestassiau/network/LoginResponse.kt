package com.example.encuestassiau.network

data class LoginResponse(
    val jwt: String,
    val refreshToken: String?
)