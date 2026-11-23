export interface FrontableWindow {
    isMinimized(): boolean;
    restore(): void;
    show(): void;
    focus(): void;
}

export const bringToFront = (win: FrontableWindow): void => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
};
