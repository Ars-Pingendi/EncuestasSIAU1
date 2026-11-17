package com.personal.reproductor.playback

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSpec
import com.personal.reproductor.data.youtube.YouTubeRepository
import java.io.IOException
import java.io.InputStream

/**
 * Fuente de datos de ExoPlayer para los archivos de video y audio de YouTube.
 * Pide a YouTube fragmentos de 1 MB (como la descarga), porque un solo golpe se corta o se estrangula.
 * Cada dirección «pipoytv://…» se asocia de antemano con su archivo en [sources].
 */
@UnstableApi
class YouTubeRangeDataSource(
    private val repository: YouTubeRepository,
    private val sources: Map<Uri, YouTubeRepository.DownloadSource>,
) : BaseDataSource(/* isNetwork = */ true) {

    private var stream: InputStream? = null
    private var currentUri: Uri? = null
    private var remaining = 0L

    override fun open(dataSpec: DataSpec): Long {
        val source = sources[dataSpec.uri] ?: throw IOException("Archivo de YouTube desconocido: ${dataSpec.uri}")
        currentUri = dataSpec.uri
        transferInitializing(dataSpec)
        val total = source.contentLength
        if (total <= 0) throw IOException("YouTube no indicó el tamaño del archivo")
        val start = dataSpec.position
        if (start >= total) throw IOException("Posición fuera del archivo")
        val end = if (dataSpec.length != C.LENGTH_UNSET.toLong()) minOf(start + dataSpec.length - 1, total - 1) else total - 1
        remaining = end - start + 1
        stream = repository.openRange(source, start, end)
        transferStarted(dataSpec)
        return remaining
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (remaining == 0L) return C.RESULT_END_OF_INPUT
        val n = stream?.read(buffer, offset, minOf(length.toLong(), remaining).toInt()) ?: return C.RESULT_END_OF_INPUT
        if (n < 0) return C.RESULT_END_OF_INPUT
        remaining -= n
        bytesTransferred(n)
        return n
    }

    override fun getUri(): Uri? = currentUri

    override fun close() {
        try {
            stream?.close()
        } finally {
            stream = null
            currentUri = null
            transferEnded()
        }
    }
}
