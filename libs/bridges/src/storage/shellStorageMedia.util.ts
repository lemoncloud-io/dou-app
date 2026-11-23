import type { StorageMedium } from '@chatic/bridge-messages';

import { hostProfile } from '../host/hostProfile';

export const shellKeepsStorageMedium = (medium: StorageMedium): boolean => hostProfile().storageMedia.includes(medium);
