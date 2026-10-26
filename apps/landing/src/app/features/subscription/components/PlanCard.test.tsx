import { render, screen } from '@testing-library/react';

import i18n from '../../../../i18n';
import { registerSubscriptionCopy } from '../lib/i18n';
import { MOCK_PLANS } from '../lib/mock';
import { PlanCard } from './PlanCard';

registerSubscriptionCopy();

describe('PlanCard', () => {
    afterAll(() => i18n.changeLanguage('en'));

    it('sets only the amount large in English, with the period beside it', async () => {
        await i18n.changeLanguage('en');
        render(<PlanCard plan={MOCK_PLANS[4]} />);

        const amount = screen.getByText('₩43,000');
        expect(amount.className).toContain('text-2xl');
        expect(amount.parentElement?.textContent).toBe('₩43,000 / month');
        expect(screen.getByText('5 clouds')).toBeTruthy();
    });

    it('sets the whole price large in Korean', async () => {
        await i18n.changeLanguage('ko');
        render(<PlanCard plan={MOCK_PLANS[0]} />);

        expect(screen.getByText('월 ₩8,600').className).toContain('text-2xl');
        expect(screen.getByText('클라우드 1개')).toBeTruthy();
    });

    it('names one cloud in the singular in English', async () => {
        await i18n.changeLanguage('en');
        render(<PlanCard plan={MOCK_PLANS[0]} />);

        expect(screen.getByText('1 cloud')).toBeTruthy();
    });
});
