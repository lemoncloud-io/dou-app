import { describe, expect, it } from 'vitest';

import { en } from './en';
import { ko } from './ko';

/**
 * The account-area copy guards: one noun, one destroy verb, one name cap (20,
 * the web edit page and the Figma-cited design limit). Literal on purpose —
 * these exact lines shipped wrong once, and a paraphrase is what let them.
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

// Every key ships in both languages: a key added to one locale and not the
// other renders as the raw key on half the installs.
describe('locale parity', () => {
    it('has the same keys in Korean and English', () => {
        const koKeys = Object.keys(ko).sort();
        const enKeys = Object.keys(en).sort();
        expect(enKeys).toEqual(koKeys);
    });
});

// One glossary: "끔" / "멘션만" for a channel, "방해 금지 시간" for the schedule,
// "일시 중지" for snooze — and the inbox owns `inbox.*` keys, not `saved.*`.
describe('notification vocabulary', () => {
    it('names the channel levels 끔 and 멘션만 on the row', () => {
        expect(ko['sidebar.muted']).toBe('끔');
        expect(ko['sidebar.mentionsOnly']).toBe('멘션만');
        expect(en['sidebar.muted']).toBe('Off');
    });

    it('names snooze 일시 중지, not 꺼짐', () => {
        expect(ko['snooze.activeUntil']).toContain('일시 중지');
        expect(ko['snooze.activeUntil']).not.toContain('꺼짐');
        expect(en['snooze.activeUntil']).toContain('Snoozed');
    });

    it('tells the two device switches apart by when they fire', () => {
        expect(ko['settings.desktopNotificationsHint']).toContain('켜져');
        expect(ko['settings.devicePushHint']).toContain('꺼져');
    });

    it('explains the breakthrough without jargon, naming what stays silent', () => {
        for (const key of ['settings.quietHoursMention', 'settings.quietHoursMentionHint'] as const) {
            expect(ko[key]).not.toMatch(/지목|멘션 기록/);
        }
        for (const word of ['@전체', 'DM', '끔', '일시 중지', '다른 클라우드']) {
            expect(ko['settings.quietHoursMentionHint']).toContain(word);
        }
    });

    it('gives the inbox its own keys', () => {
        for (const bundle of [ko, en]) {
            expect(bundle['inbox.deviceLocal']).toBeTruthy();
            expect(bundle['inbox.empty']).toBeTruthy();
        }
        expect(ko['inbox.deviceLocal']).not.toContain('저장');
    });
});
