import {
    ArrowUp,
    Check,
    CircleAlert,
    ChevronDown,
    Clock,
    House,
    ChevronLeft,
    ChevronRight,
    Image as ImageGlyph,
    Link2,
    Loader2,
    MessageCircle,
    type LucideIcon,
    type LucideProps,
    MoreHorizontal,
    Plus,
    Search,
    Sparkles,
    User,
    Users,
    X,
    Zap,
} from 'lucide-react';

/**
 * Central icon set for web-ui-kit. Components import semantic icons from here
 * (never `lucide-react` directly) so the icon library is swappable in one place
 * — e.g. replacing these with the Figma-exported SVG set later touches only this
 * file, not every component.
 *
 * All icons share the lucide API (size, className, strokeWidth, currentColor).
 */
export type IconProps = LucideProps;

export const IconBack: LucideIcon = ChevronLeft;
export const IconCheck: LucideIcon = Check;
export const IconAlert: LucideIcon = CircleAlert;
export const IconHome: LucideIcon = House;
export const IconChatBubble: LucideIcon = MessageCircle;
export const IconChevronDown: LucideIcon = ChevronDown;
export const IconChevronRight: LucideIcon = ChevronRight;
export const IconClose: LucideIcon = X;
export const IconMore: LucideIcon = MoreHorizontal;
export const IconPlus: LucideIcon = Plus;
export const IconSearch: LucideIcon = Search;
export const IconSend: LucideIcon = ArrowUp;
export const IconSpinner: LucideIcon = Loader2;
export const IconPlan: LucideIcon = Sparkles;
export const IconBolt: LucideIcon = Zap;
export const IconImage: LucideIcon = ImageGlyph;
export const IconLink: LucideIcon = Link2;
export const IconUser: LucideIcon = User;
export const IconUsers: LucideIcon = Users;
export const IconClock: LucideIcon = Clock;

// Figma-exported custom glyphs (not lucide icons). See IconGroup.tsx / IconUserSolid.tsx.
export { IconGroup, type IconGroupProps } from './IconGroup';
export { IconUserSolid, type IconUserSolidProps } from './IconUserSolid';
export { IconChatAdd, type IconChatAddProps } from './IconChatAdd';
export { IconPin, type IconPinProps } from './IconPin';
export { IconCheckCircleSolid, type IconCheckCircleSolidProps } from './IconCheckCircleSolid';
