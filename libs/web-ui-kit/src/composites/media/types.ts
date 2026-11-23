import type { PhotoEdit } from './photoEdit';

export type PhotoItemKind = 'image' | 'video';

export interface PhotoItemEdit {
    src: string;
    width: number;
    height: number;
    edit: PhotoEdit;
}

export interface PhotoItem {
    id: string;
    src: string;
    kind?: PhotoItemKind;
    durationMs?: number;
    edited?: PhotoItemEdit;
}

export interface PhotoAlbum {
    id: string;
    title: string;
    count: number;
    coverSrc?: string;
}

export interface PhotoGridRange {
    start: number;
    end: number;
    thumbSize?: number;
}
