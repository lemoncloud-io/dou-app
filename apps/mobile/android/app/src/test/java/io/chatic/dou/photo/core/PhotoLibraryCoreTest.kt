package io.chatic.dou.photo.core

import io.chatic.dou.photo.core.PhotoLibraryCore.Export
import io.chatic.dou.photo.core.PhotoLibraryCore.Grants
import io.chatic.dou.photo.core.PhotoLibraryCore.MediaTypes
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
            listOf(
                PhotoLibraryCore.READ_MEDIA_IMAGES,
                PhotoLibraryCore.READ_MEDIA_VIDEO,
                PhotoLibraryCore.READ_MEDIA_VISUAL_USER_SELECTED,
            ),
            PhotoLibraryCore.permissionsFor(34),
        )
        assertEquals(listOf(PhotoLibraryCore.READ_MEDIA_IMAGES, PhotoLibraryCore.READ_MEDIA_VIDEO), PhotoLibraryCore.permissionsFor(33))
        assertEquals(listOf(PhotoLibraryCore.READ_EXTERNAL_STORAGE), PhotoLibraryCore.permissionsFor(32))
        assertEquals(listOf(PhotoLibraryCore.READ_EXTERNAL_STORAGE), PhotoLibraryCore.permissionsFor(24))
    }

    @Test
    fun onlyARequestThatIncludesVideoSettlesTheVideoAsk() {
        assertTrue(PhotoLibraryCore.asksForVideo(34))
        assertTrue(PhotoLibraryCore.asksForVideo(33))
        assertFalse(PhotoLibraryCore.asksForVideo(32))
    }

    private val none = Grants(images = false, videos = false, userSelected = false, storage = false)

    @Test
    fun allowAllReportsUserSelectedTooAndIsStillFullAccess() {
        val allowAll = Grants(images = true, videos = true, userSelected = true, storage = false)

        assertEquals("granted", PhotoLibraryCore.photoAccess(34, allowAll))
        assertFalse(PhotoLibraryCore.partialAccess(34, allowAll))
        assertTrue(PhotoLibraryCore.videoReadable(34, allowAll))
    }

    @Test
    fun partialAccessIsUserSelectedAloneAndCoversTheSelectedVideos() {
        val partial = none.copy(userSelected = true)

        assertEquals("limited", PhotoLibraryCore.photoAccess(34, partial))
        assertTrue(PhotoLibraryCore.partialAccess(34, partial))
        assertTrue(PhotoLibraryCore.videoReadable(34, partial))
    }

    @Test
    fun photosGrantedByAnOlderBuildLeaveVideosUnreadable() {
        // A build that asked only for photos: on 14 its "allow all" granted images and user-selected.
        val photosOnly34 = none.copy(images = true, userSelected = true)
        val photosOnly33 = none.copy(images = true)

        assertEquals("granted", PhotoLibraryCore.photoAccess(34, photosOnly34))
        assertFalse(PhotoLibraryCore.partialAccess(34, photosOnly34))
        assertFalse(PhotoLibraryCore.videoReadable(34, photosOnly34))
        assertEquals("granted", PhotoLibraryCore.photoAccess(33, photosOnly33))
        assertFalse(PhotoLibraryCore.videoReadable(33, photosOnly33))
    }

    @Test
    fun belowAndroid13TheStoragePermissionReadsPhotosAndVideos() {
        val storage = none.copy(storage = true)

        assertEquals("granted", PhotoLibraryCore.photoAccess(32, storage))
        assertTrue(PhotoLibraryCore.videoReadable(32, storage))
        assertEquals("denied", PhotoLibraryCore.photoAccess(32, none))
        assertFalse(PhotoLibraryCore.videoReadable(32, none))
        // The media permissions mean nothing below 13, user-selected nothing below 14.
        assertFalse(PhotoLibraryCore.videoReadable(32, none.copy(videos = true)))
        assertEquals("denied", PhotoLibraryCore.photoAccess(33, none.copy(userSelected = true)))
        assertFalse(PhotoLibraryCore.partialAccess(33, none.copy(userSelected = true)))
    }

    @Test
    fun aPhotoOnlyUserIsAskedForVideoOnceByAListThatWantsVideos() {
        assertTrue(PhotoLibraryCore.shouldAskForVideo(34, videoRequested = true, photoAccess = "granted", videoGranted = false, askedForVideoBefore = false))
        assertTrue(PhotoLibraryCore.shouldAskForVideo(33, videoRequested = true, photoAccess = "granted", videoGranted = false, askedForVideoBefore = false))
    }

    // A selection made under a build that asked only for photos holds no videos; the ask lets the user add some.
    @Test
    fun aPartialAccessUserIsAskedForVideoOnceToo() {
        assertTrue(PhotoLibraryCore.shouldAskForVideo(34, videoRequested = true, photoAccess = "limited", videoGranted = false, askedForVideoBefore = false))
        assertFalse(PhotoLibraryCore.shouldAskForVideo(34, videoRequested = true, photoAccess = "limited", videoGranted = false, askedForVideoBefore = true))
    }

    @Test
    fun theVideoAskIsNeverRepeatedNorRaisedWithoutCause() {
        // Asked before (and denied): as it was from then on.
        assertFalse(PhotoLibraryCore.shouldAskForVideo(34, videoRequested = true, photoAccess = "granted", videoGranted = false, askedForVideoBefore = true))
        // A photos-only list never asks for video.
        assertFalse(PhotoLibraryCore.shouldAskForVideo(34, videoRequested = false, photoAccess = "granted", videoGranted = false, askedForVideoBefore = false))
        // Video already granted.
        assertFalse(PhotoLibraryCore.shouldAskForVideo(34, videoRequested = true, photoAccess = "granted", videoGranted = true, askedForVideoBefore = false))
        // Denied photos: the first ask is what applies, not a video ask.
        assertFalse(PhotoLibraryCore.shouldAskForVideo(34, videoRequested = true, photoAccess = "denied", videoGranted = false, askedForVideoBefore = false))
        // Below 13 the storage permission is all there is to ask.
        assertFalse(PhotoLibraryCore.shouldAskForVideo(32, videoRequested = true, photoAccess = "granted", videoGranted = false, askedForVideoBefore = false))
    }

    // --- Media types ---

    @Test
    fun noRecognisedMediaTypeMeansPhotosAsBefore() {
        assertEquals(PhotoLibraryCore.IMAGES_ONLY, PhotoLibraryCore.mediaTypes(null))
        assertEquals(PhotoLibraryCore.IMAGES_ONLY, PhotoLibraryCore.mediaTypes(emptyList()))
        assertEquals(PhotoLibraryCore.IMAGES_ONLY, PhotoLibraryCore.mediaTypes(listOf("audio", null, "IMAGE")))
    }

    @Test
    fun recognisedMediaTypesAreTakenAndUnknownOnesIgnored() {
        assertEquals(MediaTypes(images = true, videos = true), PhotoLibraryCore.mediaTypes(listOf("image", "video")))
        assertEquals(MediaTypes(images = true, videos = true), PhotoLibraryCore.mediaTypes(listOf("video", "audio", "image", "video")))
        assertEquals(MediaTypes(images = false, videos = true), PhotoLibraryCore.mediaTypes(listOf("video")))
        assertEquals(PhotoLibraryCore.IMAGES_ONLY, PhotoLibraryCore.mediaTypes(listOf("image", "gif")))
    }

    @Test
    fun videosAreListedOnlyWhileReadable() {
        val both = MediaTypes(images = true, videos = true)

        assertEquals(both, PhotoLibraryCore.listable(both, videoReadable = true))
        assertEquals(PhotoLibraryCore.IMAGES_ONLY, PhotoLibraryCore.listable(both, videoReadable = false))
        assertEquals(PhotoLibraryCore.IMAGES_ONLY, PhotoLibraryCore.listable(MediaTypes(images = false, videos = true), videoReadable = false))
        assertEquals(PhotoLibraryCore.IMAGES_ONLY, PhotoLibraryCore.listable(PhotoLibraryCore.IMAGES_ONLY, videoReadable = false))
    }

    @Test
    fun aPhotosOnlyListStaysOnTheImagesTableWithNoTypeClause() {
        assertFalse(PhotoLibraryCore.readsFiles(PhotoLibraryCore.IMAGES_ONLY))
        assertNull(PhotoLibraryCore.mediaTypeClause(PhotoLibraryCore.IMAGES_ONLY))
    }

    @Test
    fun aListWithVideosReadsTheFilesTableNarrowedByMediaType() {
        assertTrue(PhotoLibraryCore.readsFiles(MediaTypes(images = true, videos = true)))
        assertEquals("media_type IN (1, 3)", PhotoLibraryCore.mediaTypeClause(MediaTypes(images = true, videos = true)))
        assertEquals("media_type = 3", PhotoLibraryCore.mediaTypeClause(MediaTypes(images = false, videos = true)))
    }

    // --- Item ids ---

    @Test
    fun aVideoIdCarriesThePrefixAndAPhotoIdStaysBare() {
        assertEquals("v:42", PhotoLibraryCore.itemId(42, isVideo = true))
        assertEquals("42", PhotoLibraryCore.itemId(42, isVideo = false))
        assertEquals(42L, PhotoLibraryCore.videoId(PhotoLibraryCore.itemId(42, isVideo = true)))
    }

    @Test
    fun anythingButAPrefixedNumberIsNotAVideoId() {
        for (raw in listOf(null, "", "42", "v:", "v:abc", "v:-1", "V:42", " v:42", "v:4 2", "x:42")) {
            assertNull(raw.toString(), PhotoLibraryCore.videoId(raw))
        }
    }

    @Test
    fun aPrefixedVideoIdIsNotAPhotoId() {
        // ReadPhoto parses its id as a bare number; a video's must fail that.
        assertNull(PhotoLibraryCore.itemId(42, isVideo = true).toLongOrNull())
    }

    @Test
    fun anUnknownDurationIsLeftOut() {
        assertEquals(1500L, PhotoLibraryCore.durationMs(1500))
        assertNull(PhotoLibraryCore.durationMs(0))
        assertNull(PhotoLibraryCore.durationMs(-1))
        assertNull(PhotoLibraryCore.durationMs(null))
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
    fun aPageWithVideosLeadsWithTheMediaTypeClause() {
        val (selection, args) = PhotoLibraryCore.pageSelection(bucketId = "b1", after = PageKey(100, 7), mediaTypeClause = "media_type IN (1, 3)")

        assertEquals("media_type IN (1, 3) AND bucket_id = ? AND (date_added < ? OR (date_added = ? AND _id < ?))", selection)
        assertArrayEquals(arrayOf("b1", "100", "100", "7"), args)
    }

    @Test
    fun theFirstPageWithVideosHasOnlyTheMediaTypeClause() {
        val (selection, args) = PhotoLibraryCore.pageSelection(bucketId = null, after = null, mediaTypeClause = "media_type = 3")

        assertEquals("media_type = 3", selection)
        assertEquals(0, args.size)
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
