import { IconButton, IconChatBubble } from '@chatic/web-ui-kit';

import { type Position, getViewportSize, useDraggable } from '../hooks';

/** FAB diameter (px). */
const FAB_SIZE = 56;
/** Default resting spot: bottom-right, lifted above the floating bottom nav. */
const BOTTOM_OFFSET = 96;
const EDGE_MARGIN = 16;
/** Viewport fallback when the real size is not yet measurable (0×0). */
const FALLBACK_VW = 375;
const FALLBACK_VH = 812;

const getDefaultPosition = (): Position => {
    const { width, height } = getViewportSize();
    const vw = width || FALLBACK_VW;
    const vh = height || FALLBACK_VH;
    return {
        x: Math.max(EDGE_MARGIN, vw - FAB_SIZE - EDGE_MARGIN),
        y: Math.max(EDGE_MARGIN, vh - FAB_SIZE - BOTTOM_OFFSET),
    };
};

interface IssueReportFabProps {
    /** Accessible label for the icon-only button. */
    label: string;
    /** Opens the report overlay — suppressed when the press was a drag. */
    onOpen: () => void;
}

/**
 * Draggable floating action button that opens the issue-report overlay. Position
 * persists across sessions; a drag never triggers the open (see `didDrag`).
 */
export const IssueReportFab = ({ label, onOpen }: IssueReportFabProps) => {
    const { ref, position, dragHandlers, didDrag } = useDraggable('issue-report:fab', getDefaultPosition);

    return (
        <div
            ref={ref}
            style={{ left: position.x, top: position.y }}
            className="fixed z-50 touch-none"
            {...dragHandlers}
        >
            <IconButton
                icon={<IconChatBubble />}
                label={label}
                variant="outline"
                size={FAB_SIZE}
                onClick={() => {
                    if (!didDrag()) onOpen();
                }}
                className="bg-card shadow-xl"
            />
        </div>
    );
};
