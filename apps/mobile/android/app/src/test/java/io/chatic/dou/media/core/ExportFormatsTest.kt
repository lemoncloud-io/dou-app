package io.chatic.dou.media.core

import io.chatic.dou.media.core.ExportFormats.Family
import io.chatic.dou.transfer.core.DownloadFiles
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExportFormatsTest {

    // --- Byte families ---

    @Test
    fun eachFamilyIsKnownByItsFirstBytes() {
        assertEquals(Family.PNG, ExportFormats.family(PNG, "a.png"))
        assertEquals(Family.JPEG, ExportFormats.family(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1), "a.jpg"))
        assertEquals(Family.GIF, ExportFormats.family("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000".toByteArray(), "a.gif"))
        assertEquals(Family.WEBP, ExportFormats.family("RIFF$\u0000\u0000\u0000WEBPVP8 ".toByteArray(), "a.webp"))
        assertEquals(Family.MP4, ExportFormats.family(MP4, "clip.mp4"))
        assertEquals(Family.PDF, ExportFormats.family("%PDF-1.7\n%".toByteArray(), "a.pdf"))
        assertEquals(Family.ZIP, ExportFormats.family(bytes(0x50, 0x4B, 0x03, 0x04, 0x14, 0, 6, 0), "a.docx"))
        assertEquals(Family.ZIP, ExportFormats.family(bytes(0x50, 0x4B, 0x03, 0x04, 0x0A, 0, 0, 0), "photos.zip"))
        assertEquals(Family.OLE2, ExportFormats.family(bytes(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0), "a.hwp"))
        assertEquals(Family.TEXT, ExportFormats.family("hello, world\n".toByteArray(), "notes.TXT"))
        assertEquals("an empty text file", Family.TEXT, ExportFormats.family(ByteArray(0), "empty.txt"))
    }

    @Test
    fun textNeedsATxtNameAndNoNul() {
        assertNull("not named .txt", ExportFormats.family("hello".toByteArray(), "page.html"))
        assertNull("a NUL in the head", ExportFormats.family("he\u0000llo".toByteArray(), "notes.txt"))
    }

    @Test
    fun anythingElseIsNoFamily() {
        assertNull("an S3 error body", ExportFormats.family("<?xml version=\"1.0\"?><Error/>".toByteArray(), "a.pdf"))
        assertNull("HTML named as a document", ExportFormats.family("<!doctype html><html>".toByteArray(), "a.docx"))
        assertNull("an executable", ExportFormats.family(bytes(0x7F, 0x45, 0x4C, 0x46, 2, 1, 1, 0), "a.pdf"))
        assertNull("empty and not text", ExportFormats.family(ByteArray(0), "a.pdf"))
        assertNull("a PK prefix that is not a local file header", ExportFormats.family(bytes(0x50, 0x4B, 0x05, 0x06), "a.zip"))
    }

    @Test
    fun thePhotoLibraryTakesTheFourImagesAndMp4Only() {
        assertEquals("image/png", ExportFormats.photoLibraryType(PNG, "a.png"))
        assertEquals("video/mp4", ExportFormats.photoLibraryType(MP4, "clip.mp4"))
        assertNull(ExportFormats.photoLibraryType("%PDF-1.7\n%".toByteArray(), "a.pdf"))
        assertNull(ExportFormats.photoLibraryType(bytes(0, 0, 0, 0x14, 0x66, 0x74, 0x79), "clip.mp4"))
    }

    @Test
    fun anM4aNeverGoesToThePhotoLibrary() {
        assertNull("the M4A brand", ExportFormats.photoLibraryType(M4A, "voice.m4a"))
        assertNull("the M4A brand under another name", ExportFormats.photoLibraryType(M4A, "voice.mp4"))
        assertNull("a generic brand named .m4a", ExportFormats.photoLibraryType(MP4, "voice-20261102-093000.m4a"))
        assertNull("an Android recording's brand", ExportFormats.photoLibraryType(MP42, "voice.M4A"))
        assertNull("an MP3", ExportFormats.photoLibraryType(ID3, "song.mp3"))
    }

    // --- Audio ---

    @Test
    fun eachAudioFamilyIsKnownByItsFirstBytes() {
        assertEquals("an ID3 tag", Family.MP3, ExportFormats.family(ID3, "song.mp3"))
        assertEquals("MPEG-1 Layer III, no ID3", Family.MP3, ExportFormats.family(bytes(0xFF, 0xFB, 0x90, 0x64, 0, 0), "song.mp3"))
        assertEquals("MPEG-2 frame sync", Family.MP3, ExportFormats.family(bytes(0xFF, 0xF3, 0x48, 0xC4), "song.mp3"))
        assertEquals("MPEG-2.5 frame sync", Family.MP3, ExportFormats.family(bytes(0xFF, 0xE3, 0x18, 0xC4), "song.mp3"))
        assertEquals(Family.WAV, ExportFormats.family("RIFF\u0024\u0000\u0000\u0000WAVEfmt ".toByteArray(), "memo.wav"))
        assertEquals(Family.OGG, ExportFormats.family("OggS\u0000\u0002\u0000\u0000".toByteArray(), "memo.ogg"))
        assertEquals("the M4A brand", Family.M4A, ExportFormats.family(M4A, "memo.m4a"))
        assertEquals("the M4A brand, whatever its name", Family.M4A, ExportFormats.family(M4A, "memo.mp4"))
        assertEquals("isom named .m4a", Family.M4A, ExportFormats.family(MP4, "voice.m4a"))
        assertEquals("mp42 named .M4A", Family.M4A, ExportFormats.family(MP42, "voice.M4A"))
        assertEquals("isom named .mp4 stays a video", Family.MP4, ExportFormats.family(MP4, "clip.mp4"))
        assertEquals("mp42 with no name stays a video", Family.MP4, ExportFormats.family(MP42, "clip"))
    }

    @Test
    fun audioLookalikesAreNotAudio() {
        assertEquals("a JPEG starts FF D8, not a frame sync", Family.JPEG, ExportFormats.family(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1), "a.mp3"))
        assertNull("FF and a byte below E0", ExportFormats.family(bytes(0xFF, 0xC0, 0, 0), "a.mp3"))
        assertNull("one FF byte", ExportFormats.family(bytes(0xFF), "a.mp3"))
        assertEquals("a UTF-16 text file opens FF FE, and stays text", Family.TEXT, ExportFormats.family(bytes(0xFF, 0xFE, 0x41, 0x42), "notes.txt"))
        assertNull("RIFF that is not WAVE or WEBP", ExportFormats.family("RIFF\u0024\u0000\u0000\u0000AVI LIST".toByteArray(), "a.wav"))
        assertEquals("a WebP is still an image", Family.WEBP, ExportFormats.family("RIFF\u0024\u0000\u0000\u0000WEBPVP8 ".toByteArray(), "a.wav"))
        assertNull("Ogg cut short", ExportFormats.family("Ogg".toByteArray(), "a.ogg"))
    }

    @Test
    fun audioGoesOutUnderItsAudioType() {
        assertEquals("audio/mpeg", ExportFormats.mimeType("song.mp3", Family.MP3))
        assertEquals("audio/mp4", ExportFormats.mimeType("voice.m4a", Family.M4A))
        assertEquals("audio/wav", ExportFormats.mimeType("memo.WAV", Family.WAV))
        assertEquals("audio/ogg", ExportFormats.mimeType("memo.ogg", Family.OGG))
        // Without a known extension the family types it, so it never goes out as a video.
        assertEquals("audio/mp4", ExportFormats.mimeType("voice", Family.M4A))
        assertEquals("audio/mpeg", ExportFormats.mimeType("song", Family.MP3))
        assertEquals("audio/mp4", ExportFormats.mimeTypeForName("voice.m4a"))
    }

    // --- Types by name ---

    @Test
    fun theNameTypesTheFileOnceItsBytesAreAllowed() {
        val zip = Family.ZIP
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ExportFormats.mimeType("a.docx", zip))
        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ExportFormats.mimeType("a.XLSX", zip))
        assertEquals("application/vnd.openxmlformats-officedocument.presentationml.presentation", ExportFormats.mimeType("a.pptx", zip))
        assertEquals("application/hwp+zip", ExportFormats.mimeType("a.hwpx", zip))
        assertEquals("application/zip", ExportFormats.mimeType("photos.ZIP", zip))
        assertEquals("application/zip", ExportFormats.mimeTypeForName("photos.zip"))
        assertEquals("application/x-hwp", ExportFormats.mimeType("a.hwp", Family.OLE2))
        assertEquals("text/plain", ExportFormats.mimeType("a.txt", Family.TEXT))
        assertEquals("image/jpeg", ExportFormats.mimeType("a.jpeg", Family.JPEG))
        assertEquals("video/mp4", ExportFormats.mimeType("a.mp4", Family.MP4))
    }

    @Test
    fun aNameWithoutAKnownExtensionTakesItsFamilysType() {
        assertEquals("application/zip", ExportFormats.mimeType("archive", Family.ZIP))
        assertEquals("application/octet-stream", ExportFormats.mimeType("legacy.doc", Family.OLE2))
        assertEquals("application/pdf", ExportFormats.mimeType("report.pdf.bak", Family.PDF))
    }

    @Test
    fun extensionIsTheLowerCaseTailAfterTheLastDot() {
        assertEquals("pdf", ExportFormats.extensionOf("a.b.PDF"))
        assertNull(ExportFormats.extensionOf(".pdf"))
        assertNull(ExportFormats.extensionOf("pdf."))
        assertNull(ExportFormats.extensionOf("pdf"))
    }

    // --- SaveFile names ---

    @Test
    fun saveKeepsTheEighteenServerExtensions() {
        assertEquals(
            setOf("png", "jpg", "jpeg", "gif", "webp", "mp4", "mp3", "m4a", "wav", "ogg", "pdf", "docx", "xlsx", "pptx", "hwp", "hwpx", "txt", "zip"),
            ExportFormats.SAVE_EXTENSIONS,
        )
    }

    @Test
    fun saveNameDropsSeparatorsAndControlsAndLowersTheExtension() {
        assertEquals("minutes v1.2.pdf", ExportFormats.saveName("minutes v1.2.pdf"))
        assertEquals("Report.pdf", ExportFormats.saveName("Report.PDF"))
        assertEquals("etcpasswd.txt", ExportFormats.saveName("../../etc/passwd.txt"))
        assertEquals("ab.hwp", ExportFormats.saveName("a\\b.hwp"))
        assertEquals("ab.docx", ExportFormats.saveName("a\u0000b\u001F.docx"))
        assertEquals("a_b_c_____.xlsx", ExportFormats.saveName("a:b*c?\"<>|.xlsx"))
        assertEquals("hidden.pptx", ExportFormats.saveName("  .hidden.pptx. "))
        assertEquals("보고서.hwpx", ExportFormats.saveName("보고서.hwpx"))
        assertEquals("Photos 2026.zip", ExportFormats.saveName("Photos 2026.ZIP"))
        assertEquals("voice-20261102-093000.m4a", ExportFormats.saveName("voice-20261102-093000.M4A"))
        assertEquals("song.mp3", ExportFormats.saveName("song.mp3"))
        assertEquals("memo.wav", ExportFormats.saveName("memo.wav"))
        assertEquals("memo.ogg", ExportFormats.saveName("memo.ogg"))
    }

    @Test
    fun saveRefusesANameWithoutAServerExtension() {
        for (name in listOf(null, "", "report", "setup.exe", "app.apk", "page.html", "archive.7z", "song.flac", "voice.aac", ".pdf", "...pdf", "/.pdf", " .txt")) {
            assertNull(name.toString(), ExportFormats.saveName(name))
        }
    }

    @Test
    fun saveCutsAnOverlongBaseAndKeepsTheExtension() {
        val name = ExportFormats.saveName("가".repeat(100) + ".pdf")!!
        assertEquals("가".repeat(65) + ".pdf", name)
        assertTrue(name.toByteArray(Charsets.UTF_8).size <= ExportFormats.MAX_SAVE_NAME_BYTES)
    }

    @Test
    fun aTakenSaveNameIsNumberedBeforeItsExtension() {
        assertEquals("report.pdf", DownloadFiles.uniqueName("report.pdf") { false })
        assertEquals("report (1).pdf", DownloadFiles.uniqueName("report.pdf") { it == "report.pdf" })
        assertEquals("report (2).pdf", DownloadFiles.uniqueName("report.pdf") { it in setOf("report.pdf", "report (1).pdf") })
        assertEquals("v1.2 (1).hwpx", DownloadFiles.uniqueName("v1.2.hwpx") { it == "v1.2.hwpx" })
    }

    @Test
    fun locationIsTheFolderAndTheFinalName() {
        assertEquals("Download/DoU/report (1).pdf", ExportFormats.saveLocation("Download/DoU", "report (1).pdf"))
    }

    private companion object {
        val PNG = bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52)
        val MP4 = "\u0000\u0000\u0000\u0018ftypisom\u0000\u0000\u0002\u0000".toByteArray(Charsets.ISO_8859_1)
        val M4A = "\u0000\u0000\u0000\u001CftypM4A \u0000\u0000\u0000\u0000".toByteArray(Charsets.ISO_8859_1)

        /** The brand Android's MediaRecorder writes into an MPEG-4 file, audio-only or not. */
        val MP42 = "\u0000\u0000\u0000\u0018ftypmp42\u0000\u0000\u0000\u0000".toByteArray(Charsets.ISO_8859_1)
        val ID3 = "ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0023".toByteArray(Charsets.ISO_8859_1)

        fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }
    }
}
