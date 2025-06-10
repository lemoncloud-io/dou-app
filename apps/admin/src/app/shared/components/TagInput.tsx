import * as React from 'react';
import { useController } from 'react-hook-form';

import { X } from 'lucide-react';

import { cn } from '@lemon/ui-kit';
import { Badge } from '@lemon/ui-kit/components/ui/badge';
import { Input } from '@lemon/ui-kit/components/ui/input';

interface TagInputProps {
    name: string;
    control: any;
    placeholder?: string;
}

export const TagInput: React.FC<TagInputProps> = ({ name, control, placeholder }) => {
    const {
        field: { value, onChange },
    } = useController({ name, control });

    const [inputValue, setInputValue] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const currentValue = value || [];
        if (e.key === 'Enter' && inputValue.trim() && !currentValue.includes(inputValue.trim())) {
            e.preventDefault();
            onChange([...currentValue, inputValue.trim()]);
            setInputValue('');
        }
    };

    const handleRemoveTag = (index: number) => {
        const currentValue = value || [];
        onChange(currentValue.filter((_: any, i: number) => i !== index));
    };

    return (
        <div
            className={cn(
                'flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
                'flex-wrap gap-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'
            )}
            onClick={() => inputRef.current?.focus()}
        >
            {value?.map((tag: string, index: number) => (
                <Badge key={index} variant="secondary" className="gap-1 px-2 py-0.5">
                    {tag}
                    <button
                        type="button"
                        className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={e => {
                            e.stopPropagation();
                            handleRemoveTag(index);
                        }}
                    >
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                </Badge>
            ))}
            <Input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleAddTag}
                className="flex-1 !m-0 !p-0 !border-0 !outline-none focus-visible:ring-0 focus-visible:ring-offset-0 min-w-[120px]"
                placeholder={placeholder}
            />
        </div>
    );
};
