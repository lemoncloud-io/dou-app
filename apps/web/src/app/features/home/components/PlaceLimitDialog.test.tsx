import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { PlaceLimitDialog } from './PlaceLimitDialog';

jest.mock('react-i18next', () => ({
    // Echo the key so assertions can target keys directly; append the interpolation so the {{max}}
    // hand-off is observable.
    useTranslation: () => ({
        t: (key: string, opts?: { max?: number }) => (opts?.max === undefined ? key : `${key}:${opts.max}`),
    }),
    // The body copy carries <strong> emphasis from the translation, so it renders through Trans
    // rather than a bare `t()`. Same key-echo convention, so `key:max` assertions still hold.
    Trans: ({ i18nKey, values }: { i18nKey: string; values?: { max?: number } }) =>
        values?.max === undefined ? i18nKey : `${i18nKey}:${values.max}`,
}));

const manage = () => screen.getByRole('button', { name: 'homePage.placeLimit.manage' });
const addCloud = () => screen.getByRole('button', { name: 'homePage.placeLimit.addCloud' });

const renderDialog = (props: Partial<React.ComponentProps<typeof PlaceLimitDialog>> = {}) => {
    const onOpenChange = jest.fn();
    const onManagePlaces = jest.fn();
    const onAddCloud = jest.fn();
    render(
        <PlaceLimitDialog
            open
            onOpenChange={onOpenChange}
            maxPlaces={5}
            onManagePlaces={onManagePlaces}
            onAddCloud={onAddCloud}
            {...props}
        />
    );
    return { onOpenChange, onManagePlaces, onAddCloud };
};

beforeEach(() => jest.clearAllMocks());

describe('PlaceLimitDialog', () => {
    it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
        renderDialog({ open: false });

        expect(screen.queryByText('homePage.placeLimit.title')).not.toBeInTheDocument();
    });

    it('제목과 함께 클라우드당 최대 개수를 본문에 넣어 보여준다', () => {
        renderDialog();

        expect(screen.getByText('homePage.placeLimit.title')).toBeInTheDocument();
        expect(screen.getByText('homePage.placeLimit.description:5')).toBeInTheDocument();
    });

    it('플레이스 관리는 닫은 뒤 관리 화면 콜백을 호출한다', () => {
        const { onOpenChange, onManagePlaces, onAddCloud } = renderDialog();

        fireEvent.click(manage());

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onManagePlaces).toHaveBeenCalledTimes(1);
        expect(onAddCloud).not.toHaveBeenCalled();
    });

    it('클라우드 추가는 닫은 뒤 클라우드 추가 플로우를 호출한다', () => {
        const { onOpenChange, onAddCloud, onManagePlaces } = renderDialog();

        fireEvent.click(addCloud());

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onAddCloud).toHaveBeenCalledTimes(1);
        expect(onManagePlaces).not.toHaveBeenCalled();
    });

    it('접속한 플레이스가 없으면 플레이스 관리는 비활성된다', () => {
        // The settings route is keyed by a site id — with none active there is nowhere to go, so the
        // action is disabled instead of navigating nowhere. 클라우드 추가 stays available.
        const { onOpenChange } = renderDialog({ onManagePlaces: undefined });

        expect(manage()).toBeDisabled();
        fireEvent.click(manage());

        expect(onOpenChange).not.toHaveBeenCalled();
        expect(addCloud()).toBeEnabled();
    });

    it('X로 닫으면 열림 상태를 내려준다', () => {
        const { onOpenChange } = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
