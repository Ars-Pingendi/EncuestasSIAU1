package com.example.encuestassiau.network

import android.util.Log
import com.example.encuestassiau.BuildConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    @Volatile private var currentToken: String? = null

    fun setAuthToken(token: String?) {
        currentToken = token
        Log.i("RetrofitClient", "Token actualizado")
    }

    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val authInterceptor = Interceptor { chain ->
        val request = currentToken?.let { token ->
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } ?: chain.request()

        val response = chain.proceed(request)

        if (response.code == 401) {
            Log.w("RetrofitClient", "Token inválido o vencido (401)")
            currentToken = null
        }

        response
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(logging)
        .addInterceptor(authInterceptor)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    val authApi: AuthApi by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.AUTH_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(AuthApi::class.java)
    }

    val syncApi: SyncApi by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_URL.trimEnd('/') + "/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SyncApi::class.java)
    }
}
