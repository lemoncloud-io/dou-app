import { Globe, Lock } from 'lucide-react';

interface VisibilityToggleProps {
    value: 'public' | 'private';
    onChange: (v: 'public' | 'private') => void;
}

export const VisibilityToggle = ({ value, onChange }: VisibilityToggleProps) => {
    return (
        <div className="flex gap-2">
            <button
                type="button"
                onClick={() => onChange('public')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                    value === 'public' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                }`}
            >
                <Globe size={16} />
                공개
            </button>
            <button
                type="button"
                onClick={() => onChange('private')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                    value === 'private' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                }`}
            >
                <Lock size={16} />
                비공개
            </button>
        </div>
    );
};
