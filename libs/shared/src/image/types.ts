import type { CompressProfile } from './profiles';

/** Formats the upload endpoint accepts. Anything else is rejected with a 415. */
export type UploadableType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** How a source is mapped into the output box. */
export type ImageFit =
    /** The whole frame fits inside `maxEdge`, aspect ratio kept, never upscaled. */
    | 'contain'
    /**
     * A centred `maxEdge` × `maxEdge` square; the overflowing edges are cropped, and a smaller
     * source IS upscaled, because an exact square is the point.
     */
    | 'cover';

/** Bytes plus what an upload has to declare about them. */
export interface PreparedFile {
    file: File;
    /** EXIF applied, so a portrait photo reports its portrait dimensions. */
    width: number;
    height: number;
}

/**
 * One output asked for: a form, and the compression that produces it.
 *
 * The two are independent — that is the point of the shape. A thumbnail as bytes for an upload and
 * a thumbnail as a data URL for a preview are the same profile through different forms, and before
 * this split only one of the two was reachable.
 *
 * **`dataUrl` requires a profile and `file` does not**, and that asymmetry is the guard. A data URL
 * is base64, which costs four bytes per three, so an uncompressed one is never what a caller meant
 * — `{ as: 'dataUrl' }` alone does not compile. A `file` with no profile is the original, which is
 * exactly what object storage should get.
 */
export type ImageOutputSpec =
    | {
          as: 'file';
          /** Omitted: the original, converted only if the endpoint would refuse its format. */
          profile?: CompressProfile;
          /** Appended to the name so a derived copy is not mistaken for its source. Default `-<key>`. */
          suffix?: string;
      }
    | { as: 'dataUrl'; profile: CompressProfile };

/** What to produce from one source, keyed by names the caller chooses. */
export type ImageRequest = Record<string, ImageOutputSpec>;

/**
 * What one spec yields.
 *
 * A compressed output can fail — no decode, no 2D context, no encoder — and says so with `null`,
 * because a preview must never block an upload. **An uncompressed `file` cannot fail**: it is the
 * source, so it is not nullable, which is how "the original always goes up" survives in the type.
 */
export type ImageOutputOf<S extends ImageOutputSpec> = S extends { as: 'dataUrl' }
    ? string | null
    : S extends { as: 'file'; profile: CompressProfile }
      ? PreparedFile | null
      : PreparedFile;

export type ImageResult<R extends ImageRequest> = { [K in keyof R]: ImageOutputOf<R[K]> };
