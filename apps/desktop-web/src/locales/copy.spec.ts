import { describe, expect, it } from 'vitest';

import { en } from './en';
import { ko } from './ko';

/**
 * The cloud-vocabulary guards of the account-area backlog: one noun
 * (클라우드), one destroy verb (삭제), one name cap (20, the web edit page
 * and the Figma-cited design limit). Literal on purpose — these exact lines
 * shipped wrong once, and a paraphrase is what let them.
 */
describe('account-area copy', () => {
    it('names the cloud, not the workspace, in the guest body', () => {
        for (const bundle of [ko, en]) {
            expect(bundle['account.guestBody']).not.toMatch(/워크스페이스|workspace/i);
        }
        expect(ko['account.guestBody']).toContain('클라우드');
    });

    it('fixes the notifications hint to what the section holds', () => {
        expect(ko['settings.notificationsHint']).not.toContain('채널별');
        expect(en['settings.notificationsHint']).not.toContain('Per-channel');
    });

    it('destroys hub clouds with the delete verb, not release', () => {
        expect(ko['cloud.hub.releaseConfirm']).toBe('삭제');
        expect(ko['cloud.hub.releaseTitle']).toContain('삭제');
        expect(en['cloud.hub.releaseConfirm']).toBe('Delete');
    });

    it('caps the cloud name at 20 like the web edit page', () => {
        expect(ko['cloud.rename.lengthHint']).toContain('20');
        expect(en['cloud.rename.lengthHint']).toContain('20');
    });
});
