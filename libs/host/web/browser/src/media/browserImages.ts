import type { MediaImages } from '@chatic/ports';

import { makeVideoPoster, prepareImage } from './image';

export const browserImages: MediaImages<File> = {
    prepareImage: (file, request) => prepareImage(file, request),
    videoPoster: file => makeVideoPoster(file),
};
