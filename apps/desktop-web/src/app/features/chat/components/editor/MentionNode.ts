import { $applyNodeReplacement, TextNode, type EditorConfig, type SerializedTextNode } from 'lexical';

import { MSG_MENTION_CLASS } from '../RichText';

/**
 * A picked @mention rendered as a chip inside the composer. Plain TextNode
 * subclass, so markdown serialization emits its literal text ("@name") — the
 * wire format stays what RichText renders. Segmented mode: backspace removes
 * the whole mention, matching Slack.
 */
export class MentionNode extends TextNode {
    static getType(): string {
        return 'mention';
    }

    static clone(node: MentionNode): MentionNode {
        return new MentionNode(node.__text, node.__key);
    }

    static importJSON(serialized: SerializedTextNode): MentionNode {
        return $createMentionNode(serialized.text).updateFromJSON(serialized);
    }

    exportJSON(): SerializedTextNode {
        return { ...super.exportJSON(), type: 'mention' };
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config);
        dom.className = MSG_MENTION_CLASS;
        return dom;
    }

    isTextEntity(): true {
        return true;
    }

    canInsertTextBefore(): boolean {
        return false;
    }

    canInsertTextAfter(): boolean {
        return false;
    }
}

export const $createMentionNode = (text: string): MentionNode =>
    $applyNodeReplacement(new MentionNode(text).setMode('segmented').toggleDirectionless());
