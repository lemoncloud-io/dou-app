import { useBuilderStore } from '../../store';
import { BlockList } from '../editor';
import { TemplateList } from '../templates';
import { BlockPalette } from './BlockPalette';

// Matched to the pane headings across the top of the three columns, so "UI
// Components" and "Message Preview" read as the same rank rather than as a
// subheading of the rail.
const SECTION_HEADING = 'px-4 pb-2 pt-7 text-caption font-medium text-muted-foreground';

/**
 * Template, then palette, then the message being built.
 *
 * That is the order of the work: start from an event kind, add what it is
 * missing, then edit the words.
 *
 * Only the last of the three scrolls. The first two are a fixed list of things
 * to click and the third grows without limit, so one scroller for all three
 * means adding a sixth block puts the palette off screen — you would scroll up
 * to add, then back down to type, for every block after the fifth.
 */
export const BuilderRail = () => {
    const count = useBuilderStore(state => state.blocks.length);

    return (
        <div className="flex h-full flex-col">
            {/* On a wide screen the pane heading above already says "Template", so
                saying it again here would be the same word twice in a column. The
                pane headings are hidden below `lg`, where the tab says "Compose" and
                this list would otherwise open with no name at all. */}
            <div className="shrink-0">
                <h3 className={`${SECTION_HEADING} pt-3 lg:hidden`}>Template</h3>
                <TemplateList />
                <h3 className={SECTION_HEADING}>UI Components</h3>
                <BlockPalette />
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-hairline">
                <h3 className={SECTION_HEADING}>
                    Blocks in this message
                    {count > 0 && <span className="ml-1 tabular-nums text-muted-foreground/60">{count}</span>}
                </h3>
                <div className="min-h-0 flex-1 overflow-auto pb-4">
                    <BlockList />
                </div>
            </div>
        </div>
    );
};
