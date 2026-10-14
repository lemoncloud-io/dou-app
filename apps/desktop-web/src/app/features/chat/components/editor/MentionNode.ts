import {
    $applyNodeReplacement,
    TextNode,
    type EditorConfig,
    type LexicalNode,
    type NodeKey,
    type SerializedTextNode,
    type Spread,
} from 'lexical';

import { MSG_MENTION_CLASS } from '@chatic/block-kit';

/**
 * A picked @mention rendered as a chip inside the composer. Plain TextNode
 * subclass, so markdown serialization emits its literal text ("@name") — the
 * wire format stays what RichText renders. Segmented mode: backspace removes
 * a one-word mention whole, matching Slack, and a name with spaces one word at a time.
 *
 * A chip picked from the list also holds that member's id. The text is not enough to say who was
 * called — names repeat and change — and the server reads the id, never the text. A chip made from
 * text (an opened message, a restored draft) holds none: it shows a name and calls no one.
 *
 * Picking the everyone row makes a chip that stands for the whole channel instead of one member.
 *
 * The pick is kept with the text it was picked as. Backspace on "@Ada Lovelace" leaves a chip that
 * reads "@Ada"; that chip no longer shows who was picked, so it no longer answers with the id.
 */
export class MentionNode extends TextNode {
    __picked?: PickedTarget;

    constructor(text: string, key?: NodeKey, target?: MentionTarget) {
        super(text, key);
        const who = target?.everyone ? { everyone: true as const } : target?.userId ? { userId: target.userId } : null;
        this.__picked = who ? { ...who, text } : undefined;
    }

    static override getType(): string {
        return 'mention';
    }

    // Lexical clones a node on every write to it, so the id has to ride the clone.
    static override clone(node: MentionNode): MentionNode {
        const clone = new MentionNode(node.__text, node.__key);
        clone.__picked = node.__picked;
        return clone;
    }

    static override importJSON(serialized: SerializedMentionNode): MentionNode {
        const { userId, everyone } = serialized;
        return $createMentionNode(serialized.text, { userId, everyone }).updateFromJSON(serialized);
    }

    override exportJSON(): SerializedMentionNode {
        const userId = this.getUserId();
        return {
            ...super.exportJSON(),
            type: 'mention',
            ...(userId ? { userId } : {}),
            ...(this.isEveryone() ? { everyone: true } : {}),
        };
    }

    /** The pick, while the chip still reads as what was picked. */
    private getPick(): PickedTarget | undefined {
        const { __picked: picked, __text: text } = this.getLatest();
        return picked?.text === text ? picked : undefined;
    }

    /**
     * The picked member's id — undefined for a chip made from text, and for a picked chip whose
     * text is no longer the name it was picked as.
     */
    getUserId(): string | undefined {
        const pick = this.getPick();
        return pick && 'userId' in pick ? pick.userId : undefined;
    }

    /** Whether this chip is the everyone row's pick, with its word still whole. */
    isEveryone(): boolean {
        const pick = this.getPick();
        return !!pick && 'everyone' in pick;
    }

    override createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config);
        dom.className = MSG_MENTION_CLASS;
        return dom;
    }

    override isTextEntity(): true {
        return true;
    }

    override canInsertTextBefore(): boolean {
        return false;
    }

    override canInsertTextAfter(): boolean {
        return false;
    }
}

/** What a chip was picked as — a member or everyone — with the chip's text at that moment. */
type PickedTarget = ({ userId: string } | { everyone: true }) & { text: string };

/** Who a chip stands for: the member picked from the list, or everyone. Omitted for a chip made from text. */
export interface MentionTarget {
    userId?: string;
    everyone?: boolean;
}

type SerializedMentionNode = Spread<MentionTarget, SerializedTextNode>;

export const $createMentionNode = (text: string, target?: MentionTarget): MentionNode =>
    $applyNodeReplacement(new MentionNode(text, undefined, target).setMode('segmented').toggleDirectionless());

export const $isMentionNode = (node: LexicalNode | null | undefined): node is MentionNode =>
    node instanceof MentionNode;
