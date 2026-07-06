package com.example.encuestassiau.model

/**
 * Catálogos de tipificación de motivos de detracción (insatisfacción).
 *
 * Se despliegan automáticamente en la tablet cuando una pregunta de calidad
 * se califica en nivel detractor (las opciones de la mitad inferior de la escala,
 * p.ej. "Muy malo", "Malo", "Regular"). Estandarizan las causas de insatisfacción
 * y alimentan el Diagrama de Pareto del tablero de control.
 *
 * Todas incluyen "Otro (especifique)" para permitir texto libre.
 */

val MOTIVOS_ADMINISTRATIVO = listOf(
    "El personal ignoró al usuario o se negó a dar orientación",
    "Expresiones corporales o tono de voz grosero/agresivo",
    "Demora excesiva en la ventanilla para realizar el trámite",
    "Información contradictoria entre funcionarios",
    "Falta de personal en las taquillas de atención",
    "Otro (especifique)"
)

val MOTIVOS_MEDICO = listOf(
    "El médico no miró a la cara (estuvo frente al computador)",
    "Tono de voz rudo, regaño o falta de empatía ante el dolor",
    "Atención demasiado rápida o con afán (no lo revisaron bien)",
    "Minimización de los síntomas del paciente o cuidador",
    "Otro (especifique)"
)

val MOTIVOS_ENFERMERIA = listOf(
    "Demora o falta de respuesta al llamado del timbre",
    "Brusquedad al aplicar medicamentos, canalizar o mover al paciente",
    "Respuestas evasivas o groseras ante las dudas",
    "Falta de continuidad o descuido en los turnos de atención",
    "Otro (especifique)"
)

val MOTIVOS_INFORMACION = listOf(
    "Falta de claridad: usaron palabras médicas muy difíciles",
    "Falta de privacidad física durante el examen",
    "Falla de confidencialidad: información en voz alta frente a otros",
    "Falta de oportunidad: entrega tardía de resultados o fórmulas",
    "Otro (especifique)"
)

val MOTIVOS_INFRAESTRUCTURA = listOf(
    "Instalaciones sucias o con mal aseo",
    "Falta de mantenimiento (baños, camas o equipos dañados)",
    "Ruido excesivo o falta de comodidad",
    "Señalización confusa para ubicarse",
    "Otro (especifique)"
)

val MOTIVOS_GENERAL = listOf(
    "Tiempo de espera prolongado",
    "Desorganización en el servicio",
    "Mala coordinación entre áreas",
    "Trato poco humanizado en general",
    "Otro (especifique)"
)
