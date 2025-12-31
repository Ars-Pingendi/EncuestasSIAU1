package com.example.encuestassiau.data

import androidx.room.TypeConverter
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

object Converters {
    private val json = Json { ignoreUnknownKeys = true }

    @TypeConverter
    @JvmStatic
    fun fromStringList(list: List<String>?): String? =
        list?.let { json.encodeToString(it) }

    @TypeConverter
    @JvmStatic
    fun toStringList(data: String?): List<String> =
        data?.let { json.decodeFromString(it) } ?: emptyList()
}
