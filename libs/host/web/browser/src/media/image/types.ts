import type {
    ImageFit,
    ImageOutputOf as PortImageOutputOf,
    ImageOutputSpec,
    ImageRequest,
    ImageResult as PortImageResult,
    PreparedImageFile,
    UploadableImageType,
} from '@chatic/ports';

export type UploadableType = UploadableImageType;

export type { ImageFit, ImageOutputSpec, ImageRequest };

export type PreparedFile = PreparedImageFile<File>;

export type ImageOutputOf<S extends ImageOutputSpec> = PortImageOutputOf<S, File>;

export type ImageResult<R extends ImageRequest> = PortImageResult<R, File>;
