# Base de datos — EncuestasSIAU (PostgreSQL)

Scripts para crear el modelo de datos en el servidor del hospital.

## Orden de ejecución

```bash
psql -U <usuario> -d <basededatos> -f 01_schema.sql
psql -U <usuario> -d <basededatos> -f 02_seed_preguntas.sql
```

1. **`01_schema.sql`** — crea las tablas `preguntas` y `respuestas` (con índices, FK y constraints).
2. **`02_seed_preguntas.sql`** — carga las 26 preguntas (12 ambulatorias + 14 internación) con los ids exactos que usa la app. Es idempotente (`ON CONFLICT DO UPDATE`).

## Tablas

- **`preguntas`** — catálogo. Los `id` son fijos (1–12 ambulatoria, 101–114 internación) y **deben coincidir** con los del cliente; por eso no se autogeneran.
- **`respuestas`** — recibe lo que el celular envía en `POST /respuestas`.

## Mapeo JSON (app) → columnas (BD)

La app envía JSON en **camelCase**; las columnas están en **snake_case** (convención PostgreSQL). El backend debe mapear así (en Spring: `@JsonProperty` o `spring.jackson.property-naming-strategy`, y `@Column` o naming strategy de Hibernate):

| Campo JSON (app) | Columna (`respuestas`) | Notas |
|---|---|---|
| `id` | `id_local` | Id local del dispositivo. **No** es la PK del servidor (cada celular tiene su propia secuencia). |
| `encuestaId` | `encuesta_id` | UUID que agrupa todas las respuestas de una misma encuesta. |
| `encuestaTipo` | `encuesta_tipo` | `'ambulatoria'` o `'internacion'`. |
| `preguntaId` | `pregunta_id` | FK → `preguntas.id`. |
| `respuesta` | `respuesta` | |
| `servicio` | `servicio` | |
| `edad` | `edad` | |
| `sexo` | `sexo` | |
| `informante` | `informante` | `'Paciente'` o `'Cuidador principal'`. |
| `identificacion` | `identificacion` | Opcional (puede venir `null`). |
| `comentario` | `comentario` | Opcional (puede venir `null`). |
| `motivos` | `motivos` | Arreglo JSON de motivos de detracción (vacío si no es detractor) → `JSONB`. |
| `fecha` | `fecha` | ISO-8601 con zona: `2026-06-30T14:23:05-05:00` → `TIMESTAMPTZ`. |
| `usuarioId` | `usuario_id` | |
| `usuarioNombre` | `usuario_nombre` | |
| `sincronizado` | `sincronizado` | El cliente puede mandar `false`; en el servidor por defecto queda `true`. |

> El PK `id` (BIGINT IDENTITY) y `creado_en` los genera el servidor; **no** vienen en el JSON.

## Notas

- `opciones` y `motivos` en `preguntas` son `JSONB` (la app los serializa como arreglos JSON,
  p.ej. `["Sí","No"]`). `motivos` es el catálogo de tipificación que se muestra cuando la
  pregunta se califica en nivel detractor (los `UPDATE` del seed lo cargan por categoría).
- Si más adelante la app empieza a **descargar** el catálogo desde el servidor, el endpoint debe devolver `opciones` como arreglo JSON real (no como string) para que coincida con el modelo `Question`.
- Si quieren evitar respuestas duplicadas por reenvíos, se puede agregar una restricción única, p.ej. sobre `(usuario_id, pregunta_id, fecha, servicio)`. No está incluida por defecto.
