import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { ShellColors } from '../../../shared';

const FIELDS = ['cloudRail', 'navRail', 'list'] as const satisfies readonly (keyof ShellColors)[];

interface ColorFieldProps {
    label: string;
    value: string;
    onPick: (value: string) => void;
    onSet: () => void;
}

/**
 * One colour. `onPick` runs on every step while the picker is open (React's onChange is the
 * native `input` event), so the shell follows the drag. `onSet` runs once, on the native
 * `change` the browser fires when the picker closes.
 */
const ColorField = ({ label, value, onPick, onSet }: ColorFieldProps) => {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const input = ref.current;
        if (!input) return;
        input.addEventListener('change', onSet);
        return () => input.removeEventListener('change', onSet);
    }, [onSet]);

    return (
        <label className="flex items-center gap-2 text-callout text-foreground">
            <input
                ref={ref}
                type="color"
                value={value.toLowerCase()}
                onChange={event => onPick(event.target.value)}
                className="focus-ring h-8 w-10 cursor-pointer rounded-md border border-control-border bg-transparent p-0.5"
            />
            {label}
        </label>
    );
};

interface CustomPaletteFieldsProps {
    colors: ShellColors;
    onPick: (colors: ShellColors) => void;
    onSet: () => void;
}

/** The three colours of the Custom theme: cloud rail, nav rail, list. */
export const CustomPaletteFields = ({ colors, onPick, onSet }: CustomPaletteFieldsProps) => {
    const { t } = useTranslation();

    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-caption text-muted-foreground">{t('settings.palette.custom.colors')}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
                {FIELDS.map(field => (
                    <ColorField
                        key={field}
                        label={t(`settings.palette.custom.${field}`)}
                        value={colors[field]}
                        onPick={value => onPick({ ...colors, [field]: value })}
                        onSet={onSet}
                    />
                ))}
            </div>
        </fieldset>
    );
};
