import { compressToBlob, compressToDataUrl } from './compress';
import { encodeTypeFor, isUploadableType, renameForType, toUploadFile } from './package';
import { sameSizeProfile } from './profiles';
import type { DecodedImage } from './decode';
import type { CompressProfile } from './profiles';
import type { ImageOutputSpec, PreparedFile } from './types';

export interface OutputStrategy<S extends ImageOutputSpec, R> {
    readonly as: S['as'];
    readonly run: (source: File, decoded: DecodedImage, spec: S, key: string) => Promise<R>;
}

const prepareOriginal = async (file: File, decoded: DecodedImage, quality: number): Promise<PreparedFile> => {
    const { width, height } = decoded;
    const untouched: PreparedFile = { file, width, height };

    if (file.type === 'image/gif') return untouched;

    const type = encodeTypeFor(file.type);
    if (isUploadableType(file.type) && type === file.type) return untouched;

    const compressed = await compressToBlob(decoded, sameSizeProfile(width, height, type, quality));
    if (!compressed) return untouched;

    return { file: toUploadFile(compressed.blob, file, type), width: compressed.width, height: compressed.height };
};

export const fileStrategy: OutputStrategy<Extract<ImageOutputSpec, { as: 'file' }>, PreparedFile | null> = {
    as: 'file',
    run: async (source, decoded, spec, key) => {
        if (!spec.profile) return prepareOriginal(source, decoded, 0.8);

        const compressed = await compressToBlob(decoded, spec.profile);
        if (!compressed) return null;

        const suffix = spec.suffix ?? `-${key}`;
        return {
            file: toUploadFile(compressed.blob, source, spec.profile.type, suffix),
            width: compressed.width,
            height: compressed.height,
        };
    },
};

export const dataUrlStrategy: OutputStrategy<Extract<ImageOutputSpec, { as: 'dataUrl' }>, string | null> = {
    as: 'dataUrl',
    run: async (_source, decoded, spec) => compressToDataUrl(decoded, spec.profile),
};

export const OUTPUT_STRATEGIES = {
    file: fileStrategy,
    dataUrl: dataUrlStrategy,
} as const;

export type { CompressProfile };
export { renameForType };
