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

    // A key with no resource prints as the key itself, so a missing translation shows up as `auth.…`.
    it.each(['ko', 'en'])('has a translated line for every refusal that never reaches the server (%s)', language => {
        for (const kind of ['relay', 'unmarked', 'loggedIn', 'backend'] as const) {
            const text = inviteLoginErrorText({ kind }, i18n.getFixedT(language));
            expect(text).not.toMatch(/^auth\./);
            expect(text.length).toBeGreaterThan(0);
        }
    });
});
