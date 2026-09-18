import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

let mockPlace: Partial<MySiteView> | null = null;
const navigate = jest.fn();
const observeItem = jest.fn();
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@chatic/bridges', () => ({ logger: mockLogger }));

const updatePlace = jest.fn();
const toast = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({
    useNavigateWithTransition: () => navigate,
    resizeImageToBase64: jest.fn(),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ place: { observeItem } }),
        },
    },
}));
jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: 'p1' }) }));
// The real `ui` barrel pulls `@chatic/assets` through PrivateLayout, which jest cannot parse.
jest.mock('../../../ui', () => ({ PageHeader: ({ title }: { title: string }) => <div>header:{title}</div> }));
jest.mock('../../../ui/layouts', () => ({
    fixedViewportScreen: '',
    KeyboardAwareLayout: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
        <div>
            {children}
            {footer}
        </div>
    ),
}));
// The save path is what these tests assert; `useUpdatePlace` has no logic of its own beyond the
// pending flag, so the page's payload is observed directly at this seam.
jest.mock('../../home', () => ({ useUpdatePlace: () => ({ updatePlace, isPending: false }) }));

import { PlaceEditPage } from './PlaceEditPage';

const OWNED: Partial<MySiteView> = { id: 'p1', name: '우리 플레이스', isOwner: true };

beforeEach(() => {
    jest.clearAllMocks();
    mockPlace = OWNED;
    updatePlace.mockResolvedValue(undefined);
    // observeItem emits synchronously, the way the local data source does for a warm cache.
    observeItem.mockImplementation((_id: string, cb: (item: unknown) => void) => {
        cb(mockPlace);
        return jest.fn();
    });
});

const descBox = () => screen.getByLabelText('placeEdit.descLabel');
const submit = () => screen.getByRole('button', { name: 'placeEdit.confirm' });

describe('PlaceEditPage — 소개 문구', () => {
    it('현재 소개 문구를 초기값으로 채운다', () => {
        mockPlace = { ...OWNED, desc: '개발자들이 모이는 곳' };
        render(<PlaceEditPage />);

        expect(descBox()).toHaveValue('개발자들이 모이는 곳');
    });

    it('소개가 없으면 빈 값으로 시작한다', () => {
        render(<PlaceEditPage />);

        expect(descBox()).toHaveValue('');
    });

    // `Textarea` has neither a counter nor a hard cap (by design). The 100-char ceiling exists only as
    // the caller's onChange clamp, so if that clamp ever disappears, over-length input would be saved
    // silently.
    it('100자를 넘겨 입력할 수 없다', () => {
        render(<PlaceEditPage />);

        fireEvent.change(descBox(), { target: { value: 'ㄱ'.repeat(150) } });

        expect(descBox()).toHaveValue('ㄱ'.repeat(100));
    });

    it('소개만 고쳐도 저장 버튼이 켜진다', () => {
        render(<PlaceEditPage />);
        expect(submit()).toBeDisabled();

        fireEvent.change(descBox(), { target: { value: '새 소개' } });

        expect(submit()).toBeEnabled();
    });

    it('소개가 바뀌었을 때만 desc를 페이로드에 싣는다', async () => {
        mockPlace = { ...OWNED, desc: '기존 소개' };
        render(<PlaceEditPage />);

        fireEvent.change(descBox(), { target: { value: '바뀐 소개' } });
        fireEvent.click(submit());

        await waitFor(() => expect(updatePlace).toHaveBeenCalled());
        expect(updatePlace).toHaveBeenCalledWith({
            id: 'p1',
            sid: 'p1',
            name: '우리 플레이스',
            desc: '바뀐 소개',
        });
    });

    // A save that only changed the name must not overwrite the introduction — that would break the
    // assumption that the server merges partial payloads.
    it('이름만 고치면 desc를 보내지 않는다', async () => {
        mockPlace = { ...OWNED, desc: '기존 소개' };
        render(<PlaceEditPage />);

        fireEvent.change(screen.getByLabelText(/placeEdit\.nameLabel/), { target: { value: '새 이름' } });
        fireEvent.click(submit());

        await waitFor(() => expect(updatePlace).toHaveBeenCalled());
        expect(updatePlace.mock.calls[0][0]).not.toHaveProperty('desc');
    });

    // Clearing the introduction is "delete", not "no change". The empty string must actually be sent
    // for the server to clear it.
    it('소개를 비우면 빈 문자열을 보낸다', async () => {
        mockPlace = { ...OWNED, desc: '기존 소개' };
        render(<PlaceEditPage />);

        fireEvent.change(descBox(), { target: { value: '' } });
        fireEvent.click(submit());

        await waitFor(() => expect(updatePlace).toHaveBeenCalled());
        expect(updatePlace.mock.calls[0][0]).toMatchObject({ desc: '' });
    });

    // 시드는 placeId로 한 번만 걸린다. 배경 동기화가 같은 place를 다시 방출해도 편집 중 입력을
    // 되돌리면 안 된다.
    it('배경 재방출이 편집 중인 소개를 덮지 않는다', () => {
        mockPlace = { ...OWNED, desc: '기존 소개' };
        const { rerender } = render(<PlaceEditPage />);

        fireEvent.change(descBox(), { target: { value: '작성 중' } });
        rerender(<PlaceEditPage />);

        expect(descBox()).toHaveValue('작성 중');
    });
});

describe('PlaceEditPage — 저장 실패 기록 (ADR-0099)', () => {
    // 토스트가 문자 그대로 "알 수 없는 오류"인데, 지금까지 남는 것도 그만큼이었다.
    it('저장 실패를 어떤 필드가 실렸는지와 함께 error로 남긴다', async () => {
        updatePlace.mockRejectedValue(new Error('save boom'));
        render(<PlaceEditPage />);

        fireEvent.change(screen.getByLabelText(/placeEdit\.nameLabel/), { target: { value: '새 이름' } });
        fireEvent.click(submit());

        await waitFor(() => expect(mockLogger.error).toHaveBeenCalled());
        expect(mockLogger.error.mock.calls[0][0]).toBe('PLACE');
        expect(mockLogger.error.mock.calls[0][1]).toBe('place save failed');
        expect(mockLogger.error.mock.calls[0][2].data).toEqual({
            placeId: 'p1',
            descChanged: false,
            imageChanged: false,
        });
    });

    it('저장이 성공하면 아무것도 남기지 않는다', async () => {
        updatePlace.mockResolvedValue(undefined);
        render(<PlaceEditPage />);

        fireEvent.change(screen.getByLabelText(/placeEdit\.nameLabel/), { target: { value: '새 이름' } });
        fireEvent.click(submit());

        await waitFor(() => expect(updatePlace).toHaveBeenCalled());
        expect(mockLogger.error).not.toHaveBeenCalled();
    });
});
