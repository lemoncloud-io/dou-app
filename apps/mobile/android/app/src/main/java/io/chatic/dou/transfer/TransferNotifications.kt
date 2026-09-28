package io.chatic.dou.transfer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.annotation.StringRes
import androidx.core.app.NotificationCompat
import io.chatic.dou.R
import io.chatic.dou.transfer.core.FailureNotice
import io.chatic.dou.transfer.core.ProgressNotice
import io.chatic.dou.transfer.core.TransferDirection

/**
 * Turns the core's notice decisions into Android notifications.
 *
 * Only a transfer's `title` or a direction-specific default is ever shown — never a URL, a path or
 * a transfer id — because the notification is visible on the lock screen.
 */
class TransferNotifications(private val context: Context) {

    companion object {
        const val CHANNEL_ID = "transfer_channel"
        const val PROGRESS_NOTIFICATION_ID = 1001
        const val SUMMARY_NOTIFICATION_ID = 1002
    }

    private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.transfer_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.transfer_notification_channel_desc)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * The ongoing notification. [notice] is null only if nothing is running at the instant the
     * service enters the foreground (it stops right after); the upload wording stands in.
     */
    fun progress(notice: ProgressNotice?, cancelIntent: PendingIntent): Notification {
        val words = wording(notice?.direction)
        val percent = notice?.percent
        val builder = baseBuilder(notice?.direction)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .addAction(0, context.getString(R.string.transfer_notification_cancel), cancelIntent)

        if (notice == null || notice.runningCount <= 1) {
            builder.setContentTitle(notice?.title ?: context.getString(words.defaultTitle))
            builder.setContentText(
                if (percent != null) context.getString(words.progress, percent) else context.getString(words.pending),
            )
        } else {
            builder.setContentTitle(context.getString(words.multiple, notice.runningCount))
            if (percent != null) builder.setContentText(context.getString(R.string.transfer_percent, percent))
        }
        if (percent != null) builder.setProgress(100, percent, false) else builder.setProgress(0, 0, true)
        return builder.build()
    }

    /** The single non-ongoing summary left behind by a batch that had failures. */
    fun postFailureSummary(notice: FailureNotice) {
        val text = context.getString(wording(notice.direction).failedSummary, notice.failed, notice.total)
        val notification = baseBuilder(notice.direction)
            .setContentTitle(text)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .build()
        try {
            manager.notify(SUMMARY_NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // No notification permission: the result is still in the registry for the web to read.
        }
    }

    fun update(notification: Notification) {
        try {
            manager.notify(PROGRESS_NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // Showing progress is optional; the transfer never depends on the notification.
        }
    }

    private fun baseBuilder(direction: TransferDirection?): NotificationCompat.Builder {
        val icon = if (direction == TransferDirection.DOWNLOAD) android.R.drawable.stat_sys_download else android.R.drawable.stat_sys_upload
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(icon)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        openAppIntent()?.let { builder.setContentIntent(it) }
        return builder
    }

    private fun openAppIntent(): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        return PendingIntent.getActivity(
            context,
            0,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    /** String resources per direction; null (both directions at once) uses the neutral wording. */
    private class Wording(
        @StringRes val defaultTitle: Int,
        @StringRes val progress: Int,
        @StringRes val pending: Int,
        @StringRes val multiple: Int,
        @StringRes val failedSummary: Int,
    )

    private fun wording(direction: TransferDirection?): Wording = when (direction) {
        TransferDirection.DOWNLOAD -> Wording(
            R.string.transfer_download_default_title,
            R.string.transfer_download_progress,
            R.string.transfer_download_pending,
            R.string.transfer_download_multiple,
            R.string.transfer_download_failed_summary,
        )
        // A single transfer always has one direction, so only the multi-transfer strings need a
        // neutral form.
        null -> Wording(
            R.string.transfer_upload_default_title,
            R.string.transfer_upload_progress,
            R.string.transfer_upload_pending,
            R.string.transfer_mixed_multiple,
            R.string.transfer_mixed_failed_summary,
        )
        TransferDirection.UPLOAD -> Wording(
            R.string.transfer_upload_default_title,
            R.string.transfer_upload_progress,
            R.string.transfer_upload_pending,
            R.string.transfer_upload_multiple,
            R.string.transfer_upload_failed_summary,
        )
    }
}
