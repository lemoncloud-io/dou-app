import type { Contact } from 'react-native-contacts';

import { toContactInfo } from './contactInfo';

/**
 * iOS omits a key entirely when the underlying field is empty and never sends `displayName`,
 * `isStarred`, `backTitle`, `prefix`, `suffix` or `department` at all — so the payload really is
 * narrower than `Contact` declares, and the fixture casts rather than filling fields the platform
 * would not send.
 */
const iosContact = (partial: Partial<Contact>): Contact => ({ recordID: 'c1', ...partial }) as Contact;

describe('toContactInfo', () => {
    it('defaults every string the iOS payload leaves out', () => {
        const info = toContactInfo(iosContact({ givenName: '민수' }));

        expect(info).toMatchObject({
            recordID: 'c1',
            givenName: '민수',
            // The keys iOS never sends at all.
            displayName: '',
            familyName: '',
            middleName: '',
            company: '',
            backTitle: '',
            prefix: '',
            suffix: '',
            department: '',
            jobTitle: '',
            thumbnailPath: '',
            note: '',
        });
    });

    it('defaults the collections and flags so the web never reads undefined', () => {
        const info = toContactInfo(iosContact({}));

        expect(info.phoneNumbers).toEqual([]);
        expect(info.emailAddresses).toEqual([]);
        expect(info.postalAddresses).toEqual([]);
        expect(info.imAddresses).toEqual([]);
        expect(info.urlAddresses).toEqual([]);
        expect(info.hasThumbnail).toBe(false);
        expect(info.isStarred).toBe(false);
    });

    it('passes through what the platform did send', () => {
        const info = toContactInfo(
            iosContact({
                displayName: '김민수',
                familyName: '김',
                phoneNumbers: [{ label: 'mobile', number: '010-1234-5678' }],
                hasThumbnail: true,
            })
        );

        expect(info.displayName).toBe('김민수');
        expect(info.familyName).toBe('김');
        expect(info.phoneNumbers).toEqual([{ label: 'mobile', number: '010-1234-5678' }]);
        expect(info.hasThumbnail).toBe(true);
    });

    it('keeps a birthday that carries no year', () => {
        // iOS drops `year` when the contact stored only a month and a day, which is why the wire
        // type makes it optional.
        const info = toContactInfo(iosContact({ birthday: { month: 3, day: 14 } as Contact['birthday'] }));

        expect(info.birthday).toEqual({ month: 3, day: 14 });
    });

    it('reports no birthday rather than an empty one', () => {
        expect(toContactInfo(iosContact({})).birthday).toBeUndefined();
    });
});
