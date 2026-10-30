import { render, screen } from '@testing-library/react';

import i18n from '../../../../i18n';
import { registerSubscriptionCopy } from '../lib/i18n';
import { MOCK_PLANS } from '../lib/mock';
import { PlanCard } from './PlanCard';

registerSubscriptionCopy();

describe('PlanCard', () => {
    afterAll(() => i18n.changeLanguage('en'));

    it('shows the amount with the period beside it, then the VAT note, in English', async () => {
        await i18n.changeLanguage('en');
        render(<PlanCard plan={MOCK_PLANS[4]} />);

        const amount = screen.getByText('₩43,000');
        expect(amount.parentElement?.textContent).toBe('₩43,000 / month(VAT included)');
        expect(screen.getByText('5 clouds')).toBeTruthy();
    });

    it('shows the whole price and the VAT note in Korean', async () => {
        await i18n.changeLanguage('ko');
        render(<PlanCard plan={MOCK_PLANS[0]} />);

        expect(screen.getByText('₩8,600/월')).toBeTruthy();
        expect(screen.getByText('(VAT 포함)')).toBeTruthy();
        expect(screen.getByText('클라우드 1개')).toBeTruthy();
    });

    it('names one cloud in the singular in English', async () => {
        await i18n.changeLanguage('en');
        render(<PlanCard plan={MOCK_PLANS[0]} />);

        expect(screen.getByText('1 cloud')).toBeTruthy();
    });
});
