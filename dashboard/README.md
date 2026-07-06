# Tablero de Control de Calidad — Encuestas SIAU

Aplicación HTML de un solo archivo para análisis de las encuestas de satisfacción,
pensada para desplegarse en la **intranet institucional**. Incluye los gráficos
solicitados por la jefatura (NPS, matriz de atributos, trato por perfil, Pareto de
causas y tipo de informante) más filtros por mes y servicio.

## Despliegue en la intranet

Es **estático**: no necesita backend propio.

1. Copie `index.html` al servidor web interno (IIS, Apache, Nginx) o a una carpeta compartida.
2. Acceda desde el navegador por la URL interna (p. ej. `http://intranet/calidad/encuestas/`).

### Si la intranet NO tiene salida a internet

El tablero carga **Chart.js** desde un CDN. En una red cerrada:

1. Descargue una vez el archivo `chart.umd.min.js` (Chart.js v4.4.1).
2. Guárdelo junto a `index.html`.
3. En `index.html`, cambie la línea del `<script>` del CDN por:
   ```html
   <script src="chart.umd.min.js"></script>
   ```

## Conectar con el servidor real (dejar de usar datos simulados)

Hoy el tablero genera **datos de demostración** en el navegador. Para usar datos reales,
edite la función `cargarDatos()` dentro de `index.html`:

```js
async function cargarDatos(){
  const r = await fetch('/api/respuestas');   // endpoint del servidor del hospital
  return await r.json();                       // arreglo de registros de la tabla 'respuestas'
}
```
…y cambie la llamada `const TODOS = cargarDatos();` por `const TODOS = await cargarDatos();`
(envolviendo el arranque en una función `async`).

El formato esperado es un arreglo de objetos con los campos de la tabla `respuestas`
(`encuestaTipo`, `preguntaId`, `respuesta`, `servicio`, `fecha`, etc.).

## Estado de los gráficos

Los 5 gráficos mapean a campos que **la app ya captura** y que existen en la tabla
`respuestas` (incluidos `informante`, `motivos` y `encuesta_id`).

| # | Gráfico | Campo(s) de origen |
|---|---|---|
| 1 | Semáforo NPS (global y por proceso) | `respuesta` de las preguntas "¿Recomendaría?" |
| 2 | Matriz de atributos de calidad | `respuesta` de las preguntas Likert |
| 3 | Trato por perfil (Médico/Enf./Admin) | `respuesta` de las preguntas de trato |
| 4 | Pareto de causas de detracción | `motivos` (tipificación del detractor) |
| 5 | Tipo de informante (Paciente/Cuidador) | `informante` (agrupado por `encuesta_id`) |

## Notas de interpretación (NPS)

- **NPS** se deriva de la pregunta "¿Recomendaría…?":
  *Definitivamente sí* = Promotor · *Probablemente sí* = Pasivo ·
  *Probablemente no / Definitivamente no* = Detractor.
  NPS = % Promotores − % Detractores (rango −100 a 100).
- **Semáforo Likert:** Muy malo/Malo = Rojo · Regular = Amarillo · Bueno/Muy bueno = Verde.
- Umbrales NPS: **≥ 50** Excelente (verde) · **0 a 49** Aceptable (amarillo) · **< 0** Crítico (rojo).
