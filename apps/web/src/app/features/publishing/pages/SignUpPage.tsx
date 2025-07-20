import React, { useState } from 'react';

import { BrandHeader, ChatButton, ChatInput, ChatMessage } from '@lemon/ui-kit';

interface Message {
    id: number;
    text: string;
    type: 'system' | 'user' | 'button';
    gradient?: boolean;
}

type SignUpStep = 'email' | 'verification';

export const SignUpPage: React.FC = () => {
    const [currentStep, setCurrentStep] = useState<SignUpStep>('email');
    const [userEmail, setUserEmail] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, text: '안녕! Chatic에 온걸 환영해 😄', type: 'system' },
        { id: 2, text: '회원가입을 시작하기 위해', type: 'system' },
        { id: 3, text: '너의 이메일을 입력해줘!', type: 'system', gradient: true },
    ]);

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleSendMessage = (message: string) => {
        if (currentStep === 'email') {
            // 이메일 입력 단계
            if (!validateEmail(message)) {
                // 유효하지 않은 이메일 형식
                const userMessage: Message = {
                    id: Date.now(),
                    text: message,
                    type: 'user',
                };
                setMessages(prev => [...prev, userMessage]);

                setTimeout(() => {
                    const errorMessage: Message = {
                        id: Date.now() + 1,
                        text: '올바른 이메일 형식이 아니에요. 다시 입력해주세요!',
                        type: 'system',
                    };
                    setMessages(prev => [...prev, errorMessage]);
                }, 500);
                return;
            }

            // 유효한 이메일인 경우
            const userMessage: Message = {
                id: Date.now(),
                text: message,
                type: 'user',
            };
            setMessages(prev => [...prev, userMessage]);
            setUserEmail(message);

            // 기존 메시지 삭제 후 새로운 메시지 표시
            setTimeout(() => {
                setMessages([
                    {
                        id: Date.now() + 1,
                        text: `이메일 계정으로 인증 번호를 전송했어요. 인증번호를 입력해주세요`,
                        type: 'system',
                        gradient: true,
                    },
                ]);
                setCurrentStep('verification');
            }, 1000);
        } else if (currentStep === 'verification') {
            // 인증번호 입력 단계
            const userMessage: Message = {
                id: Date.now(),
                text: message,
                type: 'user',
            };
            setMessages(prev => [...prev, userMessage]);

            // 인증번호 검증 (예시: 123456)
            setTimeout(() => {
                if (message === '123456') {
                    const successMessage: Message = {
                        id: Date.now() + 1,
                        text: '인증이 완료되었습니다! 🎉',
                        type: 'system',
                        gradient: true,
                    };
                    setMessages(prev => [...prev, successMessage]);
                } else {
                    const errorMessage: Message = {
                        id: Date.now() + 1,
                        text: '입력한 인증번호가 정확하지 않아요😥\n다시 확인해 주세요!',
                        type: 'system',
                    };
                    const buttonMessage: Message = {
                        id: Date.now() + 2,
                        text: '인증번호 재전송',
                        type: 'button',
                    };
                    setMessages(prev => [...prev, errorMessage, buttonMessage]);
                }
            }, 500);
        }
    };

    const getPlaceholder = (): string => {
        switch (currentStep) {
            case 'email':
                return '이메일을 입력해 주세요';
            case 'verification':
                return '인증번호를 입력해 주세요';
            default:
                return '메시지를 입력해 주세요';
        }
    };

    return (
        <div className="flex flex-col h-screen mx-auto bg-white">
            {/* Header */}
            <BrandHeader showBorder={false} />

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 pb-32 pt-[80px]">
                <div className="space-y-1">
                    {messages.map(message => {
                        if (message.type === 'button') {
                            return (
                                <div key={message.id} className="flex justify-start mt-2">
                                    <ChatButton
                                        variant="default"
                                        size="default"
                                        onClick={() => {
                                            // 인증번호 재전송 로직
                                            console.log('인증번호 재전송');
                                        }}
                                    >
                                        {message.text}
                                    </ChatButton>
                                </div>
                            );
                        }
                        return (
                            <ChatMessage
                                key={message.id}
                                message={message.text}
                                type={message.type as 'system' | 'user'}
                                gradient={message.gradient}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Chat Input */}
            <div className="fixed bottom-0 left-0 right-0 bg-white px-4 py-4">
                <ChatInput placeholder={getPlaceholder()} onSend={handleSendMessage} />
            </div>
        </div>
    );
};
