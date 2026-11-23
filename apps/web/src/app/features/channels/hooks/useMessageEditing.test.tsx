import { act, renderHook, waitFor } from '@testing-library/react';

import type { ClientChatView } from '../types';
import { useMessageEditing } from './useMessageEditing';
import { deleteConfirmQuote } from '../utils/messagePlainText';

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
    it('200자를 넘는 메시지를 고쳐도 뒷부분이 남는다', async () => {
        const long = `${'가'.repeat(260)}END`;
        const { result } = renderHook(() => useMessageEditing());

        act(() => result.current.startEdit(message({ content: long })));

        const state = result.current.composer;
        expect(state?.draft).toBe(long);
        expect(state?.draft).toHaveLength(263);

        act(() => state?.onDraftChange(`${long}!`));
        await act(async () => {
            result.current.composer?.onSave();
        });

        await waitFor(() => expect(editMessage).toHaveBeenCalledWith('ch-1:4', `${long}!`));
        expect(editMessage.mock.calls[0][1]).toContain('END');
    });

    it('저장에 성공해야 편집이 닫힌다', async () => {
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.startEdit(message()));
        act(() => result.current.composer?.onDraftChange('after'));

        await act(async () => {
            result.current.composer?.onSave();
        });

        await waitFor(() => expect(result.current.isEditing).toBe(false));
    });

    it('저장에 실패하면 편집 상태와 친 내용이 남고 다시 저장할 수 있다', async () => {
        editMessage.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.startEdit(message()));
        act(() => result.current.composer?.onDraftChange('내가 친 내용'));

        await act(async () => {
            result.current.composer?.onSave();
        });

        await waitFor(() => expect(result.current.composer?.hasFailed).toBe(true));
        expect(result.current.isEditing).toBe(true);
        expect(result.current.composer?.draft).toBe('내가 친 내용');

        editMessage.mockResolvedValueOnce(undefined);
        await act(async () => {
            result.current.composer?.onSave();
        });

        await waitFor(() => expect(result.current.isEditing).toBe(false));
        expect(editMessage).toHaveBeenLastCalledWith('ch-1:4', '내가 친 내용');
    });

    it('비우거나 원문 그대로면 저장하지 않는다 — 비우기는 삭제가 아니다', async () => {
        const { result } = renderHook(() => useMessageEditing());

        act(() => result.current.startEdit(message()));
        act(() => result.current.composer?.onDraftChange('   '));
        await act(async () => {
            result.current.composer?.onSave();
        });
        expect(editMessage).not.toHaveBeenCalled();

        act(() => result.current.startEdit(message()));
        await act(async () => {
            result.current.composer?.onSave();
        });
        expect(editMessage).not.toHaveBeenCalled();
    });

    it('고친 내용이 있는 채로 벗어나려 하면 확인을 받는다', () => {
        const { result } = renderHook(() => useMessageEditing());
        act(() => result.current.startEdit(message()));

        act(() => result.current.requestCloseEdit());
        expect(result.current.isEditing).toBe(false);

        act(() => result.current.startEdit(message()));
        act(() => result.current.composer?.onDraftChange('고침'));
        act(() => result.current.requestCloseEdit());

        expect(result.current.discardOpen).toBe(true);
        expect(result.current.isEditing).toBe(true);
    });

    it('marks only the message being edited as the target', () => {
        const { result } = renderHook(() => useMessageEditing());
        expect(result.current.isEditTarget(message())).toBe(false);

        act(() => result.current.startEdit(message()));

        expect(result.current.isEditTarget(message())).toBe(true);
        expect(result.current.isEditTarget(message({ id: 'ch-1:9' }))).toBe(false);
    });

    it('hands the composer the original body alongside the draft', () => {
        const { result } = renderHook(() => useMessageEditing());
        expect(result.current.composer).toBeUndefined();

        act(() => result.current.startEdit(message()));
        act(() => result.current.composer?.onDraftChange('after'));

        expect(result.current.composer).toMatchObject({ targetId: 'ch-1:4', original: 'before', draft: 'after' });
    });

    it('quotes the body flattened, while the draft keeps it as written', () => {
        const { result } = renderHook(() => useMessageEditing());

        act(() => result.current.startEdit(message({ content: 'line one\n**line two**' })));

        expect(result.current.composer?.original).toBe(deleteConfirmQuote('line one\n**line two**'));
        expect(result.current.composer?.original).not.toContain('\n');
        expect(result.current.composer?.draft).toBe('line one\n**line two**');
    });

    it('drops the edit when the surface moves to another conversation', () => {
        const { result, rerender } = renderHook(({ scope }) => useMessageEditing(scope), {
            initialProps: { scope: 'ch-1' },
        });
        act(() => result.current.startEdit(message()));
        expect(result.current.composer).toBeDefined();

        rerender({ scope: 'ch-2' });

        expect(result.current.composer).toBeUndefined();
        expect(result.current.isEditing).toBe(false);
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
