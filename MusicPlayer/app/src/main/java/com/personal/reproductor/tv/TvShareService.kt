package com.personal.reproductor.tv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.personal.reproductor.MainActivity
import com.personal.reproductor.R

/**
 * Mantiene el servidor para la TV en marcha aunque la pantalla del teléfono se apague
 * (servicio en primer plano con notificación y Wi-Fi activo).
 */
class TvShareService : Service() {

    private var server: TvShareServer? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
        startServer()
        acquireLocks()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            TvShare.setEnabled(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        updateNotification()
        return START_STICKY
    }

    private fun startServer() {
        var lastError: String? = null
        for (port in TvShare.PORT until TvShare.PORT + 8) {
            try {
                val s = TvShareServer(applicationContext, port)
                s.start(SOCKET_TIMEOUT_MS, false)
                server = s
                TvShare.setRunning(this, true, port)
                updateNotification()
                Log.i(TAG, "Servidor para la TV en el puerto $port")
                return
            } catch (e: Exception) {
                lastError = e.message
            }
        }
        TvShare.setRunning(this, false, TvShare.PORT, lastError ?: "No se pudo abrir el puerto")
    }

    @Suppress("DEPRECATION")
    private fun acquireLocks() {
        try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "pipo:tv").apply {
                setReferenceCounted(false)
                acquire()
            }
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pipo:tv").apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Sin bloqueo de Wi-Fi", e)
        }
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        try {
            wifiLock?.release()
            wakeLock?.release()
        } catch (_: Exception) {
        }
        TvShare.setRunning(this, false, TvShare.status.value.port)
        super.onDestroy()
    }

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Pipo en la TV", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Aviso mientras el teléfono comparte su música con la TV"
                    setShowBadge(false)
                },
            )
        }
    }

    private fun buildNotification(): Notification {
        val s = TvShare.status.value
        val address = s.addresses.firstOrNull()?.let { if (s.port != TvShare.PORT) "$it:${s.port}" else it } ?: "sin Wi-Fi"
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, TvShareService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_tv_share)
            .setContentTitle("Compartiendo tu música con la TV")
            .setContentText("En la TV escribe $address · código ${TvShare.pin(this)}")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(0, "Dejar de compartir", stop)
            .build()
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
    }

    companion object {
        private const val TAG = "TvShareService"
        private const val CHANNEL = "pipo_tv"
        private const val NOTIFICATION_ID = 4821
        private const val ACTION_STOP = "com.personal.reproductor.tv.STOP"
        private const val SOCKET_TIMEOUT_MS = 60_000

        fun start(context: Context) {
            TvShare.setEnabled(context, true)
            ContextCompat.startForegroundService(context, Intent(context, TvShareService::class.java))
        }

        fun stop(context: Context) {
            TvShare.setEnabled(context, false)
            context.stopService(Intent(context, TvShareService::class.java))
        }

        fun refreshNotification(context: Context) {
            if (TvShare.status.value.running) {
                context.startService(Intent(context, TvShareService::class.java))
            }
        }
    }
}
