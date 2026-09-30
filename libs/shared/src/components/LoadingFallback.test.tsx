import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';

import { LoadingFallback } from './LoadingFallback';

const renderInKorean = async (ui: React.ReactElement) => {
    const i18n = createInstance();
    await i18n.init({
        lng: 'ko',
        resources: { ko: { translation: { common: { loading: '불러오는 중' } } } },
    });
    return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
};

describe('LoadingFallback', () => {
    it('is a status region named from the locale when no message is given', async () => {
        await renderInKorean(<LoadingFallback />);

        expect(screen.getByRole('status', { name: '불러오는 중' })).toBeTruthy();
    });

    it('falls back to the English name before any translations exist', () => {
        // The boot splash renders before i18n is ready; react-i18next warns about exactly that.
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        render(<LoadingFallback />);

        expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
        warn.mockRestore();
    });

    it('takes its name from the message, which it also shows', async () => {
        await renderInKorean(<LoadingFallback message="로그아웃 중" />);

        const status = screen.getByRole('status', { name: '로그아웃 중' });
        expect(status.textContent).toContain('로그아웃 중');
    });

    it('keeps the logo out of what is announced', async () => {
        await renderInKorean(<LoadingFallback />);

        expect(screen.queryByRole('img')).toBeNull();
    });
});
