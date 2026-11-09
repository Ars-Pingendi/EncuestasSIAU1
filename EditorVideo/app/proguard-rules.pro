# Media3 y ML Kit incluyen sus propias reglas de consumidor.
# Se conservan las clases de la app para facilitar el diagnóstico de errores.
-keep class com.arspingendi.editorvideo.** { *; }
-keepattributes SourceFile,LineNumberTable
-dontwarn org.checkerframework.**
-dontwarn com.google.errorprone.annotations.**
