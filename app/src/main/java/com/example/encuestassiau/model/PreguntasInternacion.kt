package com.example.encuestassiau.model

val preguntasInternacion = listOf(
    Question(
        id = 101,
        tipoEncuesta = "internacion",
        texto = "¿El trato recibido durante el ingreso fue digno, respetando sus creencias, costumbres y sin discriminación?",
        opciones = listOf("Muy malo", "Malo", "Regular", "Bueno", "Muy bueno")
    ),
    Question(
        id = 102,
        tipoEncuesta = "internacion",
        texto = "¿Al momento de su ingreso al hospital le dieron información clara sobre copagos y cuotas moderadoras?",
        opciones = listOf("Sí", "No")
    ),
    Question(
        id = 103,
        tipoEncuesta = "internacion",
        texto = "La información sobre clasificación y tiempo de atención según el triage en urgencias fue…",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 104,
        tipoEncuesta = "internacion",
        texto = "La información sobre su estado de salud y la atención recibida por el médico en claridad y suficiencia fue…",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 105,
        tipoEncuesta = "internacion",
        texto = "El trato por el médico en relación a dignidad, respetando sus creencias y costumbres fue…",
        opciones = listOf("Muy malo", "Malo", "Regular", "Bueno", "Muy bueno")
    ),
    Question(
        id = 106,
        tipoEncuesta = "internacion",
        texto = "La atención del personal de enfermería fue…",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 107,
        tipoEncuesta = "internacion",
        texto = "La limpieza, el orden y el funcionamiento de las instalaciones fue…",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 108,
        tipoEncuesta = "internacion",
        texto = "¿Recibió información sobre cómo presentar felicitaciones, reclamos o sugerencias y recibir respuesta?",
        opciones = listOf("Sí", "No")
    ),
    Question(
        id = 109,
        tipoEncuesta = "internacion",
        texto = "¿Durante la hospitalización le dieron a conocer sus derechos y deberes como usuario?",
        opciones = listOf("Sí", "No")
    ),
    Question(
        id = 110,
        tipoEncuesta = "internacion",
        texto = "¿Durante su hospitalización se le informó que los estudiantes en formación podían atenderlo?",
        opciones = listOf("Sí", "No", "No aplica")
    ),
    Question(
        id = 111,
        tipoEncuesta = "internacion",
        texto = "¿La alimentación formulada fue suministrada de forma adecuada?",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 112,
        tipoEncuesta = "internacion",
        texto = "Al egreso o alta del servicio, ¿le dieron indicaciones claras sobre los cuidados y signos de alarma?",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 113,
        tipoEncuesta = "internacion",
        texto = "¿Cómo calificaría su experiencia general durante la hospitalización?",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena"),
        requiereComentario = true
    ),
    Question(
        id = 114,
        tipoEncuesta = "internacion",
        texto = "¿Recomendaría a sus familiares y amigos el Hospital Universitario?",
        opciones = listOf("Definitivamente no", "Probablemente no", "Probablemente sí", "Definitivamente sí"),
        requiereComentario = true
    )
)
