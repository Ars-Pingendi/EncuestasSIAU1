package com.personal.reproductor.ui

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.LruCache
import android.util.Size
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections

/** Carga carátulas (embebidas o de la carpeta) con caché en memoria. */
object ArtworkLoader {

    private val cache = object : LruCache<String, Bitmap>(
        maxOf(8 * 1024 * 1024, (Runtime.getRuntime().maxMemory() / 8).toInt()),
    ) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
    private val misses: MutableSet<String> = Collections.synchronizedSet(HashSet())
    private val albumArtBase: Uri = Uri.parse("content://media/external/audio/albumart")

    private fun bucket(px: Int) = when {
        px <= 160 -> 160
        px <= 400 -> 400
        else -> 800
    }

    private fun key(trackId: Long, albumId: Long, bucket: Int) =
        if (albumId > 0) "a$albumId:$bucket" else "t$trackId:$bucket"

    fun peek(trackId: Long, albumId: Long, px: Int, url: String? = null): Bitmap? =
        cache.get(if (url != null) "u$url:${bucket(px)}" else key(trackId, albumId, bucket(px)))

    /** Carátula remota (miniatura de YouTube). Los fallos no se recuerdan: puede volver la conexión. */
    suspend fun loadUrl(url: String, px: Int): Bitmap? = withContext(Dispatchers.IO) {
        val b = bucket(px)
        val k = "u$url:$b"
        cache.get(k)?.let { return@withContext it }
        val bmp = try {
            downloadSampled(url, b)
        } catch (_: Exception) {
            null
        }
        if (bmp != null) cache.put(k, bmp)
        bmp
    }

    private fun downloadSampled(url: String, target: Int): Bitmap? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("User-Agent", "Mozilla/5.0")
        }
        try {
            if (conn.responseCode !in 200..299) return null
            val bytes = conn.inputStream.use { it.readBytes() }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= target && bounds.outHeight / (sample * 2) >= target) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
        } finally {
            conn.disconnect()
        }
    }

    suspend fun load(context: Context, trackId: Long, albumId: Long, px: Int): Bitmap? =
        withContext(Dispatchers.IO) {
            val b = bucket(px)
            val k = key(trackId, albumId, b)
            cache.get(k)?.let { return@withContext it }
            if (k in misses) return@withContext null
            val bmp = decode(context, trackId, albumId, b)
            if (bmp != null) cache.put(k, bmp) else misses.add(k)
            bmp
        }

    private fun decode(context: Context, trackId: Long, albumId: Long, size: Int): Bitmap? {
        val resolver = context.contentResolver
        val trackUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, trackId)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                return resolver.loadThumbnail(trackUri, Size(size, size), null)
            } catch (_: Exception) {
            }
        }
        if (albumId > 0) {
            try {
                return decodeSampled(resolver, ContentUris.withAppendedId(albumArtBase, albumId), size)
            } catch (_: Exception) {
            }
        }
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(context, trackUri)
            val bytes = retriever.embeddedPicture ?: return null
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (_: Exception) {
            return null
        } finally {
            try {
                retriever.release()
            } catch (_: Exception) {
            }
        }
    }

    private fun decodeSampled(resolver: ContentResolver, uri: Uri, target: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= target && bounds.outHeight / (sample * 2) >= target) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        return resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
    }
}

/**
 * Carátula cuadrada. El tamaño en pantalla lo da el [modifier]; [requestPx] solo indica
 * la resolución a decodificar (160 = miniatura, 400 = tarjeta, 800 = pantalla completa).
 */
@Composable
fun Artwork(
    trackId: Long,
    albumId: Long,
    modifier: Modifier = Modifier,
    requestPx: Int = 160,
    shape: Shape = RoundedCornerShape(8.dp),
    artworkUrl: String? = null,
) {
    val context = LocalContext.current
    val url = artworkUrl?.takeIf { it.startsWith("http") }
    val bitmap by produceState<Bitmap?>(
        initialValue = ArtworkLoader.peek(trackId, albumId, requestPx, url),
        trackId, albumId, requestPx, url,
    ) {
        value = if (url != null) {
            ArtworkLoader.loadUrl(url, requestPx)
        } else {
            ArtworkLoader.load(context, trackId, albumId, requestPx)
        } ?: value
    }

    Box(
        modifier = modifier
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        val current = bitmap
        if (current != null) {
            val image = remember(current) { current.asImageBitmap() }
            Image(
                bitmap = image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Icon(
                imageVector = Icons.Filled.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                modifier = Modifier.fillMaxSize(0.5f),
            )
        }
    }
}
