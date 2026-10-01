package io.chatic.dou.media

import androidx.core.content.FileProvider

/**
 * The provider the share sheet reads a downloaded file through (`content://`, authority
 * `${applicationId}.share.fileprovider`).
 *
 * A subclass of its own, rather than `FileProvider` itself, because `react-native-webview` and
 * `react-native-image-picker` each merge a provider into the manifest: sharing a class or an
 * authority with one of them would break the merge or put our files under their path rules. Its one
 * path rule (`res/xml/share_file_paths.xml`) is the download folder, so no other file of the app can
 * be turned into a URI here.
 */
class ShareFileProvider : FileProvider()
