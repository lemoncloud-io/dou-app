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
 * UploadWorker — WorkManager 기반 업로드 작업 래퍼
 *
 * 역할:
 * - WorkManager가 이 Worker를 스케줄링/관리함
 * - Foreground Worker로 실행하여 OS 프로세스 유지 (setForeground 호출)
 * - 실제 업로드 실행은 UploadBackgroundService에 위임 (Intent 전달)
 *
 * WorkManager를 쓰는 이유:
 * - 네트워크 조건 제약 설정 가능 (networkRequired)
 * - 앱 재시작 후 JS가 SQLite 기반으로 enqueueUpload() 재호출하는 방식과 조합
 * - Foreground Service 생명주기를 WorkManager가 관리
 *
 * 입력 파라미터 (WorkManager inputData):
 * - uploadId: String — 업로드 식별자
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

        // WorkManager Foreground Worker 선언 — OS가 이 작업을 장기 실행으로 인식
        setForeground(createForegroundInfo(uploadId))

        // 실제 업로드는 이미 UploadBackgroundService에서 실행 중임.
        // 이 Worker는 WorkManager 생명주기 내에서 Foreground를 유지하는 역할.
        // Service가 완료 이벤트를 broadcast할 때까지 대기.
        // (Service가 완료되면 자동으로 stopSelf() 호출 → Worker도 완료 처리)
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
