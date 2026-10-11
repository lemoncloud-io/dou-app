import { describe, expect, it } from 'vitest';

import { parseInvitePhone } from './phoneNumber';

describe('parseInvitePhone', () => {
    it('accepts an international-form number as E.164', () => {
        expect(parseInvitePhone('+821012345678')).toEqual({ e164: '+821012345678' });
    });

    it('accepts a Korean local-form number through the KR fallback', () => {
        expect(parseInvitePhone('010-1234-5678')).toEqual({ e164: '+821012345678' });
    });

    it('rejects an empty input without throwing', () => {
        expect(parseInvitePhone('   ')).toEqual({ error: 'invalid' });
    });

    it('rejects a too-short digit string', () => {
        expect(parseInvitePhone('123')).toEqual({ error: 'invalid' });
    });

    it('rejects a foreign local form that is not valid', () => {
        expect(parseInvitePhone('not-a-number')).toEqual({ error: 'invalid' });
    });
});
