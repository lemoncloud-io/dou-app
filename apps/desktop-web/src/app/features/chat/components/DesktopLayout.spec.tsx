import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { ResizablePanel } from '../../../shared';
import { DesktopLayout, useShellSidebar } from './DesktopLayout';

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

describe('DesktopLayout compact window', () => {
    beforeEach(() => localStorage.clear());
    afterEach(cleanup);

    const OpenSidebar = () => {
        const shell = useShellSidebar();
        return (
            <button type="button" onClick={shell.open}>
                open
            </button>
        );
    };

    const renderShellAt = (width: number) => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        render(<DesktopLayout rail={<span />} nav={<span />} sidebar={<span />} main={<OpenSidebar />} />, {
            wrapper,
        });
    };

    const rails = () => screen.queryAllByRole('navigation', { hidden: true });

    it('takes the rails off the conversation and brings them back with the drawer', () => {
        renderShellAt(320);
        const drawer = screen.getByRole('dialog', { hidden: true });
        expect(drawer.className).toContain('hidden');
        fireEvent.click(screen.getByRole('button', { name: 'open' }));
        expect(drawer.className).not.toContain('hidden');
        expect(rails()).toHaveLength(2);
        expect(rails().every(rail => drawer.contains(rail))).toBe(true);
    });

    it('opens the drawer beside the cloud and nav rails', () => {
        renderShellAt(640);
        fireEvent.click(screen.getByRole('button', { name: 'open' }));
        const drawer = screen.getByRole('dialog');
        expect(drawer.className).toContain('left-[calc(theme(width.rail)*2)]');
        expect(rails().every(rail => !drawer.contains(rail))).toBe(true);
        expect(rails().map(rail => rail.getAttribute('aria-label'))).toEqual([
            i18next.t('shell.rail'),
            i18next.t('shell.nav'),
        ]);
    });

    it('hands focus back to the button that opened the drawer, once the chat is live again', () => {
        renderShellAt(640);
        const opener = screen.getByRole('button', { name: 'open' });
        opener.focus();
        fireEvent.click(opener);
        expect(document.activeElement).toBe(screen.getByRole('dialog'));
        const inertWhenFocused: boolean[] = [];
        const focus = opener.focus.bind(opener);
        opener.focus = () => {
            inertWhenFocused.push(screen.getByRole('main').hasAttribute('inert'));
            focus();
        };
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(inertWhenFocused).toEqual([false]);
        expect(document.activeElement).toBe(opener);
    });

    it('offers no skip links while the drawer is open', () => {
        renderShellAt(640);
        const skip = () => screen.queryByRole('button', { name: i18next.t('shell.skip.composer') });
        expect(skip()).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'open' }));
        expect(skip()).toBeNull();
    });

    it('keeps the rails docked while only the sidebar is a drawer', () => {
        renderShellAt(640);
        expect(rails()).toHaveLength(2);
        expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    });
});

describe('DesktopLayout sidebar skip link', () => {
    beforeEach(() => localStorage.clear());
    afterEach(cleanup);

    it('lands on the open destination, passing over the hidden Home list', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
        render(
            <DesktopLayout
                rail={<span />}
                sidebar={
                    <>
                        <div hidden>
                            <nav>
                                <button type="button">hidden row</button>
                            </nav>
                        </div>
                        <section>
                            <button type="button">inbox control</button>
                        </section>
                    </>
                }
                main={<span />}
            />,
            { wrapper }
        );

        fireEvent.click(screen.getByRole('button', { name: i18next.t('shell.skip.sidebar') }));

        expect(document.activeElement?.textContent).toBe('inbox control');
    });
});
