import { useCustomMutation } from '@chatic/shared';
import type { UserBody } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { registerUser } from '../../auth/authActions';

// 반환형이 `UserView`에서 `DomainUser`로 바뀌었다 — 이제 data 레이어를 지나면서 도메인 모양으로
// 매핑되기 때문이다. 결과를 읽는 호출부는 없다(등록 성공 여부만 본다).
export const useRegisterUser = () =>
    useCustomMutation<DomainUser, string, UserBody>(registerUser, {
        onSuccess: () => {
            logger.info('AUTH', 'User registered successfully');
        },
    });
