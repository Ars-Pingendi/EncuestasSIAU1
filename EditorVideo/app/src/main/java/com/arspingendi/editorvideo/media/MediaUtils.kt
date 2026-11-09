package com.arspingendi.editorvideo.media

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import java.io.File

data class VideoInfo(
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val hasAudio: Boolean,
    val hasVideo: Boolean,
)

object MediaUtils {

    const val ALBUM = "EditorVideo"

    fun readInfo(context: Context, uri: Uri): VideoInfo? {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(context, uri)
            fun key(k: Int) = r.extractMetadata(k)
            val duration = key(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            var w = key(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            var h = key(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            val rot = key(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            if (rot % 180 != 0) { val t = w; w = h; h = t }
            VideoInfo(
                durationMs = duration,
                width = w,
                height = h,
                hasAudio = key(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes",
                hasVideo = key(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes",
            )
        } catch (e: Exception) {
            null
        } finally {
            runCatching { r.release() }
        }
    }

    fun thumbnail(context: Context, uri: Uri, timeMs: Long, maxSize: Int = 240): Bitmap? {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(context, uri)
            val us = timeMs * 1000
            if (Build.VERSION.SDK_INT >= 27) {
                r.getScaledFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, maxSize, maxSize)
            } else {
                r.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let { scaleDown(it, maxSize) }
            }
        } catch (e: Exception) {
            null
        } finally {
            runCatching { r.release() }
        }
    }

    fun loadBitmap(context: Context, uri: Uri, maxSize: Int): Bitmap? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxSize || bounds.outHeight / (sample * 2) >= maxSize) sample *= 2
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
    } catch (e: Exception) {
        null
    }

    private fun scaleDown(b: Bitmap, maxSize: Int): Bitmap {
        val s = maxSize.toFloat() / maxOf(b.width, b.height)
        if (s >= 1f) return b
        return Bitmap.createScaledBitmap(b, (b.width * s).toInt().coerceAtLeast(1), (b.height * s).toInt().coerceAtLeast(1), true)
    }

    fun displayName(context: Context, uri: Uri): String? = try {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        }
    } catch (e: Exception) {
        null
    }

    /** Copia el archivo exportado a la galería pública (Películas/EditorVideo o Música/EditorVideo). */
    fun saveToGallery(context: Context, file: File, isAudio: Boolean): Uri {
        val mime = if (isAudio) "audio/mp4" else "video/mp4"
        if (Build.VERSION.SDK_INT >= 29) {
            val resolver = context.contentResolver
            val collection = if (isAudio)
                MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            else MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    (if (isAudio) Environment.DIRECTORY_MUSIC else Environment.DIRECTORY_MOVIES) + "/" + ALBUM
                )
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(collection, values) ?: error("No se pudo crear el archivo en la galería")
            resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return uri
        } else {
            @Suppress("DEPRECATION")
            val dir = File(
                Environment.getExternalStoragePublicDirectory(
                    if (isAudio) Environment.DIRECTORY_MUSIC else Environment.DIRECTORY_MOVIES
                ), ALBUM
            )
            dir.mkdirs()
            val dest = File(dir, file.name)
            file.copyTo(dest, overwrite = true)
            MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf(mime), null)
            return FileProvider.getUriForFile(context, context.packageName + ".fileprovider", dest)
        }
    }

    fun shareIntent(uri: Uri, mime: String): Intent =
        Intent.createChooser(
            Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }, null
        )

    fun viewIntent(uri: Uri, mime: String): Intent =
        Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
}
