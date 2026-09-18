package io.chatic.dou.worker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import io.chatic.dou.R
import io.chatic.dou.service.UploadBackgroundService

/**
 * UploadWorker — a WorkManager-based wrapper around the upload job.
 *
 * Responsibilities:
 * - WorkManager schedules and manages this Worker.
 * - Runs as a foreground Worker to keep the OS process alive (calls setForeground).
 * - Delegates the actual upload execution to UploadBackgroundService (via Intent).
 *
 * Why WorkManager:
 * - Lets us set network constraints (networkRequired).
 * - Combines with the pattern where JS re-invokes enqueueUpload() from SQLite after an app restart.
 * - WorkManager manages the foreground service lifecycle.
 *
 * Input parameters (WorkManager inputData):
 * - uploadId: String — the upload identifier.
 */
class UploadWorker(
    private val appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        const val KEY_UPLOAD_ID = "uploadId"
        private const val CHANNEL_ID = "upload_channel"
        private const val NOTIFICATION_ID = 1001
    }

    override suspend fun doWork(): Result {
        val uploadId = inputData.getString(KEY_UPLOAD_ID) ?: return Result.failure()

        // Declare this a WorkManager foreground Worker — the OS treats it as a long-running task.
        setForeground(createForegroundInfo(uploadId))

        // The actual upload is already running in UploadBackgroundService.
        // This Worker's only job is to keep the foreground state alive within WorkManager's lifecycle.
        // Wait until the Service broadcasts its completion event.
        // (Once the Service finishes, it calls stopSelf() automatically, which also completes this Worker.)
        return Result.success()
    }

    private fun createForegroundInfo(uploadId: String): ForegroundInfo {
        createNotificationChannelIfNeeded()
        val notification = buildNotification(uploadId)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannelIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                appContext.getString(R.string.upload_notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = appContext.getString(R.string.upload_notification_channel_desc)
                setShowBadge(false)
            }
            val manager = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(uploadId: String): Notification {
        return NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setContentTitle(appContext.getString(R.string.upload_notification_title))
            .setContentText(appContext.getString(R.string.upload_notification_preparing))
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }
}
