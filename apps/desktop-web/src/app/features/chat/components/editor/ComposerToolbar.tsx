import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { $isCodeNode } from '@lexical/code-core';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createQuoteNode, $isQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { Bold, Code, Italic, SquareCode, Strikethrough, TextQuote } from 'lucide-react';
import {
    $createParagraphNode,
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    type LexicalEditor,
    type TextFormatType,
} from 'lexical';

import { cn } from '@chatic/lib/utils';
import { Hint } from '../../../../shared';
import { toggleCodeBlock } from './composerPlugins';
import { $selectedLink, LinkButton } from './LinkButton';

const textFormat =
    (format: TextFormatType) =>
    (editor: LexicalEditor): void => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

/** Toggle the selection's blocks between quote and paragraph. */
const toggleQuote = (editor: LexicalEditor): void => {
    editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const top = selection.anchor.getNode().getTopLevelElement();
        $setBlocksType(selection, () => ($isQuoteNode(top) ? $createParagraphNode() : $createQuoteNode()));
    });
};

// Slack's top row, cut to what the message format can carry: underline and lists have no wire
// form the readers understand, so they get no button, and a link is its bare URL (LinkButton).
// Inline formats and the link first, then the two block formats after a rule. Keyboard
// equivalents live in FormatShortcutsPlugin.
const INLINE_FORMATS = [
    { key: 'bold', Icon: Bold, apply: textFormat('bold') },
    { key: 'italic', Icon: Italic, apply: textFormat('italic') },
    { key: 'strike', Icon: Strikethrough, apply: textFormat('strikethrough') },
    { key: 'code', Icon: Code, apply: textFormat('code') },
] as const;

const BLOCK_FORMATS = [
    { key: 'quote', Icon: TextQuote, apply: toggleQuote },
    { key: 'codeBlock', Icon: SquareCode, apply: toggleCodeBlock },
] as const;

const BUTTON_CLASS =
    'focus-ring tactile flex h-7 w-7 items-center justify-center rounded-md transition-colors ease-tactile hover:bg-accent hover:text-foreground disabled:opacity-50';

type FormatKey = (typeof INLINE_FORMATS)[number]['key'] | (typeof BLOCK_FORMATS)[number]['key'];
type ActiveFormats = Partial<Record<FormatKey | 'link', boolean>>;

/** Which formats the current selection carries, so the row can light them up. */
const readActiveFormats = (): ActiveFormats => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return {};
    const top = selection.anchor.getNode().getTopLevelElement();
    return {
        bold: selection.hasFormat('bold'),
        italic: selection.hasFormat('italic'),
        strike: selection.hasFormat('strikethrough'),
        code: selection.hasFormat('code'),
        quote: $isQuoteNode(top),
        codeBlock: $isCodeNode(top),
        link: $selectedLink() !== null,
    };
};

/** Formatting row above the input — applies live formats and highlights the selection's active ones. */
export const ComposerToolbar = () => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    const [active, setActive] = useState<ActiveFormats>({});

    // Mirror the selection's formats onto the row (Slack-style active highlight),
    // so ⌘B and the buttons both reflect the caret's current state.
    useEffect(
        () =>
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => setActive(readActiveFormats()));
            }),
        [editor]
    );

    const renderButton = ({ key, Icon, apply }: (typeof INLINE_FORMATS | typeof BLOCK_FORMATS)[number]) => (
        <Hint key={key} label={t(`chat.composer.format.${key}`)}>
            <button
                type="button"
                aria-pressed={!!active[key]}
                aria-label={t(`chat.composer.format.${key}`)}
                // mousedown only prevents the default focus steal — the editor
                // keeps its selection. The action itself runs on click, so
                // Enter and Space reach it too.
                onMouseDown={e => e.preventDefault()}
                onClick={() => apply(editor)}
                className={cn(BUTTON_CLASS, active[key] ? 'bg-accent text-foreground' : 'text-label')}
            >
                <Icon size={16} strokeWidth={2} aria-hidden />
            </button>
        </Hint>
    );

    return (
        <div className="flex items-center gap-0.5" role="toolbar" aria-label={t('chat.composer.formatting')}>
            {INLINE_FORMATS.map(renderButton)}
            <LinkButton
                isActive={!!active.link}
                className={cn(BUTTON_CLASS, active.link ? 'bg-accent text-foreground' : 'text-label')}
            />
            <div aria-hidden className="mx-1 h-4 w-px bg-input" />
            {BLOCK_FORMATS.map(renderButton)}
        </div>
    );
};
