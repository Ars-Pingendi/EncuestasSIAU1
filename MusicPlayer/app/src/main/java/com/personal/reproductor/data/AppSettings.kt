package com.personal.reproductor.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class SongSort(val label: String) {
    TITLE("Título"),
    ARTIST("Artista"),
    ALBUM("Álbum"),
    RECENT("Agregadas recientemente"),
    DURATION("Duración"),
}

enum class ThemeMode(val label: String) {
    SYSTEM("Automático (según el sistema)"),
    LIGHT("Claro"),
    DARK("Oscuro"),
}

class AppSettings(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("ajustes", Context.MODE_PRIVATE)

    private val _songSort = MutableStateFlow(readSort())
    val songSort: StateFlow<SongSort> = _songSort.asStateFlow()

    private val _themeMode = MutableStateFlow(readTheme())
    val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()

    private val _minDurationSec = MutableStateFlow(prefs.getInt(K_MIN_DURATION, 20))
    val minDurationSec: StateFlow<Int> = _minDurationSec.asStateFlow()

    private val _includeAllAudio = MutableStateFlow(prefs.getBoolean(K_INCLUDE_ALL, false))
    val includeAllAudio: StateFlow<Boolean> = _includeAllAudio.asStateFlow()

    fun setSongSort(value: SongSort) {
        _songSort.value = value
        prefs.edit().putString(K_SORT, value.name).apply()
    }

    fun setThemeMode(value: ThemeMode) {
        _themeMode.value = value
        prefs.edit().putString(K_THEME, value.name).apply()
    }

    fun setMinDurationSec(value: Int) {
        _minDurationSec.value = value
        prefs.edit().putInt(K_MIN_DURATION, value).apply()
    }

    fun setIncludeAllAudio(value: Boolean) {
        _includeAllAudio.value = value
        prefs.edit().putBoolean(K_INCLUDE_ALL, value).apply()
    }

    private fun readSort(): SongSort =
        runCatching { SongSort.valueOf(prefs.getString(K_SORT, null) ?: "") }.getOrDefault(SongSort.TITLE)

    private fun readTheme(): ThemeMode =
        runCatching { ThemeMode.valueOf(prefs.getString(K_THEME, null) ?: "") }.getOrDefault(ThemeMode.SYSTEM)

    private companion object {
        const val K_SORT = "song_sort"
        const val K_THEME = "theme"
        const val K_MIN_DURATION = "min_duration_sec"
        const val K_INCLUDE_ALL = "include_all_audio"
    }
}
