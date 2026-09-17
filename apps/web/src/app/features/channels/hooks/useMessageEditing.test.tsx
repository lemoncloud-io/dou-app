import { act, renderHook, waitFor } from '@testing-library/react';

import type { ClientChatView } from '../types';
import { useMessageEditing } from './useMessageEditing';

const editMessage = jest.fn();
const deleteServerMessage = jest.fn();
const toast = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));
jest.mock('./useChatMutations', () => ({
    useChatMutations: () => ({
        editMessage,
        deleteServerMessage,
        isPending: { send: false, edit: new Set<string>(), deleteServer: new Set<string>() },
    }),
}));

const message = (overrides: Partial<ClientChatView> = {}): ClientChatView =>
    ({
        id: 'ch-1:4',
        channelId: 'ch-1',
        chatNo: 4,
        content: 'before',
        ownerId: 'me',
        isOwner: true,
        isSystem: false,
        ownerName: 'me',
        timestamp: new Date(),
        ...overrides,
    }) as ClientChatView;

beforeEach(() => {
    jest.clearAllMocks();
    editMessage.mockResolvedValue(undefined);
    deleteServerMessage.mockResolvedValue(undefined);
});

describe('useMessageEditing — 편집', () => {
    // 이 레인의 단일 최대 위험. 버블은 200자에서 잘라 그리는데, 편집기에 그 잘린 문자열이 들어가면
    // 한 글자만 고쳐 저장해도 뒷부분이 영구히 사라진다. 계약은 "편집기는 메시지의 본문 값을 받는다".
    it('200자를 넘는 메시지를 고쳐도 뒷부분이 남는다', async () => {
        const long = `${'가'.repeat(260)}END`;
        const { result } = renderHook(() => useMessageEditing());

        act(() => result.current.startEdit(message({ content: long })));

        const state = result.current.editStateFor(message({ content: long }));
        // 잘린 값이 아니라 전문이 실려 있다.
        expect(state?.draft).toBe(long);
        expect(state?.draft).toHaveLength(263);

        act(() => state?.onDraftChange(`${long}!`));
        await act(async () => {
            result.current.editStateFor(message({ content: long }))?.onSave();
        });

        await waitFor(() => expect(editMessage).toHaveBeenCalledWith('ch-1:4', `${long}!`));
        // 저장된 값이 잘린 200자로 시작해 끝나는 것이 아니라, 원문 전체를 들고 있다.
        expect(editMessage.mock.calls[0][1]).toContain('END');
    });

    it('저장에 성공해야 편집이 닫힌다', async () => {
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.startEdit(message()));
        act(() => result.current.editStateFor(message())?.onDraftChange('after'));

        await act(async () => {
            result.current.editStateFor(message())?.onSave();
        });

        await waitFor(() => expect(result.current.isEditing).toBe(false));
    });

    // §4가 지키려는 것: 실패해도 사용자가 친 글이 남아 있고 다시 저장할 수 있다.
    it('저장에 실패하면 편집 상태와 친 내용이 남고 다시 저장할 수 있다', async () => {
        editMessage.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.startEdit(message()));
        act(() => result.current.editStateFor(message())?.onDraftChange('내가 친 내용'));

        await act(async () => {
            result.current.editStateFor(message())?.onSave();
        });

        await waitFor(() => expect(result.current.editStateFor(message())?.hasFailed).toBe(true));
        expect(result.current.isEditing).toBe(true);
        expect(result.current.editStateFor(message())?.draft).toBe('내가 친 내용');

        editMessage.mockResolvedValueOnce(undefined);
        await act(async () => {
            result.current.editStateFor(message())?.onSave();
        });

        await waitFor(() => expect(result.current.isEditing).toBe(false));
        expect(editMessage).toHaveBeenLastCalledWith('ch-1:4', '내가 친 내용');
    });

    it('비우거나 원문 그대로면 저장하지 않는다 — 비우기는 삭제가 아니다', async () => {
        const { result } = renderHook(() => useMessageEditing());

        act(() => result.current.startEdit(message()));
        act(() => result.current.editStateFor(message())?.onDraftChange('   '));
        await act(async () => {
            result.current.editStateFor(message())?.onSave();
        });
        expect(editMessage).not.toHaveBeenCalled();

        act(() => result.current.startEdit(message()));
        await act(async () => {
            result.current.editStateFor(message())?.onSave();
        });
        expect(editMessage).not.toHaveBeenCalled();
    });

    it('고친 내용이 있는 채로 벗어나려 하면 확인을 받는다', () => {
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.startEdit(message()));

        // 손대지 않았으면 묻지 않고 닫는다.
        act(() => result.current.requestCloseEdit());
        expect(result.current.isEditing).toBe(false);

        act(() => result.current.startEdit(message()));
        act(() => result.current.editStateFor(message())?.onDraftChange('고침'));
        act(() => result.current.requestCloseEdit());

        expect(result.current.discardOpen).toBe(true);
        expect(result.current.isEditing).toBe(true);
    });

    it('편집기는 대상 메시지에만 붙는다', () => {
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.startEdit(message()));

        expect(result.current.editStateFor(message())).toBeDefined();
        expect(result.current.editStateFor(message({ id: 'ch-1:9' }))).toBeUndefined();
    });
});

describe('useMessageEditing — 서버 삭제', () => {
    it('확인을 거쳐 서버 삭제를 부른다', async () => {
        const { result } = renderHook(() => useMessageEditing());

        act(() => result.current.requestDelete(message()));
        expect(result.current.deleteTarget?.id).toBe('ch-1:4');

        await act(async () => {
            await result.current.confirmDelete();
        });

        expect(deleteServerMessage).toHaveBeenCalledWith('ch-1:4');
        await waitFor(() => expect(result.current.deleteTarget).toBeNull());
    });

    // 낙관적 처리가 없으므로 되돌릴 것이 없다 — 안내만 남는다.
    it('삭제에 실패하면 안내만 띄운다', async () => {
        deleteServerMessage.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.requestDelete(message()));

        await act(async () => {
            await result.current.confirmDelete();
        });

        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'chat.room.deleteMessageFailed', variant: 'destructive' })
        );
    });
});
