import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';

// Tracer-bullet i18n: minimal inline resources. The full desktop app will adopt
// the shared remote-backed i18n (see apps/web/src/i18n) in a later phase.
const resources = {
    en: {
        translation: {
            'auth.invite.title': 'Enter invite link or code',
            'auth.invite.placeholder': 'Paste invite link or invt:… code',
            'auth.invite.submit': 'Join',
            'auth.invite.preparing': 'Preparing...',
            'auth.invite.failed': 'Login failed. Check the code and try again.',
            'auth.token.loggingIn': 'Signing in...',
            'auth.token.invalid': 'Invalid access link.',
            'chat.composer.placeholder': 'Message',
            'chat.empty': 'Select a channel to start chatting',
            'chat.noChannels': 'No channels yet',
            'chat.loading': 'Loading...',
            'chat.today': 'Today',
            'chat.yesterday': 'Yesterday',
            'rail.noPlaces': 'No places',
            'rail.addChannel': 'Add channel',
            'rail.menu.profile': 'Profile',
            'rail.menu.settings': 'Settings',
            'rail.menu.logout': 'Log out',
            'channels.create.title': 'Create channel',
            'channels.create.nameLabel': 'Channel name',
            'channels.create.namePlaceholder': 'e.g. marketing',
            'channels.create.visibility': 'Visibility',
            'channels.create.public': 'Public',
            'channels.create.private': 'Private',
            'channels.create.submit': 'Create',
            'channels.create.creating': 'Creating...',
            'channels.create.cancel': 'Cancel',
            'channels.create.failed': 'Could not create the channel. Try again.',
            'settings.title': 'Settings',
            'settings.appearance': 'Appearance',
            'settings.theme': 'Theme',
            'settings.theme.light': 'Light',
            'settings.theme.dark': 'Dark',
            'settings.theme.system': 'System',
            'settings.language': 'Language',
            'settings.back': 'Back',
            'profile.title': 'My profile',
            'profile.name': 'Name',
            'profile.email': 'Email',
            'profile.id': 'User ID',
            'profile.back': 'Back',
            'profile.unknown': '-',
        },
    },
} as const;

void i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
});

export default i18n;
