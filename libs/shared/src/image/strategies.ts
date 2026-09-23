import { compressToBlob, compressToDataUrl } from './compress';
import { encodeTypeFor, isUploadableType, renameForType, toUploadFile } from './package';
import { sameSizeProfile } from './profiles';
import type { DecodedImage } from './decode';
import type { CompressProfile } from './profiles';
import type { ImageOutputSpec, PreparedFile } from './types';

/**
 * How one output form is produced from a decoded source.
 *
 * A strategy owns a form — bytes, or a data URL — and nothing else. Which profile it runs is the
 * caller's axis, not the strategy's, so adding a form and adding a compression budget are separate
 * edits that do not touch each other. This is where `compress` and `package` are composed; nothing
 * else in the module puts them together.
 */
export interface OutputStrategy<S extends ImageOutputSpec, R> {
    /** Matches `spec.as`; the registry is keyed by it. */
    readonly as: S['as'];
    readonly run: (source: File, decoded: DecodedImage, spec: S, key: string) => Promise<R>;
}

/**
 * The source itself, converted only when the endpoint would refuse its format.
 *
 * Returns the **same `File` object** when nothing had to be done, so `===` answers "were these
 * bytes altered" — which the upload path needs, because it hashes what it actually sends.
 */
const prepareOriginal = async (file: File, decoded: DecodedImage, quality: number): Promise<PreparedFile> => {
    const { width, height } = decoded;
    const untouched: PreparedFile = { file, width, height };

    // An animated GIF is never redrawn: a canvas keeps only its first frame, and the animation is
    // the reason someone sent it. It is already a format the endpoint accepts.
    if (file.type === 'image/gif') return untouched;

    const type = encodeTypeFor(file.type);
    // "Not resized" is not "not touched": HEIC has to become JPEG or the endpoint answers 415, and
    // that is correctness rather than a size budget.
    if (isUploadableType(file.type) && type === file.type) return untouched;

    const compressed = await compressToBlob(decoded, sameSizeProfile(width, height, type, quality));
    if (!compressed) return untouched;

    return { file: toUploadFile(compressed.blob, file, type), width: compressed.width, height: compressed.height };
};

/** Bytes, for anything that uploads them. */
export const fileStrategy: OutputStrategy<Extract<ImageOutputSpec, { as: 'file' }>, PreparedFile | null> = {
    as: 'file',
    run: async (source, decoded, spec, key) => {
        // No profile is the whole point of this branch: object storage carries the original, and
        // re-encoding would spend quality the sender chose and cannot get back.
        if (!spec.profile) return prepareOriginal(source, decoded, 0.8);

        const compressed = await compressToBlob(decoded, spec.profile);
        if (!compressed) return null;

        // A derived copy needs a name of its own — one upload can carry several, and identical
        // names make them indistinguishable in logs and in anything keyed by name.
        const suffix = spec.suffix ?? `-${key}`;
        return {
            file: toUploadFile(compressed.blob, source, spec.profile.type, suffix),
            width: compressed.width,
            height: compressed.height,
        };
    },
};

/** A base64 data URL, for a record field or an inline payload. Always compressed by construction. */
export const dataUrlStrategy: OutputStrategy<Extract<ImageOutputSpec, { as: 'dataUrl' }>, string | null> = {
    as: 'dataUrl',
    run: async (_source, decoded, spec) => compressToDataUrl(decoded, spec.profile),
};

/**
 * Every output form this module knows, keyed by `as`.
 *
 * Exported so a caller can see what exists, and so the entry point dispatches without a branch that
 * has to be edited for each new form.
 */
export const OUTPUT_STRATEGIES = {
    file: fileStrategy,
    dataUrl: dataUrlStrategy,
} as const;

/** Re-exported so a caller building a one-off spec has the profile helper at hand. */
export type { CompressProfile };
export { renameForType };
