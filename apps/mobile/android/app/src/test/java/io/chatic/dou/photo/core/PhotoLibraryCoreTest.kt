package io.chatic.dou.photo.core

import io.chatic.dou.photo.core.PhotoLibraryCore.Export
import io.chatic.dou.photo.core.PhotoLibraryCore.PageKey
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoLibraryCoreTest {

    // --- Access ---

    @Test
    fun fullReadIsGrantedAndTheUserSelectedReadIsLimited() {
        assertEquals("granted", PhotoLibraryCore.access(fullGranted = true, partialGranted = false))
        assertEquals("granted", PhotoLibraryCore.access(fullGranted = true, partialGranted = true))
        assertEquals("limited", PhotoLibraryCore.access(fullGranted = false, partialGranted = true))
        assertEquals("denied", PhotoLibraryCore.access(fullGranted = false, partialGranted = false))
    }

    @Test
    fun asksOnlyTheFirstTimeAndOnlyWhenNothingIsGranted() {
        assertTrue(PhotoLibraryCore.shouldAsk("denied", askedBefore = false))
        assertFalse(PhotoLibraryCore.shouldAsk("denied", askedBefore = true))
        assertFalse(PhotoLibraryCore.shouldAsk("limited", askedBefore = false))
        assertFalse(PhotoLibraryCore.shouldAsk("granted", askedBefore = false))
    }

    @Test
    fun asksForThePermissionsEachSdkLevelReadsWith() {
        assertEquals(
            listOf(PhotoLibraryCore.READ_MEDIA_IMAGES, PhotoLibraryCore.READ_MEDIA_VISUAL_USER_SELECTED),
            PhotoLibraryCore.permissionsFor(34),
        )
        assertEquals(listOf(PhotoLibraryCore.READ_MEDIA_IMAGES), PhotoLibraryCore.permissionsFor(33))
        assertEquals(listOf(PhotoLibraryCore.READ_EXTERNAL_STORAGE), PhotoLibraryCore.permissionsFor(32))
        assertEquals(listOf(PhotoLibraryCore.READ_EXTERNAL_STORAGE), PhotoLibraryCore.permissionsFor(24))
    }

    // --- Albums ---

    @Test
    fun theFixedIdAndNoIdBothMeanAllPhotos() {
        assertTrue(PhotoLibraryCore.isAllPhotos(null))
        assertTrue(PhotoLibraryCore.isAllPhotos(PhotoLibraryCore.ALL_PHOTOS_ALBUM_ID))
        assertFalse(PhotoLibraryCore.isAllPhotos("-1739773001"))
    }

    // --- Paging ---

    @Test
    fun aPageKeyRoundTrips() {
        val key = PageKey(dateAdded = 1_790_000_000, id = 42)

        assertEquals(key, PhotoLibraryCore.decode(PhotoLibraryCore.encode(key)))
    }

    @Test
    fun foreignOrBrokenCursorsDecodeToNull() {
        assertNull(PhotoLibraryCore.decode(null))
        assertNull(PhotoLibraryCore.decode(""))
        assertNull(PhotoLibraryCore.decode("60"))
        assertNull(PhotoLibraryCore.decode("60:ABC-123/L0/001"))
        assertNull(PhotoLibraryCore.decode("1:2:3"))
        assertNull(PhotoLibraryCore.decode("-1:2"))
    }

    @Test
    fun pageSizeIsNeverBelowOneOrAboveTheCap() {
        assertEquals(60, PhotoLibraryCore.pageSize(60))
        assertEquals(1, PhotoLibraryCore.pageSize(0))
        assertEquals(PhotoLibraryCore.MAX_PAGE_SIZE, PhotoLibraryCore.pageSize(10_000))
    }

    @Test
    fun theFirstPageOfTheWholeLibraryHasNoSelection() {
        val (selection, args) = PhotoLibraryCore.pageSelection(bucketId = null, after = null)

        assertNull(selection)
        assertEquals(0, args.size)
    }

    @Test
    fun aLaterPageStartsStrictlyAfterTheLastKeyWithTheIdBreakingTies() {
        val (selection, args) = PhotoLibraryCore.pageSelection(bucketId = null, after = PageKey(100, 7))

        assertEquals("(date_added < ? OR (date_added = ? AND _id < ?))", selection)
        assertArrayEquals(arrayOf("100", "100", "7"), args)
    }

    @Test
    fun anAlbumPageFiltersByBucketAsWell() {
        val (selection, args) = PhotoLibraryCore.pageSelection(bucketId = "b1", after = PageKey(100, 7))

        assertEquals("bucket_id = ? AND (date_added < ? OR (date_added = ? AND _id < ?))", selection)
        assertArrayEquals(arrayOf("b1", "100", "100", "7"), args)
    }

    // --- Export ---

    @Test
    fun serverFormatsKeepTheirBytes() {
        assertEquals(Export.StripLocation("image/jpeg", "jpg"), PhotoLibraryCore.export("image/jpeg"))
        assertEquals(Export.StripLocation("image/png", "png"), PhotoLibraryCore.export("image/png"))
        assertEquals(Export.Original("image/gif", "gif"), PhotoLibraryCore.export("image/gif"))
        assertEquals(Export.Original("image/webp", "webp"), PhotoLibraryCore.export("IMAGE/WEBP"))
    }

    @Test
    fun everythingElseBecomesJpegAtFullSize() {
        assertEquals(Export.Jpeg(null), PhotoLibraryCore.export("image/heic"))
        assertEquals(Export.Jpeg(null), PhotoLibraryCore.export("image/heif"))
        assertEquals(Export.Jpeg(null), PhotoLibraryCore.export(null))
    }

    @Test
    fun cameraRawIsRenderedAtTheCap() {
        assertEquals(Export.Jpeg(PhotoLibraryCore.RAW_MAX_EDGE), PhotoLibraryCore.export("image/x-adobe-dng"))
        assertEquals(Export.Jpeg(PhotoLibraryCore.RAW_MAX_EDGE), PhotoLibraryCore.export("image/dng"))
        assertEquals(Export.Jpeg(PhotoLibraryCore.RAW_MAX_EDGE), PhotoLibraryCore.export("image/x-sony-arw"))
        assertFalse(PhotoLibraryCore.isRaw("image/x-icon"))
    }

    // --- File name ---

    @Test
    fun fileNameTakesTheExtensionOfTheBytesSent() {
        assertEquals("IMG_0001.jpg", PhotoLibraryCore.fileName("IMG_0001.HEIC", "jpg"))
        assertEquals("cat.gif", PhotoLibraryCore.fileName("cat.gif", "gif"))
        assertEquals("archive.tar.jpg", PhotoLibraryCore.fileName("archive.tar.gz", "jpg"))
    }

    @Test
    fun missingFileNameFallsBackToPhoto() {
        assertEquals("photo.jpg", PhotoLibraryCore.fileName(null, "jpg"))
        assertEquals("photo.jpg", PhotoLibraryCore.fileName("  ", "jpg"))
        assertEquals("photo.jpg", PhotoLibraryCore.fileName(".HEIC", "jpg"))
    }

    // --- Decode helpers ---

    @Test
    fun sampleSizeHalvesWhileTheLongEdgeStaysAtOrAboveTheCap() {
        assertEquals(1, PhotoLibraryCore.sampleSize(4000, 3000, 4096))
        assertEquals(1, PhotoLibraryCore.sampleSize(8063, 6048, 4096))
        assertEquals(2, PhotoLibraryCore.sampleSize(8192, 6144, 4096))
        assertEquals(4, PhotoLibraryCore.sampleSize(16384, 100, 4096))
        assertEquals(1, PhotoLibraryCore.sampleSize(0, 0, 4096))
    }

    @Test
    fun onlyAPhotoSentAsStoredIsRefusedForItsStoredSize() {
        val over = PhotoLibraryCore.SEND_MAX_BYTES + 1

        assertTrue(PhotoLibraryCore.tooLargeToSend(over, Export.StripLocation("image/jpeg", "jpg")))
        assertTrue(PhotoLibraryCore.tooLargeToSend(over, Export.Original("image/gif", "gif")))
        assertFalse(PhotoLibraryCore.tooLargeToSend(PhotoLibraryCore.SEND_MAX_BYTES, Export.StripLocation("image/jpeg", "jpg")))
        // A converted photo's stored size says nothing about the JPEG it becomes.
        assertFalse(PhotoLibraryCore.tooLargeToSend(over, Export.Jpeg(null)))
    }

    @Test
    fun aPhotoThatFitsIsDecodedAtItsOwnSize() {
        assertNull(PhotoLibraryCore.decodeTarget(4032, 3024, maxEdge = null))
        assertNull(PhotoLibraryCore.decodeTarget(4000, 3000, maxEdge = 4096))
        assertNull(PhotoLibraryCore.decodeTarget(0, 0, maxEdge = 4096))
    }

    @Test
    fun theEdgeCapScalesTheLongEdgeDownToIt() {
        assertEquals(4096 to 3072, PhotoLibraryCore.decodeTarget(8192, 6144, maxEdge = 4096))
    }

    @Test
    fun aPhotoOverThePixelBudgetIsDecodedWithinIt() {
        // 200 MP, no edge cap: scaled to fit 24 MP.
        val (width, height) = PhotoLibraryCore.decodeTarget(16320, 12240, maxEdge = null)!!

        assertTrue(width.toLong() * height <= PhotoLibraryCore.MAX_DECODE_PIXELS)
        assertTrue(width.toLong() * height > PhotoLibraryCore.MAX_DECODE_PIXELS * 9 / 10)
        assertEquals(16320.0 / 12240, width.toDouble() / height, 0.01)
    }

    @Test
    fun anXmpPacketWithGpsTagsStillHasALocation() {
        assertTrue(PhotoLibraryCore.xmpHasLocation("<x:xmpmeta><exif:GPSLatitude>37,33.99N</exif:GPSLatitude></x:xmpmeta>"))
        assertFalse(PhotoLibraryCore.xmpHasLocation("<x:xmpmeta><xmp:CreatorTool>Camera</xmp:CreatorTool></x:xmpmeta>"))
        assertFalse(PhotoLibraryCore.xmpHasLocation(null))
    }
}
