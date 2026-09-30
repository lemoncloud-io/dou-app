import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { ResizablePanel } from '../../../shared';
import { DesktopLayout } from './DesktopLayout';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const renderAt = (width: number, onClose = vi.fn()) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    render(
        <DesktopLayout
            rail={<span />}
            sidebar={<span />}
            main={<button type="button">in the chat</button>}
            panel={
                <ResizablePanel storageKey="test.panel" resizeLabel="Resize" onClose={onClose}>
                    <p>panel</p>
                </ResizablePanel>
            }
        />,
        { wrapper }
    );
    return onClose;
};

describe('DesktopLayout trailing panel', () => {
    beforeEach(() => localStorage.clear());
    afterEach(cleanup);

    // Below 1280px the panel covers the chat. The chat stayed live under it: in the tab
    // order, clickable, with focus left behind in it.
    it('dims and disables the chat it covers, and takes focus', () => {
        const onClose = renderAt(1024);
        expect(screen.getByRole('main').hasAttribute('inert')).toBe(true);
        expect(document.activeElement?.tagName).toBe('ASIDE');
        fireEvent.click(document.querySelector('.bg-overlay\\/40') as Element);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('leaves the chat alone when the panel docks beside it', () => {
        renderAt(1440);
        expect(screen.getByRole('main').hasAttribute('inert')).toBe(false);
        expect(document.querySelector('.bg-overlay\\/40')).toBeNull();
    });

    // The panel's own focus move ran before the opener was recorded, so the panel took
    // itself for the opener and closing left focus on <body>.
    it('hands focus back to what opened it when it closes', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const layout = (panel: boolean) => (
            <DesktopLayout
                rail={<span />}
                sidebar={<span />}
                main={<span />}
                panel={
                    panel ? (
                        <ResizablePanel storageKey="test.panel" resizeLabel="Resize" onClose={vi.fn()}>
                            <p>panel</p>
                        </ResizablePanel>
                    ) : undefined
                }
            />
        );
        const { rerender } = render(layout(true), { wrapper });
        expect(document.activeElement?.tagName).toBe('ASIDE');
        rerender(layout(false));
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    // A thread shown again under a closed profile records the profile's close button as its
    // opener. Once that is gone, closing the thread left focus on <body>.
    it('puts focus in the message box when what opened it has left the page', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const layout = (panel: boolean) => (
            <DesktopLayout
                rail={<span />}
                sidebar={<span />}
                main={<div data-composer-input tabIndex={0} aria-label="Message" />}
                panel={
                    panel ? (
                        <ResizablePanel storageKey="test.panel" resizeLabel="Resize" onClose={vi.fn()}>
                            <p>panel</p>
                        </ResizablePanel>
                    ) : undefined
                }
            />
        );
        const { rerender } = render(layout(true), { wrapper });
        opener.remove();
        rerender(layout(false));
        await Promise.resolve();
        expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    });
});
