import { describe, expect, it } from 'vitest';

import i18n from '../../../../i18n';
import { inviteLoginErrorText } from './inviteError';

describe('inviteLoginErrorText', () => {
    // The line printed `https://app.chatic.io/s?code=…` and `invt:…`: a wire format, not something a
    // person holding an invite recognises.
    it.each(['ko', 'en'])('asks for the invite as received, with no URL or code prefix (%s)', language => {
        const text = inviteLoginErrorText({ kind: 'format' }, i18n.getFixedT(language));
        expect(text).not.toMatch(/https?:|invt:/);
        expect(text.length).toBeGreaterThan(0);
    });
});
