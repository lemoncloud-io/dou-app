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
        assertEquals("image/png", ExportFormats.photoLibraryType(PNG))
        assertEquals("video/mp4", ExportFormats.photoLibraryType(MP4))
        assertNull(ExportFormats.photoLibraryType("%PDF-1.7\n%".toByteArray()))
        assertNull(ExportFormats.photoLibraryType(bytes(0, 0, 0, 0x14, 0x66, 0x74, 0x79)))
    }

    // --- Types by name ---

    @Test
    fun theNameTypesTheFileOnceItsBytesAreAllowed() {
        val zip = Family.ZIP
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ExportFormats.mimeType("a.docx", zip))
        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ExportFormats.mimeType("a.XLSX", zip))
        assertEquals("application/vnd.openxmlformats-officedocument.presentationml.presentation", ExportFormats.mimeType("a.pptx", zip))
        assertEquals("application/hwp+zip", ExportFormats.mimeType("a.hwpx", zip))
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
    fun saveKeepsTheThirteenServerExtensions() {
        assertEquals(
            setOf("png", "jpg", "jpeg", "gif", "webp", "mp4", "pdf", "docx", "xlsx", "pptx", "hwp", "hwpx", "txt"),
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
    }

    @Test
    fun saveRefusesANameWithoutAServerExtension() {
        for (name in listOf(null, "", "report", "setup.exe", "app.apk", "page.html", "archive.zip", ".pdf", "...pdf", "/.pdf", " .txt")) {
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

        fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }
    }
}
