import { decodeImage } from './decode';
import { OUTPUT_STRATEGIES } from './strategies';
import type { ImageOutputSpec, ImageRequest, ImageResult, PreparedFile } from './types';

/** Everything a caller asked for that this source could not satisfy. */
const unsatisfiable = <R extends ImageRequest>(request: R, source: File): ImageResult<R> =>
    Object.fromEntries(
        Object.entries(request).map(([key, spec]) => [
            key,
            // An uncompressed `file` is the source, so it survives a failed decode — that is how
            // "the original always goes up" holds even when nothing can be measured or previewed.
            // Its dimensions cannot be known here, and 0 is the honest answer for "not measured".
            spec.as === 'file' && !spec.profile ? ({ file: source, width: 0, height: 0 } satisfies PreparedFile) : null,
        ])
    ) as ImageResult<R>;

/**
 * Prepare one picked image into every output a caller needs.
 *
 * **The source is decoded once and every output is drawn from that**, so asking for three costs one
 * decode — which matters when the source is a 12MP photo and the caller wants bytes to upload, a
 * small copy for a list, and a data URL for the preview beside the composer.
 *
 * The request names its outputs, and each one picks a form and a compression independently:
 *
 * ```ts
 * const { original, thumbnail, preview } = await prepareImage(file, {
 *     original:  { as: 'file' },                             // the source, untouched
 *     thumbnail: { as: 'file', profile: THUMBNAIL_PROFILE }, // small, for storage
 *     preview:   { as: 'dataUrl', profile: THUMBNAIL_PROFILE }, // small, for the screen
 * });
 * ```
 *
 * Prefer the named policies over spelling a request out — see `policies.ts`.
 *
 * **What can be `null`.** A compressed output can fail and says so; a preview must never block an
 * upload. An uncompressed `file` cannot, because it is the source — the type says this, so the
 * attachment path never has to check whether it still has something to send.
 *
 * **What is never reachable.** `{ as: 'dataUrl' }` without a profile does not compile. A data URL
 * is base64 at four bytes per three, so an uncompressed one is never what anyone meant, and this is
 * the one pairing the orthogonal shape would otherwise have opened.
 */
export const prepareImage = async <R extends ImageRequest>(file: File, request: R): Promise<ImageResult<R>> => {
    const decoded = await decodeImage(file);
    if (!decoded) return unsatisfiable(request, file);

    const entries = await Promise.all(
        Object.entries(request).map(async ([key, spec]) => {
            const strategy = OUTPUT_STRATEGIES[spec.as];
            // The cast: each strategy is typed against its own spec, and `as` already fixes which.
            // Proving that through the registry lookup would thread a generic through every one.
            return [key, await strategy.run(file, decoded, spec as never, key)] as const;
        })
    );

    return Object.fromEntries(entries) as ImageResult<R>;
};

export type { ImageOutputSpec, ImageRequest, ImageResult };
