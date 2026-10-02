package io.chatic.dou.transfer.core

import java.io.File
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException
import java.nio.file.InvalidPathException
import java.nio.file.Paths

/**
 * Which files an upload may read. The web names the source, and the web is loaded remotely, so
 * without a rule a page could upload the app's database or settings to a URL of its choosing. An
 * upload reads only what the shell itself wrote for one: the attachment picker's copies
 * (`attach-pick/`) and the files `WriteTempFile` writes (`transfer-temp/`), both under the cache
 * directory.
 *
 * A `content://` URI is refused too, though the resolver could read it: a picker's read grant lasts
 * only as long as the screen that received it, which is why the picker copies what it returns, and a
 * URI another app's provider serves is not a file the shell chose.
 *
 * The same normalise-then-resolve comparison as [DownloadFiles.checkExportable]: `..` cannot climb out,
 * and a symbolic link cannot point out, because both the path and the folders are compared as real
 * paths. A file that does not exist (yet, or any more) is still inside or outside; reading it is the
 * transport's concern, and a missing one ends as `failed(SOURCE)` as before.
 */
object UploadSources {

    /** The folder `WriteTempFile` writes into, under the cache directory. */
    const val TEMP_FOLDER = "transfer-temp"

    /**
     * Whether [fileUri] — a `file://` URI without a host, or an absolute path — names a file inside one
     * of [roots] (the folders themselves are not files and are refused).
     */
    fun isAllowed(fileUri: String?, roots: List<File>): Boolean {
        val raw = fileUri?.takeIf { it.isNotBlank() } ?: return false
        val path = pathOf(raw) ?: return false
        if ('\u0000' in path || raw.contains("%00", ignoreCase = true)) return false
        val lexical = try {
            Paths.get(path).normalize().toString()
        } catch (_: InvalidPathException) {
            return false
        }
        val real = try {
            File(lexical).canonicalPath
        } catch (_: IOException) {
            return false
        }
        return roots.any { root ->
            val lexicalRoot = Paths.get(root.path).normalize().toString()
            val realRoot = try {
                root.canonicalPath
            } catch (_: IOException) {
                return@any false
            }
            isInside(lexical, lexicalRoot) && isInside(real, realRoot)
        }
    }

    /** The absolute path a source names, or null for another scheme, a host, or a relative path. */
    private fun pathOf(raw: String): String? {
        if (raw.startsWith("/")) return raw
        val parsed = try {
            URI(raw)
        } catch (_: URISyntaxException) {
            return null
        }
        if (!parsed.scheme.equals("file", ignoreCase = true)) return null
        if (!parsed.host.isNullOrEmpty()) return null
        return parsed.path?.takeIf { it.startsWith("/") }
    }

    private fun isInside(path: String, root: String): Boolean = path.startsWith(root.trimEnd('/') + "/")
}
