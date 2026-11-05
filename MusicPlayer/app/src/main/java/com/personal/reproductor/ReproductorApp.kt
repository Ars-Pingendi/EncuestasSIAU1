package com.personal.reproductor

import android.app.Application
import com.personal.reproductor.audio.AudioEffectsController
import com.personal.reproductor.audio.SleepTimer
import com.personal.reproductor.data.AppSettings
import com.personal.reproductor.data.LibraryRepository
import com.personal.reproductor.data.UserDataRepository
import com.personal.reproductor.data.db.AppDb
import com.personal.reproductor.playback.QueueStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Contenedor de dependencias compartidas entre la interfaz y el servicio de reproducción. */
class ReproductorApp : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mainScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val settings: AppSettings by lazy { AppSettings(this) }
    private val db: AppDb by lazy { AppDb.create(this) }
    val userData: UserDataRepository by lazy { UserDataRepository(db.userDao()) }
    val library: LibraryRepository by lazy { LibraryRepository(this, settings, appScope) }
    val effects: AudioEffectsController by lazy { AudioEffectsController(this) }
    val queueStore: QueueStore by lazy { QueueStore(this) }
    val sleepTimer: SleepTimer by lazy { SleepTimer(mainScope) }
}
