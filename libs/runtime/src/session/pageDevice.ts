import { pairingClientOf as pairingClientOfDevice } from '@chatic/auth';

import { handedInPlatform } from '../platform';

export const pairingClientOf = () => pairingClientOfDevice(handedInPlatform()?.device());
