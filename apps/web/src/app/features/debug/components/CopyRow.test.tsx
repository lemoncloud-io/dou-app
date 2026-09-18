import '@testing-library/jest-dom';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CopyRow } from './CopyRow';

const copyTextWithResult = jest.fn();
jest.mock('../lib/copyText', () => ({ copyTextWithResult: (value: string) => copyTextWithResult(value) }));

describe('CopyRow — 행 전체가 복사 대상', () => {
    beforeEach(() => {
        copyTextWithResult.mockReset();
        copyTextWithResult.mockResolvedValue(true);
    });

    it('보이는 값과 복사되는 값이 다를 수 있다', async () => {
        // The device info and push screens do this — the screen shows '(not fetched)' but copies the raw value.
        render(<CopyRow label="Token" value="abc…(줄임)" copyValue="abcdef-full" />);

        await userEvent.click(screen.getByRole('button'));

        expect(copyTextWithResult).toHaveBeenCalledWith('abcdef-full');
    });

    // Showing a failure on a row that has nothing to copy would send a tester chasing an error they can't act on.
    it('복사할 값이 없으면 눌리지 않는다', async () => {
        render(<CopyRow label="Token" value="(not fetched)" copyValue={null} />);

        const row = screen.getByRole('button');
        expect(row).toBeDisabled();
        await userEvent.click(row);

        expect(copyTextWithResult).not.toHaveBeenCalled();
    });

    it('실패하면 아이콘이 경고로 바뀐다', async () => {
        copyTextWithResult.mockResolvedValue(false);
        render(<CopyRow label="Token" value="v" copyValue="v" />);

        await userEvent.click(screen.getByRole('button'));

        // The icon has no accessible name, so check it by status color — only failure uses destructive.
        await waitFor(() => expect(screen.getByRole('button').querySelector('.text-destructive')).toBeInTheDocument());
    });
});
