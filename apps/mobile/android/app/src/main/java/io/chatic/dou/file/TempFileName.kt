package io.chatic.dou.file

/** Naming for files the app writes into its cache on the web's behalf. Plain Kotlin, unit-tested. */
object TempFileName {

    const val FALLBACK = "file"
    const val MAX_LENGTH = 80

    /**
     * A file name that is safe to put under the cache directory: no path segments, no separators or
     * control characters, no leading dots, and short enough for any file system. Letters of any
     * script are kept so a name stays recognisable; everything else becomes `_`. Over-long names
     * keep their end, because that is where the extension is.
     */
    fun safe(fileName: String?): String {
        val lastSegment = fileName.orEmpty().substringAfterLast('/').substringAfterLast('\\')
        val cleaned = buildString {
            for (ch in lastSegment) {
                append(if (ch.isLetterOrDigit() || ch == '.' || ch == '-' || ch == '_') ch else '_')
            }
        }.trimStart('.')
        val name = if (cleaned.length > MAX_LENGTH) cleaned.takeLast(MAX_LENGTH) else cleaned
        return name.ifEmpty { FALLBACK }
    }
}
