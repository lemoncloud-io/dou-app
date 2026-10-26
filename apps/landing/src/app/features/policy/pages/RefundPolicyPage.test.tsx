import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import i18n from '../../../../i18n';

import { RefundPolicyPage } from './RefundPolicyPage';

describe('RefundPolicyPage', () => {
    it('marks its text as a proposal until the policy is written', async () => {
        await i18n.changeLanguage('ko');
        render(
            <MemoryRouter>
                <RefundPolicyPage />
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { level: 1, name: '환불정책' })).toBeTruthy();
        expect(screen.getByText('제안')).toBeTruthy();
        // No published version yet, so there is nothing to pick between.
        expect(screen.queryByRole('button')).toBeNull();
    });
});
