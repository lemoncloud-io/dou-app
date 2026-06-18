import { useCustomMutation } from '@chatic/shared';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '../../api';
import { verifyNativeAppToken } from '../../api';

export const useVerifyNativeAppToken = () =>
    useCustomMutation<UserTokenView, string, VerifyNativeTokenBody>(body => verifyNativeAppToken(body));
