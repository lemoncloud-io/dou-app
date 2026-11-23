import { describe, expect, it } from 'vitest';

import i18n from '../../../../i18n';
import { inviteLoginErrorText } from './inviteError';

describe('inviteLoginErrorText', () => {
    it.each(['ko', 'en'])('asks for the invite as received, with no URL or code prefix (%s)', language => {
        const text = inviteLoginErrorText({ kind: 'format' }, i18n.getFixedT(language));
        expect(text).not.toMatch(/https?:|invt:/);
        expect(text.length).toBeGreaterThan(0);
    });

    it.each(['ko', 'en'])('has a translated line for every refusal that never reaches the server (%s)', language => {
        for (const kind of ['relay', 'unmarked', 'loggedIn', 'backend'] as const) {
            const text = inviteLoginErrorText({ kind }, i18n.getFixedT(language));
            expect(text).not.toMatch(/^auth\./);
            expect(text.length).toBeGreaterThan(0);
        }
    });

    it('does not call a server refusal a connection failure', () => {
        const t = i18n.getFixedT('en');
        const text = inviteLoginErrorText(
            { kind: 'server', message: '400 INVALID - grace-timeout by invite[910024]' },
            t
        );
        expect(text).not.toBe(t('auth.invite.failed.network'));
    });

    it.each(['ko', 'en'])('gives a used, expired and withdrawn invite each its own line (%s)', language => {
        const t = i18n.getFixedT(language);
        const lines = (['used', 'expired', 'canceled'] as const).map(kind => inviteLoginErrorText({ kind }, t));
        expect(new Set(lines).size).toBe(3);
        for (const line of lines) expect(line).not.toMatch(/^auth\./);
        expect(lines[0]).not.toBe(t('auth.invite.failed.already'));
    });
});
