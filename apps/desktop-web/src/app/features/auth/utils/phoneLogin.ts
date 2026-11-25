import { runtime } from '@chatic/runtime-react';

export const isPhoneLoginEnabled = (): boolean => runtime.settings.get<boolean>('feature.auth.phoneLogin') !== false;

export const phoneSignupNoteKey = (): 'auth.social.phoneSignupNote' | 'auth.social.phoneSignupNotePhone' =>
    isPhoneLoginEnabled() ? 'auth.social.phoneSignupNotePhone' : 'auth.social.phoneSignupNote';

export const PHONE_BUTTON_CLASS = 'dark:bg-accent dark:hover:bg-accent/80';
