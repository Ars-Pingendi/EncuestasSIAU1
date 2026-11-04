package com.personal.reproductor.audio

import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Temporizador de apagado: pausa la música al terminar. Vive en la app para sobrevivir a la actividad. */
class SleepTimer(private val scope: CoroutineScope) {

    private val _remainingMs = MutableStateFlow<Long?>(null)
    val remainingMs: StateFlow<Long?> = _remainingMs.asStateFlow()

    /** Lo registra el servicio de reproducción. */
    var onFinish: (() -> Unit)? = null

    private var job: Job? = null

    fun start(minutes: Int) {
        job?.cancel()
        val end = SystemClock.elapsedRealtime() + minutes * 60_000L
        job = scope.launch {
            while (true) {
                val left = end - SystemClock.elapsedRealtime()
                if (left <= 0) break
                _remainingMs.value = left
                delay(1000)
            }
            _remainingMs.value = null
            onFinish?.invoke()
        }
    }

    fun cancel() {
        job?.cancel()
        job = null
        _remainingMs.value = null
    }
}
