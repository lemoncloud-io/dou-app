/**
 * Whether a string is shaped like an email address — enough to catch a typo before sending a code.
 * The real check is the code reaching the inbox.
 */
export const isEmailAddress = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
