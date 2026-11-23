import type { CompressProfile } from './profiles';

export type UploadableType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type ImageFit = 'contain' | 'cover';

export interface PreparedFile {
    file: File;
    width: number;
    height: number;
}

export type ImageOutputSpec =
    | {
          as: 'file';
          profile?: CompressProfile;
          suffix?: string;
      }
    | { as: 'dataUrl'; profile: CompressProfile };

export type ImageRequest = Record<string, ImageOutputSpec>;

export type ImageOutputOf<S extends ImageOutputSpec> = S extends { as: 'dataUrl' }
    ? string | null
    : S extends { as: 'file'; profile: CompressProfile }
      ? PreparedFile | null
      : PreparedFile;

export type ImageResult<R extends ImageRequest> = { [K in keyof R]: ImageOutputOf<R[K]> };
