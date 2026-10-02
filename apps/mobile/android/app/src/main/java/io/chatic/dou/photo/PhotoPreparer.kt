package io.chatic.dou.photo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import io.chatic.dou.photo.core.PhotoLibraryCore
import io.chatic.dou.photo.core.PhotoLibraryCore.Export
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Turns a photo into the form it leaves the device in: location removed, HEIC and the other formats
 * the server refuses written as JPEG, camera RAW scaled down ([PhotoLibraryCore.export] decides which).
 *
 * One code path for every photo the shell hands the web — the in-app grid's `ReadPhoto` and the
 * attachment picker's photos — so a photo picked either way goes up the same. [uri] may be a
 * MediaStore row or a `file://` copy; both are read through the content resolver.
 */
class PhotoPreparer(private val context: Context) {

    companion object {
        private const val TAG = "PhotoPreparer"
    }

    /** The bytes to send, their type, and the extension the file name should carry. */
    data class Prepared(val bytes: ByteArray, val mimeType: String, val extension: String)

    /**
     * The photo's bytes in the form [export] chose, then checked once more for a location: one that
     * still has it is redrawn as a new JPEG, which carries no metadata at all, and refused (null) if
     * even that keeps it. Android 10+ already hides the location from apps without
     * ACCESS_MEDIA_LOCATION, which this app does not ask for; the check covers older versions, a copy
     * the redaction missed, and a file copied out of the system picker, which keeps its EXIF.
     *
     * [width] and [height] are the stored size when known (0 otherwise); before ImageDecoder they keep
     * a decode within the pixel budget.
     */
    fun prepare(uri: Uri, export: Export, width: Int, height: Int): Prepared? {
        // The stored bytes are read only when they are what goes up; a photo converted to JPEG is
        // decoded from the URI instead, so its original is never held alongside the bitmap.
        val stored = { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
        val prepared = when (export) {
            is Export.Original -> stored()?.let { Prepared(it, export.mimeType, export.extension) }
            is Export.StripLocation -> stored()?.let { withoutLocation(it) }?.let { Prepared(it, export.mimeType, export.extension) }
                ?: jpeg(uri, null, width, height)?.let { Prepared(it, "image/jpeg", "jpg") }
            is Export.Jpeg -> jpeg(uri, export.maxEdge, width, height)?.let { Prepared(it, "image/jpeg", "jpg") }
        } ?: return null
        if (!hasLocation(prepared.bytes)) return prepared
        val redrawn = jpeg(uri, null, width, height)?.takeIf { !hasLocation(it) } ?: return null
        return Prepared(redrawn, "image/jpeg", "jpg")
    }

    private val gpsTags = listOf(
        ExifInterface.TAG_GPS_VERSION_ID, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LATITUDE,
        ExifInterface.TAG_GPS_LONGITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF,
        ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_SATELLITES,
        ExifInterface.TAG_GPS_STATUS, ExifInterface.TAG_GPS_MEASURE_MODE, ExifInterface.TAG_GPS_DOP,
        ExifInterface.TAG_GPS_SPEED_REF, ExifInterface.TAG_GPS_SPEED, ExifInterface.TAG_GPS_TRACK_REF,
        ExifInterface.TAG_GPS_TRACK, ExifInterface.TAG_GPS_IMG_DIRECTION_REF, ExifInterface.TAG_GPS_IMG_DIRECTION,
        ExifInterface.TAG_GPS_MAP_DATUM, ExifInterface.TAG_GPS_DEST_LATITUDE_REF, ExifInterface.TAG_GPS_DEST_LATITUDE,
        ExifInterface.TAG_GPS_DEST_LONGITUDE_REF, ExifInterface.TAG_GPS_DEST_LONGITUDE, ExifInterface.TAG_GPS_DEST_BEARING_REF,
        ExifInterface.TAG_GPS_DEST_BEARING, ExifInterface.TAG_GPS_DEST_DISTANCE_REF, ExifInterface.TAG_GPS_DEST_DISTANCE,
        ExifInterface.TAG_GPS_PROCESSING_METHOD, ExifInterface.TAG_GPS_AREA_INFORMATION, ExifInterface.TAG_GPS_DATESTAMP,
        ExifInterface.TAG_GPS_DIFFERENTIAL, ExifInterface.TAG_GPS_H_POSITIONING_ERROR,
    )

    /**
     * The same image with its GPS tags removed. ExifInterface rewrites only the metadata of a JPEG or
     * PNG, so the pixels stay as they were and the orientation tag stays for the web to apply. It
     * saves only to a file, hence the round trip through the cache directory.
     */
    private fun withoutLocation(data: ByteArray): ByteArray? {
        val file = File.createTempFile("photo-", ".img", context.cacheDir)
        return try {
            file.writeBytes(data)
            val exif = ExifInterface(file)
            for (tag in gpsTags) exif.setAttribute(tag, null)
            if (PhotoLibraryCore.xmpHasLocation(exif.getAttribute(ExifInterface.TAG_XMP))) {
                exif.setAttribute(ExifInterface.TAG_XMP, null)
            }
            exif.saveAttributes()
            file.readBytes()
        } catch (e: Exception) {
            Log.w(TAG, "location removal failed: ${e.javaClass.simpleName}")
            null
        } finally {
            file.delete()
        }
    }

    private fun hasLocation(data: ByteArray): Boolean = try {
        val exif = ExifInterface(ByteArrayInputStream(data))
        exif.latLong != null || PhotoLibraryCore.xmpHasLocation(exif.getAttribute(ExifInterface.TAG_XMP))
    } catch (e: Exception) {
        false
    }

    /**
     * The photo decoded upright and encoded as JPEG, its long edge at most [maxEdge] when given, and
     * never more pixels than one decode may hold. A new bitmap carries no metadata, so the orientation
     * is in the pixels and nothing else comes along. Out of memory propagates, so the read fails as a
     * read rather than being mistaken for an image that cannot be decoded.
     */
    private fun jpeg(uri: Uri, maxEdge: Int?, width: Int, height: Int): ByteArray? = try {
        val bitmap = if (Build.VERSION.SDK_INT >= 28) {
            val source = ImageDecoder.createSource(context.contentResolver, uri)
            ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                PhotoLibraryCore.decodeTarget(info.size.width, info.size.height, maxEdge)?.let { (targetWidth, targetHeight) ->
                    decoder.setTargetSize(targetWidth, targetHeight)
                }
            }
        } else {
            decodeUpright(uri, maxEdge ?: budgetEdge(width, height))
        }
        bitmap?.let { encodeJpeg(it, PhotoLibraryCore.JPEG_QUALITY).also { _ -> it.recycle() } }
    } catch (e: Exception) {
        Log.w(TAG, "jpeg conversion failed: ${e.javaClass.simpleName}")
        null
    }

