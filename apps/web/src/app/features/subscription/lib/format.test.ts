import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { cloudDisplayName, formatDate, platformLabelKey } from './format';

describe('formatDate', () => {
    it('prints YYYY.MM.DD in local time', () => {
        expect(formatDate(new Date(2026, 9, 6, 15).getTime())).toBe('2026.10.06');
    });

    it('prints a dash for a missing or zero timestamp', () => {
        expect(formatDate(undefined)).toBe('-');
        expect(formatDate(0)).toBe('-');
    });
});

describe('platformLabelKey', () => {
    it('names both stores and nothing else', () => {
        expect(platformLabelKey('apple')).toBe('mypage.subscription.platformApple');
        expect(platformLabelKey('google')).toBe('mypage.subscription.platformGoogle');
        expect(platformLabelKey(undefined)).toBeUndefined();
    });
});

describe('cloudDisplayName', () => {
    it('falls back from name to email local part to id', () => {
        expect(cloudDisplayName({ id: 'c1', name: 'Team' } as CloudView)).toBe('Team');
        expect(cloudDisplayName({ id: 'c1', email: 'me@example.com' } as CloudView)).toBe('me');
        expect(cloudDisplayName({ id: 'c1' } as CloudView)).toBe('c1');
    });
});
