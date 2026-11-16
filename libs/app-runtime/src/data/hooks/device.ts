import { useCustomMutation } from '@chatic/shared';

import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';

import { runtimeData } from '../dataCommands';

/** Registers a push token by hand (a debug screen), through the engine — wherever the session runs. */
export const useRegisterDeviceTokenMutation = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody & { force?: boolean }>(
        ({ force, ...body }) => runtimeData().registerDeviceToken(body, { force })
    );
