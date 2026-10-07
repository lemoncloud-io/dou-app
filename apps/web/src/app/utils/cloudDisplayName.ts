import type { CloudView } from '@lemoncloud/chatic-backend-api';

/**
 * What an owned cloud is called on a row: its name, else the local part of its recovery email,
 * else nothing — a row with nothing to show says so itself (the switcher asks for a profile).
 *
 * One chain for the switcher and cloud management, so a cloud reads the same in the sheet and a
 * tap later on its own screens. The subscription screens keep their own, longer chain
 * (`features/subscription/lib/format.ts`) because a keep-clouds card must never be blank.
 */
export const cloudDisplayName = (cloud: Pick<CloudView, 'name' | 'email'>): string =>
    cloud.name ?? cloud.email?.split('@')[0] ?? '';
