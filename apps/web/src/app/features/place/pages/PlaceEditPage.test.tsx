import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

let mockPlace: Partial<MySiteView> | null = null;
const navigate = jest.fn();
const observeItem = jest.fn();
const updatePlace = jest.fn();
const toast = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({
    useNavigateWithTransition: () => navigate,
    resizeImageToBase64: jest.fn(),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: () => ({ place: { observeItem } }) }));
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

    // `Textarea`는 카운터도 하드 캡도 없다(의도된 설계). 100자 상한은 호출부의 onChange 클램프뿐이라
    // 그 클램프가 사라지면 조용히 초과 입력이 저장된다.
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

    // 이름만 고친 저장이 소개를 덮어쓰면 안 된다 — 서버가 부분 페이로드를 병합한다는 전제가 깨진다.
    it('이름만 고치면 desc를 보내지 않는다', async () => {
        mockPlace = { ...OWNED, desc: '기존 소개' };
        render(<PlaceEditPage />);

        fireEvent.change(screen.getByLabelText(/placeEdit\.nameLabel/), { target: { value: '새 이름' } });
        fireEvent.click(submit());

        await waitFor(() => expect(updatePlace).toHaveBeenCalled());
        expect(updatePlace.mock.calls[0][0]).not.toHaveProperty('desc');
    });

    // 소개를 비우는 것은 "안 바꿈"이 아니라 "지움"이다. 빈 문자열이 실제로 전송돼야 서버가 지운다.
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
