package com.example.encuestassiau.data

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.encuestassiau.data.converters.StringListConverter
import com.example.encuestassiau.model.Question
import com.example.encuestassiau.model.preguntasAmbulatorias
import com.example.encuestassiau.model.preguntasInternacion
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
    entities = [
        Respuesta::class,
        Question::class
    ],
    version = 2,
    exportSchema = false
)
@TypeConverters(StringListConverter::class)
abstract class AppDatabase : RoomDatabase() {

    abstract fun respuestaDao(): RespuestaDao
    abstract fun preguntaDao(): PreguntaDao

    companion object {

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {

                // 👇 Variable visible para el callback
                lateinit var dbInstance: AppDatabase

                dbInstance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "encuestas_db"
                )
                    // ⚠️ SOLO PARA DESARROLLO
                    .fallbackToDestructiveMigration()

                    .addCallback(object : RoomDatabase.Callback() {

                        override fun onCreate(db: SupportSQLiteDatabase) {
                            super.onCreate(db)

                            Log.i("DB", "🆕 Base de datos creada")

                            CoroutineScope(Dispatchers.IO).launch {
                                try {
                                    Log.i("DB", "📥 Precargando preguntas...")

                                    dbInstance.preguntaDao().insertarTodas(
                                        preguntasAmbulatorias + preguntasInternacion
                                    )

                                    Log.i(
                                        "DB",
                                        "✅ Precarga completada: " +
                                                "Ambulatorias=${preguntasAmbulatorias.size}, " +
                                                "Internación=${preguntasInternacion.size}"
                                    )
                                } catch (e: Exception) {
                                    Log.e("DB", "❌ Error precargando preguntas", e)
                                }
                            }
                        }
                    })
                    .build()

                INSTANCE = dbInstance
                dbInstance
            }
        }
    }
}
