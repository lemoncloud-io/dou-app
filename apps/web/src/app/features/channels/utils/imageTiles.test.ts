import type { DomainChat } from '@chatic/data';

import { isPendingImageChat } from './imageTiles';

type Uploads = NonNullable<DomainChat['upload$$']>;

const sent = (id: string, extra: Record<string, unknown> = {}) =>
    ({
        id,
        status: 'stored',
        orgUrl: `https://s3/${id}`,
        thumbUrl: `https://s3/${id}-thumb`,
        ...extra,
    }) as Uploads[number];
const local = (status: 'sending' | 'failed', url = 'blob:x') => ({ localStatus: status, localThumbUrl: url });

describe('isPendingImageChat', () => {
    it('is true only while local slots are in the list', () => {
        expect(isPendingImageChat({ upload$$: [local('failed')] as Uploads })).toBe(true);
        expect(isPendingImageChat({ upload$$: [sent('a')] })).toBe(false);
        expect(isPendingImageChat({})).toBe(false);
    });
});
