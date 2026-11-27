import { decodeImage } from './decode';
import { CHAT_ATTACHMENT } from './policies';
import { OUTPUT_STRATEGIES } from './strategies';
import type { ImageOutputSpec, ImageRequest, ImageResult, PreparedFile } from './types';

const unsatisfiable = <R extends ImageRequest>(request: R, source: File): ImageResult<R> =>
    Object.fromEntries(
        Object.entries(request).map(([key, spec]) => [
            key,
            spec.as === 'file' && !spec.profile ? ({ file: source, width: 0, height: 0 } satisfies PreparedFile) : null,
        ])
    ) as ImageResult<R>;

export const prepareImage = async <R extends ImageRequest>(file: File, request: R): Promise<ImageResult<R>> => {
    const decoded = await decodeImage(file);
    if (!decoded) return unsatisfiable(request, file);

    const entries = await Promise.all(
        Object.entries(request).map(async ([key, spec]) => {
            const strategy = OUTPUT_STRATEGIES[spec.as];
            return [key, await strategy.run(file, decoded, spec as never, key)] as const;
        })
    );

    return Object.fromEntries(entries) as ImageResult<R>;
};

export const prepareChatAttachment = async (file: File): Promise<ImageResult<typeof CHAT_ATTACHMENT>> => {
    if (file.type !== 'image/gif') return prepareImage(file, CHAT_ATTACHMENT);
    const { original } = await prepareImage(file, { original: CHAT_ATTACHMENT.original });
    return { original, thumbnail: null };
};

export type { ImageOutputSpec, ImageRequest, ImageResult };
