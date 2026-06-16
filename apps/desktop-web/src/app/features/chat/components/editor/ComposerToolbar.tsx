import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { $isCodeNode } from '@lexical/code-core';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Bold, Code, Italic, SquareCode, Strikethrough } from 'lucide-react';
import {
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    type LexicalEditor,
    type TextFormatType,
} from 'lexical';

import { cn } from '@chatic/lib/utils';

import { toggleCodeBlock } from './composerPlugins';

const textFormat =
    (format: TextFormatType) =>
    (editor: LexicalEditor): void => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

// Keyboard equivalents live in FormatShortcutsPlugin (Slack's bindings).
const FORMATS = [
    { key: 'bold', icon: Bold, apply: textFormat('bold') },
    { key: 'italic', icon: Italic, apply: textFormat('italic') },
    { key: 'strike', icon: Strikethrough, apply: textFormat('strikethrough') },
    { key: 'code', icon: Code, apply: textFormat('code') },
    { key: 'codeBlock', icon: SquareCode, apply: toggleCodeBlock },
] as const;

type FormatKey = (typeof FORMATS)[number]['key'];
type ActiveFormats = Partial<Record<FormatKey, boolean>>;

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
        codeBlock: $isCodeNode(top),
    };
};

/** Formatting row above the input — applies live formats and highlights the selection's active ones. */
export const ComposerToolbar = ({ disabled }: { disabled: boolean }) => {
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

    return (
        <div className="flex items-center gap-0.5" role="toolbar" aria-label={t('chat.composer.formatting')}>
            {FORMATS.map(({ key, icon: Icon, apply }) => (
                <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    aria-pressed={!!active[key]}
                    title={t(`chat.composer.format.${key}`)}
                    aria-label={t(`chat.composer.format.${key}`)}
                    // mousedown (not click) so the editor keeps focus + selection.
                    onMouseDown={e => {
                        e.preventDefault();
                        apply(editor);
                    }}
                    className={cn(
                        'focus-ring tactile flex h-7 w-7 items-center justify-center rounded-md transition-colors ease-tactile disabled:opacity-50',
                        active[key]
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
            ))}
        </div>
    );
};
