package com.example.encuestassiau.data.converters

import androidx.room.TypeConverter
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class StringListConverter {

    @TypeConverter
    fun fromList(value: List<String>?): String =
        Json.encodeToString(value ?: emptyList())

    @TypeConverter
    fun toList(value: String): List<String> =
        Json.decodeFromString(value)
}
