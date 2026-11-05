package com.personal.reproductor.ui

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Lógica de "arrastrar para reordenar" sobre una LazyColumn.
 *
 * El elemento arrastrado sigue al dedo (se dibuja desplazado), y cuando su centro cruza a otro
 * elemento se avisa con [onSwap] para que la pantalla reordene su copia local de la lista.
 * Al soltar se llama a [onDrop] con las posiciones inicial y final.
 *
 * [headerCount] es la cantidad de elementos fijos al inicio de la lista (cabeceras) que no se reordenan.
 */
@Stable
class DragReorderState(
    private val listState: LazyListState,
    private val headerCount: Int,
    private val onSwap: (from: Int, to: Int) -> Unit,
    private val onDrop: (from: Int, to: Int) -> Unit,
) {
    var draggedKey: Any? by mutableStateOf(null)
        private set

    /** Posición superior (px, en coordenadas de la lista visible) que debe tener el elemento arrastrado. */
    private var dragTop by mutableFloatStateOf(0f)
    private var originalIndex = -1
    private var expectedIndex = -1

    fun start(key: Any) {
        val info = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == key } ?: return
        draggedKey = key
        dragTop = info.offset.toFloat()
        originalIndex = info.index - headerCount
        expectedIndex = info.index
    }

    fun drag(deltaY: Float) {
        if (draggedKey == null) return
        dragTop += deltaY
        checkSwap()
    }

    fun end() {
        if (draggedKey == null) return
        val from = originalIndex
        val to = expectedIndex - headerCount
        draggedKey = null
        originalIndex = -1
        expectedIndex = -1
        if (from >= 0 && to >= 0) onDrop(from, to)
    }

    /** Desplazamiento vertical (px) que debe aplicarse al elemento [key] para que siga al dedo. */
    fun translationFor(key: Any): Float {
        if (draggedKey != key) return 0f
        val info = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == key } ?: return 0f
        return dragTop - info.offset
    }

    private fun checkSwap() {
        val key = draggedKey ?: return
        val infos = listState.layoutInfo.visibleItemsInfo
        val current = infos.firstOrNull { it.key == key } ?: return
        // Si el último intercambio aún no se refleja en el diseño, se espera al siguiente cuadro.
        if (current.index != expectedIndex) return
        val center = dragTop + current.size / 2f
        val target = infos.firstOrNull {
            it.index >= headerCount && it.key != key && center >= it.offset && center < it.offset + it.size
        } ?: return
        onSwap(current.index - headerCount, target.index - headerCount)
        expectedIndex = target.index
    }

    /** Mientras se arrastra, desplaza la lista si el elemento llega cerca del borde. */
    suspend fun autoScrollWhileDragging() {
        while (true) {
            val key = draggedKey ?: return
            val layout = listState.layoutInfo
            val item = layout.visibleItemsInfo.firstOrNull { it.key == key }
            if (item != null) {
                val bottom = dragTop + item.size
                val delta = when {
                    dragTop < layout.viewportStartOffset + EDGE_PX -> -SCROLL_STEP_PX
                    bottom > layout.viewportEndOffset - EDGE_PX -> SCROLL_STEP_PX
                    else -> 0f
                }
                if (delta != 0f) {
                    listState.scrollBy(delta)
                    checkSwap()
                }
            }
            delay(16)
        }
    }

    private companion object {
        const val EDGE_PX = 40f
        const val SCROLL_STEP_PX = 16f
    }
}

@Composable
fun rememberDragReorderState(
    listState: LazyListState,
    headerCount: Int,
    onSwap: (from: Int, to: Int) -> Unit,
    onDrop: (from: Int, to: Int) -> Unit,
): DragReorderState {
    val currentSwap by rememberUpdatedState(onSwap)
    val currentDrop by rememberUpdatedState(onDrop)
    val state = remember(listState, headerCount) {
        DragReorderState(
            listState,
            headerCount,
            onSwap = { from, to -> currentSwap(from, to) },
            onDrop = { from, to -> currentDrop(from, to) },
        )
    }
    LaunchedEffect(state.draggedKey) {
        if (state.draggedKey != null) state.autoScrollWhileDragging()
    }
    return state
}

/** Asa de arrastre: al moverla, el elemento [key] se reordena. */
@Composable
fun DragHandle(key: Any, reorder: DragReorderState, modifier: Modifier = Modifier) {
    Icon(
        imageVector = Icons.Filled.DragHandle,
        contentDescription = "Arrastrar para reordenar",
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
            .size(44.dp)
            .pointerInput(key) {
                detectDragGestures(
                    onDragStart = { reorder.start(key) },
                    onDrag = { change, amount ->
                        change.consume()
                        reorder.drag(amount.y)
                    },
                    onDragEnd = { reorder.end() },
                    onDragCancel = { reorder.end() },
                )
            }
            .padding(10.dp),
    )
}
