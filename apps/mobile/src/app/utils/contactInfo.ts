import type { Contact } from 'react-native-contacts';

import type { ContactInfo } from '@chatic/app-messages';

/**
 * Normalizes one device contact into the bridge's `ContactInfo`.
 *
 * The two platforms disagree about what an empty field looks like, and `ContactInfo` declares
 * almost everything non-optional, so without this the web receives `undefined` where its own types
 * promise a string:
 *
 * - iOS guards every name key with `if (value)` (`RCTContacts.mm`), so a contact with no first name
 *   arrives with NO `givenName` key at all rather than an empty one.
 * - iOS never sends `displayName`, `backTitle`, `isStarred`, `prefix`, `suffix` or `department` —
 *   those keys do not exist in its payload. Android fills them.
 * - Android derives `displayName` from the structured name (falling back to the organization) and
 *   copies it into an empty `givenName`; iOS does neither.
 *
 * Defaulting is all this does. It deliberately does NOT invent a display name out of the name
 * parts: which part leads is a presentation rule, and the web owns it in one place
 * (`resolveContactName`) so both platforms render by the same rule. See
 * apps/web/docs/feature/channels/invite.md.
 */
export const toContactInfo = (contact: Contact): ContactInfo => ({
    recordID: contact.recordID,
    backTitle: contact.backTitle || '',
    company: contact.company || '',
    emailAddresses: contact.emailAddresses ?? [],
    displayName: contact.displayName || '',
    familyName: contact.familyName || '',
    givenName: contact.givenName || '',
    middleName: contact.middleName || '',
    jobTitle: contact.jobTitle || '',
    phoneNumbers: contact.phoneNumbers ?? [],
    hasThumbnail: contact.hasThumbnail ?? false,
    thumbnailPath: contact.thumbnailPath || '',
    isStarred: contact.isStarred ?? false,
    postalAddresses: contact.postalAddresses ?? [],
    prefix: contact.prefix || '',
    suffix: contact.suffix || '',
    department: contact.department || '',
    // A contact may carry a birthday with no year (iOS then omits the field), which is why
    // `Birthday.year` is optional on the wire.
    birthday: contact.birthday || undefined,
    imAddresses: contact.imAddresses ?? [],
    urlAddresses: contact.urlAddresses ?? [],
    note: contact.note || '',
});
