import React from 'react';

interface SendButtonProps {
    disabled?: boolean;
    onClick?: () => void;
}

export const SendButton: React.FC<SendButtonProps> = ({ disabled = true, onClick }) => {
    return (
        <button className="relative rounded-full w-4 h-4" onClick={onClick} disabled={disabled}>
            <div className="flex items-center justify-center w-full h-full p-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                        d="M8 4 L12 8 L8 12 M4 8 L12 8"
                        stroke={disabled ? '#BABCC0' : '#3968C3'}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
        </button>
    );
};
