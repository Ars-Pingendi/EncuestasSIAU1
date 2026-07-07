package com.example.encuestassiau.util

data class TipificacionConfig(
    val activadoPor: Set<String>,
    val opciones: List<String>
)

// Q1–Q7: "Regular" también dispara tipificación
private val DETRACTORES_TRATO = setOf("Muy malo", "Malo", "Regular")

// Q12 NPS: detractores son 0–6
private val DETRACTORES_NPS = (0..6).map { it.toString() }.toSet()

const val TIPIFICACION_OTRO = "Otro (especifique)"

private val opcionesPrivacidadInformacion = listOf(
    "Falta de Claridad: Usaron palabras médicas muy difíciles que nadie entendió.",
    "Falta de Privacidad Física: Lo examinaron con la puerta/cortina abierta o personas ajenas mirando.",
    "Falla de Confidencialidad: El médico dio el diagnóstico en voz alta frente a otros pacientes o a familiares que no eran los cuidadores principales.",
    "Falta de Oportunidad: Entrega tardía de resultados, historias clínicas o fórmulas médicas."
)

private val opcionesNpsDetractor = listOf(
    "Trato humano",
    "Comunicación e información",
    "Oportunidad en la atención (tiempos de espera)",
    "Calidad de la atención",
    "Procesos administrativos",
    "Instalaciones y comodidad",
    TIPIFICACION_OTRO
)

val tipificacionPorPregunta: Map<Int, TipificacionConfig> = mapOf(

    1 to TipificacionConfig(
        activadoPor = DETRACTORES_TRATO,
        opciones = listOf(
            "El personal ignoró al usuario o se negó a dar orientación.",
            "Expresiones corporales o tono de voz grosero/agresivo.",
            "Demora excesiva en la ventanilla para realizar el trámite.",
            "Información contradictoria (un funcionario dice una cosa y otro algo diferente).",
            "Falta de personal en las taquillas de atención."
        )
    ),

    2 to TipificacionConfig(
        activadoPor = DETRACTORES_TRATO,
        opciones = listOf(
            "El médico no miró al paciente a la cara (estuvo todo el tiempo frente al computador).",
            "Tono de voz rudo, regaño o falta de empatía ante el dolor del paciente.",
            "Atención demasiado rápida o con afán (sintió que no lo revisaron bien).",
            "Minimización de los síntomas expresados por el paciente o cuidador."
        )
    ),

    3 to TipificacionConfig(
        activadoPor = DETRACTORES_TRATO,
        opciones = listOf(
            "Demora o falta de respuesta al llamado del timbre (en internación).",
            "Mala actitud o brusquedad al aplicar medicamentos, canalizar o mover al paciente.",
            "Respuestas evasivas o groseras ante las dudas del paciente o familiar.",
            "Falta de continuidad o descuido en los turnos de atención."
        )
    ),

    4 to TipificacionConfig(activadoPor = DETRACTORES_TRATO, opciones = opcionesPrivacidadInformacion),
    5 to TipificacionConfig(activadoPor = DETRACTORES_TRATO, opciones = opcionesPrivacidadInformacion),
    6 to TipificacionConfig(activadoPor = DETRACTORES_TRATO, opciones = opcionesPrivacidadInformacion),
    7 to TipificacionConfig(activadoPor = DETRACTORES_TRATO, opciones = opcionesPrivacidadInformacion),

    12 to TipificacionConfig(
        activadoPor = DETRACTORES_NPS,
        opciones = opcionesNpsDetractor
    )
)

const val TIPIFICACION_SEPARATOR = "|"

fun tipificacionFromString(raw: String?): Set<String> =
    raw?.split(TIPIFICACION_SEPARATOR)
        ?.filter { it.isNotEmpty() }
        ?.map { item ->
            // "Otro (especifique): <texto>" → "Otro (especifique)" para marcar el checkbox
            if (item.startsWith("$TIPIFICACION_OTRO: ")) TIPIFICACION_OTRO else item
        }
        ?.toSet() ?: emptySet()

fun extractOtroText(raw: String?): String {
    if (raw.isNullOrEmpty()) return ""
    return raw.split(TIPIFICACION_SEPARATOR)
        .firstOrNull { it.startsWith("$TIPIFICACION_OTRO: ") }
        ?.removePrefix("$TIPIFICACION_OTRO: ")
        ?: ""
}

fun tipificacionToString(items: Set<String>): String? =
    items.takeIf { it.isNotEmpty() }?.joinToString(TIPIFICACION_SEPARATOR)