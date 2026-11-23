import type { Contact } from 'react-native-contacts';

import type { ContactInfo } from '@chatic/bridge-messages';

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
    birthday: contact.birthday || undefined,
    imAddresses: contact.imAddresses ?? [],
    urlAddresses: contact.urlAddresses ?? [],
    note: contact.note || '',
});
