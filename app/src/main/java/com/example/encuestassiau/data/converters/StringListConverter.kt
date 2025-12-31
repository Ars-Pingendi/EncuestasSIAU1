package com.example.encuestassiau.data.converters

import androidx.room.TypeConverter
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class StringListConverter {

    private val gson = Gson()

    @TypeConverter
    fun fromList(value: List<String>?): String {
        return gson.toJson(value)
    }

    @TypeConverter
    fun toList(value: String): List<String> {
        val listType = object : TypeToken<List<String>>() {}.type
        return gson.fromJson(value, listType)
    }
}
