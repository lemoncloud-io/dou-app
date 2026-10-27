import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import i18n from '../../../../i18n';
import { Footer } from './Footer';

const renderFooter = () =>
    render(
        <MemoryRouter>
            <Footer />
        </MemoryRouter>
    );

describe('Footer', () => {
    beforeAll(() => i18n.changeLanguage('ko'));
    afterAll(() => i18n.changeLanguage('en'));

    it('prints the business details with the registration number, phone and mail filled in', () => {
        renderFooter();

        expect(screen.getByText('(주)레몬클라우드')).toBeTruthy();
        expect(screen.getByText('사업자등록번호 : 596-87-01011')).toBeTruthy();
        expect(screen.getByText('TEL : 02-424-1212')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'lemon@lemoncloud.io' }).getAttribute('href')).toBe(
            'mailto:lemon@lemoncloud.io'
        );
    });

    it('links to the three policies', () => {
        renderFooter();

        expect(screen.getByRole('link', { name: '서비스 이용 약관' }).getAttribute('href')).toBe('/policy/terms');
        expect(screen.getByRole('link', { name: '개인정보 처리방침' }).getAttribute('href')).toBe('/policy/privacy');
        expect(screen.getByRole('link', { name: '아동 안전 및 운영 기준' }).getAttribute('href')).toBe('/policy/child');
    });
});
