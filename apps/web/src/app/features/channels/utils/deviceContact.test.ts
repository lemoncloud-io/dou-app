import type { ContactInfo } from '@chatic/app-messages';

import {
    contactSearchText,
    resolveContactDisplayPhone,
    resolveContactName,
    resolveContactPhone,
} from './deviceContact';

/**
 * iOS omits a key entirely where Android sends an empty string, so the fixture takes a PARTIAL
 * contact and casts: the platform payload really is narrower than `ContactInfo` promises, and a
 * test that filled every field would only prove the Android case.
 */
const contact = (partial: Partial<ContactInfo>): ContactInfo => ({ recordID: 'c1', ...partial }) as ContactInfo;

const FALLBACK = '이름 없음';

describe('resolveContactName', () => {
    it('prefers displayName when the platform sends one', () => {
        expect(resolveContactName(contact({ displayName: '김민수', givenName: '민수' }), FALLBACK)).toBe('김민수');
    });

    it('composes a Korean name family-first and unspaced when displayName is missing (iOS)', () => {
        expect(resolveContactName(contact({ givenName: '민수', familyName: '김' }), FALLBACK)).toBe('김민수');
    });

    it('composes a Latin name given-first with spaces', () => {
        expect(
            resolveContactName(contact({ givenName: 'Ada', middleName: 'King', familyName: 'Lovelace' }), FALLBACK)
        ).toBe('Ada King Lovelace');
    });

    it('uses the family name alone — the case that used to render blank', () => {
        expect(resolveContactName(contact({ familyName: '김' }), FALLBACK)).toBe('김');
    });

    it('falls back to the company for a business contact', () => {
        expect(resolveContactName(contact({ company: '동네치킨' }), FALLBACK)).toBe('동네치킨');
    });

    it('falls back to the phone number when there is no name at all', () => {
        expect(
            resolveContactName(contact({ phoneNumbers: [{ label: 'mobile', number: '01012345678' }] }), FALLBACK)
        ).toBe('010-1234-5678');
    });

    it('falls back to the label only when there is nothing to show', () => {
        expect(resolveContactName(contact({}), FALLBACK)).toBe(FALLBACK);
    });

    it('ignores whitespace-only fields', () => {
        expect(resolveContactName(contact({ displayName: '  ', givenName: ' ', company: '동네치킨' }), FALLBACK)).toBe(
            '동네치킨'
        );
    });
});

describe('resolveContactDisplayPhone', () => {
    it('prefers the invitable mobile over an earlier landline', () => {
        expect(
            resolveContactDisplayPhone(
                contact({
                    phoneNumbers: [
                        { label: 'work', number: '02-123-4567' },
                        { label: 'mobile', number: '010-1234-5678' },
                    ],
                })
            )
        ).toBe('010-1234-5678');
    });

    it('shows a non-mobile number exactly as stored rather than reformatting it', () => {
        expect(resolveContactDisplayPhone(contact({ phoneNumbers: [{ label: 'work', number: '+1 555 0100' }] }))).toBe(
            '+1 555 0100'
        );
    });

    it('is empty when the contact carries no number', () => {
        expect(resolveContactDisplayPhone(contact({}))).toBe('');
    });

    // 저장된 형태가 제각각이어도 화면에는 한 가지 모양으로 나와야 한다.
    it.each([
        ['010-1234-5678', '010-1234-5678'],
        ['01012345678', '010-1234-5678'],
        ['010 1234 5678', '010-1234-5678'],
        ['(010) 1234-5678', '010-1234-5678'],
        ['010.1234.5678', '010-1234-5678'],
        ['+82 10-1234-5678', '010-1234-5678'],
        ['+821012345678', '010-1234-5678'],
        // 국가번호 뒤에 로컬 0을 남겨 저장한 흔한 형태.
        ['+82 010-1234-5678', '010-1234-5678'],
        // 국번이 짧은 옛 번호는 3-3-4다. 입력용 3-4-4를 그대로 쓰면 011-2345-678이 된다.
        ['011-234-5678', '011-234-5678'],
        ['+82 11-234-5678', '011-234-5678'],
    ])('shows %s as %s', (stored, shown) => {
        expect(resolveContactDisplayPhone(contact({ phoneNumbers: [{ label: 'mobile', number: stored }] }))).toBe(
            shown
        );
    });
});

describe('resolveContactPhone', () => {
    it('scans past a landline to find the mobile', () => {
        expect(
            resolveContactPhone(
                contact({
                    phoneNumbers: [
                        { label: 'home', number: '02-123-4567' },
                        { label: 'mobile', number: '010-1234-5678' },
                    ],
                })
            )
        ).toBe('+821012345678');
    });

    it('accepts a number already stored in international form', () => {
        expect(resolveContactPhone(contact({ phoneNumbers: [{ label: 'mobile', number: '+82 10-1234-5678' }] }))).toBe(
            '+821012345678'
        );
    });

    it('is null when no stored number is a Korean mobile', () => {
        expect(resolveContactPhone(contact({ phoneNumbers: [{ label: 'work', number: '02-123-4567' }] }))).toBeNull();
    });

    it('is null when the contact has no numbers at all', () => {
        expect(resolveContactPhone(contact({}))).toBeNull();
    });

    // 초대는 저장 형태와 무관하게 언제나 같은 E.164로 나가야 한다.
    it.each([
        '010-1234-5678',
        '01012345678',
        '010 1234 5678',
        '(010) 1234-5678',
        '010.1234.5678',
        '+82 10-1234-5678',
        '+821012345678',
        '+82-10-1234-5678',
        '+82 010-1234-5678',
    ])('reads %s as the same E.164', stored => {
        expect(resolveContactPhone(contact({ phoneNumbers: [{ label: 'mobile', number: stored }] }))).toBe(
            '+821012345678'
        );
    });

    it('accepts the older 10-digit mobiles too', () => {
        expect(resolveContactPhone(contact({ phoneNumbers: [{ label: 'mobile', number: '011-234-5678' }] }))).toBe(
            '+82112345678'
        );
        expect(resolveContactPhone(contact({ phoneNumbers: [{ label: 'mobile', number: '+82 11-234-5678' }] }))).toBe(
            '+82112345678'
        );
    });
});

describe('contactSearchText', () => {
    it('matches the company a row is labelled by', () => {
        expect(contactSearchText(contact({ company: '동네치킨' }))).toContain('동네치킨');
    });

    it('matches the number both as shown and as bare digits', () => {
        const text = contactSearchText(contact({ phoneNumbers: [{ label: 'mobile', number: '01012345678' }] }));
        expect(text).toContain('010-1234-5678');
        expect(text).toContain('01012345678');
    });

    it('lowercases so the search input can match case-insensitively', () => {
        expect(contactSearchText(contact({ givenName: 'Ada' }))).toContain('ada');
    });
});
