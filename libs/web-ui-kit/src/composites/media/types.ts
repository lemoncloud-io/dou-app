/** What a picker item is. */
export type PhotoItemKind = 'image' | 'video';

/**
 * One photo or video the picker can show — `src` is anything an `<img src>` accepts (a data URL from
 * the app); a video's is its poster frame.
 */
export interface PhotoItem {
    id: string;
    src: string;
    /** Absent means `image`. A video is drawn with a play mark and its length. */
    kind?: PhotoItemKind;
    /** A video's length, in milliseconds. */
    durationMs?: number;
}

/** One album row. `coverSrc` is omitted for an album with nothing to show yet. */
export interface PhotoAlbum {
    id: string;
    title: string;
    count: number;
    coverSrc?: string;
}
