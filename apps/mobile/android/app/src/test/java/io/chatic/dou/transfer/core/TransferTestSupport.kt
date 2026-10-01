package io.chatic.dou.transfer.core

import org.junit.Assert.assertEquals
import org.junit.Assert.fail

/** A clock the test moves by hand. */
class FakeClock(var now: Long = 1_000L) {
    fun advance(ms: Long) {
        now += ms
    }
}

fun newCore(clock: FakeClock, log: MutableList<String> = mutableListOf()) =
    TransferCore(clock = { clock.now }, log = { log.add(it) })

fun upload(
    transferId: String? = "t1",
    contentLength: Double? = 100.0,
    direction: String? = "upload",
    method: String? = "PUT",
    fileUri: String? = "file:///data/user/0/app/cache/a.bin",
    title: String? = null,
    headers: Map<String, String> = emptyMap(),
    contentType: String? = null,
    url: String? = "https://bucket.example.com/key?X-Amz-Signature=secret",
) = TransferRequest(
    transferId = transferId,
    direction = direction,
    url = url,
    method = method,
    headers = headers,
    fileUri = fileUri,
    contentType = contentType,
    contentLength = contentLength,
    title = title,
)

fun download(
    transferId: String? = "d1",
    method: String? = "GET",
    fileUri: String? = null,
    fileName: String? = "photo.png",
    headers: Map<String, String> = emptyMap(),
    url: String? = "https://bucket.example.com/key?X-Amz-Signature=secret",
) = TransferRequest(
    transferId = transferId,
    direction = "download",
    url = url,
    method = method,
    headers = headers,
    fileUri = fileUri,
    contentLength = null,
    fileName = fileName,
)

/** A committed download's file, as the OS layer would report it. */
fun downloadedFile(name: String = "photo.png") =
    DownloadedFile(uri = "file:///data/user/0/app/cache/transfer-download/x/$name", size = 42, contentType = "image/png")

/** Runs [block] and asserts it was refused with [code]. */
fun assertRejected(code: TransferErrorCode, block: () -> Unit) {
    try {
        block()
    } catch (e: TransferRejectedException) {
        assertEquals(code, e.code)
        return
    }
    fail("expected a $code rejection")
}