    /** The long edge that keeps a pre-ImageDecoder decode within the pixel budget; null when it fits. */
    private fun budgetEdge(width: Int, height: Int): Int? =
        PhotoLibraryCore.decodeTarget(width, height, null)?.let { (targetWidth, targetHeight) -> maxOf(targetWidth, targetHeight) }

    /**
     * Before ImageDecoder: BitmapFactory, subsampled toward [maxEdge] and then scaled to it exactly,
     * rotated by the EXIF orientation.
     */
    fun decodeUpright(uri: Uri, maxEdge: Int?): Bitmap? {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val options = BitmapFactory.Options().apply {
            inSampleSize = if (maxEdge != null) PhotoLibraryCore.sampleSize(bounds.outWidth, bounds.outHeight, maxEdge) else 1
        }
        var bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
        if (maxEdge != null) {
            PhotoLibraryCore.decodeTarget(bitmap.width, bitmap.height, maxEdge)?.let { (width, height) ->
                val scaled = Bitmap.createScaledBitmap(bitmap, width, height, true)
                if (scaled !== bitmap) bitmap.recycle()
                bitmap = scaled
            }
        }
        val degrees = resolver.openInputStream(uri)?.use { ExifInterface(it).rotationDegrees } ?: 0
        if (degrees == 0) return bitmap
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }

    /**
     * JPEG has no transparency: a transparent pixel would come out black, so an image with alpha is
     * drawn over white first, the way a viewer shows it.
     */
    fun encodeJpeg(bitmap: Bitmap, quality: Int): ByteArray {
        val opaque = if (bitmap.hasAlpha()) {
            Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888).also { canvasBitmap ->
                Canvas(canvasBitmap).apply {
                    drawColor(Color.WHITE)
                    drawBitmap(bitmap, 0f, 0f, null)
                }
            }
        } else {
            bitmap
        }
        return ByteArrayOutputStream().use { out ->
            opaque.compress(Bitmap.CompressFormat.JPEG, quality, out)
            if (opaque !== bitmap) opaque.recycle()
            out.toByteArray()
        }
    }
}
