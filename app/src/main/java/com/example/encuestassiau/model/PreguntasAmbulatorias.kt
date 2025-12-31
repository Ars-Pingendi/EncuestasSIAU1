package com.example.encuestassiau.model

val preguntasAmbulatorias = listOf(
    Question(
        id = 1,
        tipoEncuesta = "ambulatoria",
        texto = "¿Cómo calificaría la facilidad para conseguir una cita?",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 2,
        tipoEncuesta = "ambulatoria",
        texto = "¿El tiempo de espera para ser atendido fue adecuado?",
        opciones = listOf("Sí", "No")
    ),
    Question(
        id = 3,
        tipoEncuesta = "ambulatoria",
        texto = "¿Cómo calificaría la atención del personal administrativo?",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 4,
        tipoEncuesta = "ambulatoria",
        texto = "¿El tiempo de espera para la consulta fue adecuado?",
        opciones = listOf("Sí", "No")
    ),
    Question(
        id = 5,
        tipoEncuesta = "ambulatoria",
        texto = "¿Cómo calificaría la atención del médico?",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 6,
        tipoEncuesta = "ambulatoria",
        texto = "¿El médico le explicó claramente su diagnóstico y tratamiento?",
        opciones = listOf("Sí", "No")
    ),
    Question(
        id = 7,
        tipoEncuesta = "ambulatoria",
        texto = "¿Cómo calificaría la atención del personal de enfermería?",
        opciones = listOf("Muy mala", "Mala", "Regular", "Buena", "Muy buena")
    ),
    Question(
        id = 8,
        tipoEncuesta = "ambulatoria",
        texto = "¿El personal de enfermería resolvió sus dudas?",
        opciones = listOf("Sí", "No")
    ),
    Question(
        id = 9,
        tipoEncuesta = "ambulatoria",
        texto = "¿Las instalaciones del servicio ambulatorio le parecieron adecuadas?",
        opciones = listOf("Muy inadecuadas", "Inadecuadas", "Regulares", "Adecuadas", "Muy adecuadas")
    ),
    Question(
        id = 10,
        tipoEncuesta = "ambulatoria",
        texto = "¿Recomendaría este servicio ambulatorio a familiares o amigos?",
        opciones = listOf("Definitivamente no", "Probablemente no", "Probablemente sí", "Definitivamente sí")
    ),
    Question(
        id = 11,
        tipoEncuesta = "ambulatoria",
        texto = "¿Cómo calificaría en general el servicio ambulatorio recibido?",
        opciones = listOf("Muy malo", "Malo", "Regular", "Bueno", "Muy bueno")
    ),
    Question(
        id = 12,
        tipoEncuesta = "ambulatoria",
        texto = "¿Tiene algún comentario adicional sobre el servicio ambulatorio?",
        opciones = listOf("Ninguno", "Sí, tengo un comentario"),
        requiereComentario = true
    )
)
