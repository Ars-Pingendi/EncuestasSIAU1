package com.example.encuestassiau.util

import kotlinx.coroutines.*

object IdleTimeoutManager {

    private const val TIMEOUT_MS = 5 * 60 * 1000L // 5 minutos
    private var job: Job? = null

    fun start(onTimeout: () -> Unit) {
        stop()
        job = CoroutineScope(Dispatchers.Main).launch {
            delay(TIMEOUT_MS)
            onTimeout()
        }
    }

    fun reset() {
        job?.cancel()
    }

    fun stop() {
        job?.cancel()
        job = null
    }
}
