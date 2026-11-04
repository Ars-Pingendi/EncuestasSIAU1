package com.personal.reproductor.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Base de datos con tus listas, favoritos y estadísticas.
 * Nunca se usa fallbackToDestructiveMigration: si algún día cambia el esquema,
 * hay que escribir una migración explícita para no perder tus listas.
 */
@Database(
    entities = [
        PlaylistEntity::class,
        PlaylistTrackEntity::class,
        FavoriteTrackEntity::class,
        FavoriteAlbumEntity::class,
        PlayStatEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDb : RoomDatabase() {
    abstract fun userDao(): UserDao

    companion object {
        fun create(context: Context): AppDb =
            Room.databaseBuilder(context.applicationContext, AppDb::class.java, "reproductor.db").build()
    }
}
