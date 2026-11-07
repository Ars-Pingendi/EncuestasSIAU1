package com.personal.reproductor.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

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
        RemoteTrackEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class AppDb : RoomDatabase() {
    abstract fun userDao(): UserDao

    companion object {
        fun create(context: Context): AppDb =
            Room.databaseBuilder(context.applicationContext, AppDb::class.java, "reproductor.db")
                .addMigrations(MIGRATION_1_2)
                .build()

        /** v1 -> v2: tabla para las canciones de YouTube (no toca los datos existentes). */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `youtube_tracks` (" +
                        "`videoId` TEXT NOT NULL, `title` TEXT NOT NULL, `artist` TEXT NOT NULL, " +
                        "`durationMs` INTEGER NOT NULL, `artworkUrl` TEXT, `updatedAt` INTEGER NOT NULL, " +
                        "PRIMARY KEY(`videoId`))",
                )
            }
        }
    }
}
