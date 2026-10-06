import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';

const reportIssue = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock('@chatic/app-runtime', () => ({ runtime: { report: { reportIssue } } }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

import '../../../../i18n';
import { ReportIssueDialog } from './ReportIssueDialog';

const setup = () => {
    const onOpenChange = vi.fn();
    render(<ReportIssueDialog open onOpenChange={onOpenChange} />);
    return {
        onOpenChange,
        title: screen.getByLabelText(i18next.t('settings.report.titleLabel')) as HTMLInputElement,
        body: screen.getByLabelText(i18next.t('settings.report.bodyLabel')) as HTMLTextAreaElement,
        submit: screen.getByRole('button', { name: i18next.t('settings.report.submit') }) as HTMLButtonElement,
    };
};

beforeEach(() => {
    vi.clearAllMocks();
    reportIssue.mockResolvedValue(undefined);
});

describe('ReportIssueDialog', () => {
    it('cannot send with an empty title or an empty description', () => {
        const { title, body, submit } = setup();
        expect(submit.disabled).toBe(true);

        fireEvent.change(title, { target: { value: 'Broken' } });
        expect(submit.disabled).toBe(true);

        fireEvent.change(title, { target: { value: '   ' } });
        fireEvent.change(body, { target: { value: 'It crashes' } });
        expect(submit.disabled).toBe(true);

        fireEvent.submit(submit.closest('form') as HTMLFormElement);
        expect(reportIssue).not.toHaveBeenCalled();
    });

    it('sends the trimmed text, announces success and closes', async () => {
        const { onOpenChange, title, body, submit } = setup();
        fireEvent.change(title, { target: { value: '  Broken  ' } });
        fireEvent.change(body, { target: { value: ' It crashes ' } });
        fireEvent.click(submit);

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(reportIssue).toHaveBeenCalledWith('Broken', 'It crashes', expect.any(Object));
        expect(toast).toHaveBeenCalledWith({ title: i18next.t('settings.report.success') });
    });

    it('stays open with the text and shows an error when sending fails', async () => {
        reportIssue.mockRejectedValue(new Error('network down'));
        const { onOpenChange, title, body, submit } = setup();
        fireEvent.change(title, { target: { value: 'Broken' } });
        fireEvent.change(body, { target: { value: 'It crashes' } });
        fireEvent.click(submit);

        expect((await screen.findByRole('alert')).textContent).toBe(i18next.t('settings.report.failed'));
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
        expect(title.value).toBe('Broken');
        expect(body.value).toBe('It crashes');
    });

    it('disables the form while sending', async () => {
        let finish: () => void = () => undefined;
        reportIssue.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
        const { title, body, submit } = setup();
        fireEvent.change(title, { target: { value: 'Broken' } });
        fireEvent.change(body, { target: { value: 'It crashes' } });
        fireEvent.click(submit);

        await waitFor(() => expect(submit.disabled).toBe(true));
        expect(title.disabled).toBe(true);
        expect(body.disabled).toBe(true);
        expect(submit.textContent).toBe(i18next.t('settings.report.sending'));

        finish();
        await waitFor(() => expect(reportIssue).toHaveBeenCalledTimes(1));
    });
});
