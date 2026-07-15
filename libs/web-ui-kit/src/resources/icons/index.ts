import {
    ArrowUp,
    Check,
    CircleAlert,
    ChevronDown,
    House,
    ChevronLeft,
    ChevronRight,
    Loader2,
    MessageCircle,
    type LucideIcon,
    type LucideProps,
    MoreHorizontal,
    Plus,
    Search,
    Sparkles,
    User,
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
export const IconUser: LucideIcon = User;
