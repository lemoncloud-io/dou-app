import { useCustomMutation } from '@chatic/shared';
import type { RegisterUserV2Body } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/data';
import { registerUserV2 } from '../../auth/authActions';

// 반환형 주석은 useRegisterUser 참고 — data 레이어 경유로 `DomainUser`가 된다.
export const useRegisterUserV2 = () =>
    useCustomMutation<DomainUser, string, RegisterUserV2Body & { email?: boolean }>(
        ({ email, ...body }) => registerUserV2(body, email),
        {}
    );
