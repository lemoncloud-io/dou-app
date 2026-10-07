import type { PhotoEdit } from './photoEdit';

/** What a picker item is. */
export type PhotoItemKind = 'image' | 'video';

/**
 * A picked photo's edit, with what it takes to draw it: a display rendition of the whole upright
 * photo (`src`) and the original's pixel size, the space `edit` is measured in. The square grid
 * preview cannot stand in for it — a crop of a crop would frame the wrong part of the photo.
 */
export interface PhotoItemEdit {
    src: string;
    width: number;
    height: number;
    edit: PhotoEdit;
}

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
    /** Set once the photo has been edited: the picked strip draws the edit instead of `src`. */
    edited?: PhotoItemEdit;
}

/** One album row. `coverSrc` is omitted for an album with nothing to show yet. */
export interface PhotoAlbum {
    id: string;
    title: string;
    count: number;
    coverSrc?: string;
}

/**
 * What the photo grid has on screen: photo indices `[start, end)`, a few rows either side included, and
 * the pixel size its tiles are drawn at — what a preview should be asked for at. `thumbSize` is absent
 * until the grid has measured itself.
 */
export interface PhotoGridRange {
    start: number;
    end: number;
    thumbSize?: number;
}
