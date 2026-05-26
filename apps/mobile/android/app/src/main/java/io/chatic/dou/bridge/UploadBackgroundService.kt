package io.chatic.dou.bridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class UploadBackgroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private val CHANNEL_ID = "upload_channel"
    private val NOTIFICATION_ID = 1001

    // Tracks concurrent active uploads: uploadId -> Pair(fileName, progress)
    private val activeUploads = HashMap<String, Pair<String, Double>>()

    companion object {
        const val ACTION_START_OR_UPDATE = "io.chatic.dou.action.START_OR_UPDATE"
        const val ACTION_STOP = "io.chatic.dou.action.STOP"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_START_OR_UPDATE) {
            val uploadId = intent.getStringExtra("uploadId") ?: ""
            val fileName = intent.getStringExtra("fileName") ?: "파일"
            val progress = intent.getDoubleExtra("progress", 0.0)

            if (uploadId.isNotEmpty()) {
                activeUploads[uploadId] = Pair(fileName, progress)
            }

            val notification = buildNotification()
            startForeground(NOTIFICATION_ID, notification)
        } else if (action == ACTION_STOP) {
            val uploadId = intent.getStringExtra("uploadId") ?: ""
            if (uploadId.isNotEmpty()) {
                activeUploads.remove(uploadId)
            }

            if (activeUploads.isEmpty()) {
                stopForeground(true)
                stopSelf()
            } else {
                val notification = buildNotification()
                startForeground(NOTIFICATION_ID, notification)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "파일 업로드"
            val descriptionText = "백그라운드 파일 업로드 상태를 표시합니다."
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val size = activeUploads.size
        val title = "파일 업로드 중"
        val contentText: String
        val progressPercent: Int

        if (size == 1) {
            val single = activeUploads.values.first()
            progressPercent = (single.second * 100).toInt().coerceIn(0, 100)
            contentText = "${single.first} (${progressPercent}%)"
        } else if (size > 1) {
            val avgProgress = activeUploads.values.map { it.second }.average()
            progressPercent = (avgProgress * 100).toInt().coerceIn(0, 100)
            contentText = "${size}개 파일 업로드 중... (평균 ${progressPercent}%)"
        } else {
            progressPercent = 0
            contentText = "준비 중..."
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setProgress(100, progressPercent, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Chatic:UploadWakeLock").apply {
                acquire(30 * 60 * 1000L) // 30 minutes timeout
            }
        }
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        wakeLock = null
    }
}
