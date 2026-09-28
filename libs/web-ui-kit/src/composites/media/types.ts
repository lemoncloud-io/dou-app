/** One photo the picker can show — `src` is anything an `<img src>` accepts (a data URL from the app). */
export interface PhotoItem {
    id: string;
    src: string;
}

/** One album row. `coverSrc` is omitted for an album with nothing to show yet. */
export interface PhotoAlbum {
    id: string;
    title: string;
    count: number;
    coverSrc?: string;
}
