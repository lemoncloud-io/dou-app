import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@chatic/theme';
import { cn } from '@chatic/lib/utils';

/**
 * Light or dark.
 *
 * The builder is judged against the client the message will land in, and half
 * that audience reads DoU dark — a preview that only ever draws light is a
 * preview that cannot answer whether the header still separates from the body
 * there. So the toggle moves the whole tool, not just the card: the message has
 * to be read against the same surface it will sit on.
 *
 * Two states, not three. `system` is where an untouched builder starts (index.html
 * resolves it before first paint), and the moment someone reaches for this button
 * they have an answer in mind — offering to hand the choice back to the OS is a
 * third option for a question that has already been settled.
 */
export const ThemeToggle = () => {
    const { isDarkTheme, setTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            className={cn(
                'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md',
                'text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground'
            )}
        >
            {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
};
