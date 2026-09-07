import { BlockList } from '../editor';
import { TemplateList } from '../templates';
import { BlockPalette } from './BlockPalette';

const SECTION_HEADING = 'px-4 pb-1 pt-2 text-overline uppercase text-muted-foreground';

/**
 * Template, then palette, then the message being built.
 *
 * That is the order of the work: start from an event kind, add what it is
 * missing, then edit the words.
 */
export const BuilderRail = () => (
    <div className="flex flex-col pb-4">
        <h3 className={SECTION_HEADING}>Template</h3>
        <TemplateList />
        <h3 className={SECTION_HEADING}>Add a block</h3>
        <BlockPalette />
        <h3 className={SECTION_HEADING}>Message</h3>
        <BlockList />
    </div>
);
