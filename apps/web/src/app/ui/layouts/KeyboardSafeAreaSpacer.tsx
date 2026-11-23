const CTA_BASE_PADDING = '1rem';

export const keyboardSafeBottom = (basePadding = '0px') =>
    `max(calc(var(--safe-bottom, 0px) - ${basePadding}), var(--keyboard-height, 0px))`;

export const KeyboardSafeAreaSpacer = () => {
    return (
        <div
            className="shrink-0 touch-none bg-background"
            style={{ height: keyboardSafeBottom(CTA_BASE_PADDING) }}
            onTouchMove={e => e.preventDefault()}
        />
    );
};
