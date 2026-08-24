package com.example.encuestassiau.data

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.encuestassiau.data.converters.StringListConverter
import com.example.encuestassiau.model.Question
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

@Database(
    entities = [
        Respuesta::class,
        Question::class
    ],
    version = 5,
    exportSchema = false
)
@TypeConverters(StringListConverter::class)
abstract class AppDatabase : RoomDatabase() {

    abstract fun respuestaDao(): RespuestaDao
    abstract fun preguntaDao(): PreguntaDao

    companion object {

        @Volatile
        private var INSTANCE: AppDatabase? = null

        private val jsonParser = Json { ignoreUnknownKeys = true }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `respuestas` ADD COLUMN `usuarioId` TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE `respuestas` ADD COLUMN `usuarioNombre` TEXT NOT NULL DEFAULT ''")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS `preguntas` (
                        `id` INTEGER NOT NULL,
                        `tipoEncuesta` TEXT NOT NULL,
                        `texto` TEXT NOT NULL,
                        `opciones` TEXT NOT NULL,
                        `requiereComentario` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )"""
                )
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `respuestas` ADD COLUMN `tipificacion` TEXT")
            }
        }

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """CREATE TABLE `respuestas_new` (
                        `id` INTEGER NOT NULL,
                        `encuestaTipo` TEXT NOT NULL,
                        `preguntaId` INTEGER NOT NULL,
                        `respuesta` TEXT NOT NULL,
                        `servicio` TEXT NOT NULL,
                        `edad` INTEGER NOT NULL,
                        `sexo` TEXT NOT NULL,
                        `identificacion` TEXT,
                        `comentario` TEXT,
                        `fecha` TEXT NOT NULL,
                        `usuarioId` TEXT NOT NULL,
                        `usuarioNombre` TEXT NOT NULL,
                        `personaQueResponde` TEXT NOT NULL,
                        `tipificacion` TEXT,
                        `sincronizado` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )"""
                )
                db.execSQL(
                    """INSERT INTO `respuestas_new` (
                        `id`, `encuestaTipo`, `preguntaId`, `respuesta`, `servicio`,
                        `edad`, `sexo`, `identificacion`, `comentario`, `fecha`,
                        `usuarioId`, `usuarioNombre`, `personaQueResponde`,
                        `tipificacion`, `sincronizado`
                    ) SELECT
                        `id`, `encuestaTipo`, `preguntaId`, `respuesta`, `servicio`,
                        `edad`, `sexo`, `identificacion`, `comentario`, `fecha`,
                        `usuarioId`, `usuarioNombre`, COALESCE(`informante`, ''),
                        `motivos`, `sincronizado`
                    FROM `respuestas`"""
                )
                db.execSQL("DROP TABLE `respuestas`")
                db.execSQL("ALTER TABLE `respuestas_new` RENAME TO `respuestas`")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Recrear preguntas para añadir seccion/tipo y eliminar motivos
                // (SQLite no soporta DROP COLUMN antes de API 35)
                db.execSQL(
                    """CREATE TABLE `preguntas_new` (
                        `id` INTEGER NOT NULL,
                        `tipoEncuesta` TEXT NOT NULL,
                        `texto` TEXT NOT NULL,
                        `opciones` TEXT NOT NULL,
                        `requiereComentario` INTEGER NOT NULL,
                        `seccion` TEXT NOT NULL DEFAULT '',
                        `tipo` TEXT NOT NULL DEFAULT 'escala',
                        PRIMARY KEY(`id`)
                    )"""
                )
                db.execSQL(
                    """INSERT INTO `preguntas_new`
                        (id, tipoEncuesta, texto, opciones, requiereComentario, seccion, tipo)
                       SELECT id, tipoEncuesta, texto, opciones, requiereComentario, '', 'escala'
                       FROM `preguntas`"""
                )
                db.execSQL("DROP TABLE `preguntas`")
                db.execSQL("ALTER TABLE `preguntas_new` RENAME TO `preguntas`")
                db.execSQL("ALTER TABLE `respuestas` ADD COLUMN `personaQueResponde` TEXT NOT NULL DEFAULT ''")
                // Borra preguntas obsoletas; onOpen recarga desde preguntas_unificadas.json
                db.execSQL("DELETE FROM `preguntas`")
            }
        }

        private fun loadQuestionsFromAssets(context: Context): List<Question> {
            val text = context.assets.open("preguntas_unificadas.json")
                .bufferedReader().use { it.readText() }
            return jsonParser.decodeFromString(text)
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {

                lateinit var dbInstance: AppDatabase

                dbInstance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "encuestas_db"
                )
                    .addMigrations(
                        MIGRATION_1_2,
                        MIGRATION_2_3,
                        MIGRATION_3_4,
                        MIGRATION_4_5
                    )
                    .addCallback(object : RoomDatabase.Callback() {

                        override fun onCreate(db: SupportSQLiteDatabase) {
                            super.onCreate(db)
                            Log.i("DB", "Base de datos creada")
                            CoroutineScope(Dispatchers.IO).launch {
                                insertarPreguntas(context, dbInstance)
                            }
                        }

                        override fun onOpen(db: SupportSQLiteDatabase) {
                            super.onOpen(db)
                            CoroutineScope(Dispatchers.IO).launch {
                                try {
                                    if (dbInstance.preguntaDao().count() == 0) {
                                        insertarPreguntas(context, dbInstance)
                                    }
                                } catch (e: Exception) {
                                    Log.e("DB", "Error verificando preguntas en onOpen", e)
                                }
                            }
                        }
                    })
                    .build()

                INSTANCE = dbInstance
                dbInstance
            }
        }

        private suspend fun insertarPreguntas(context: Context, db: AppDatabase) {
            try {
                val preguntas = loadQuestionsFromAssets(context.applicationContext)
                db.preguntaDao().insertarTodas(preguntas)
                Log.i("DB", "Preguntas unificadas cargadas: ${preguntas.size}")
            } catch (e: Exception) {
                Log.e("DB", "Error cargando preguntas", e)
            }
        }
    }
}