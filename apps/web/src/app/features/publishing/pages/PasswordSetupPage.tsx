import React, { useCallback, useEffect, useRef, useState } from 'react';

import { BrandHeader, ChatInput, ChatMessage, TypingIndicator, TypingMessage } from '@lemon/ui-kit';

interface Message {
    id: number;
    text: string;
    type: 'system' | 'user' | 'typing';
    gradient?: boolean;
    isTyping?: boolean;
}

// 타이핑 속도 상수
const TYPING_SPEED = 40; // ms per character
const TYPING_INITIAL_DELAY = 200; // ms

interface PasswordSetupPageProps {
    email: string;
    onComplete: (password: string) => void;
}

export const PasswordSetupPage: React.FC<PasswordSetupPageProps> = ({ email, onComplete }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasInitialized, setHasInitialized] = useState(false);
    const [isInitialMessagesComplete, setIsInitialMessagesComplete] = useState(false);
    const [currentStep, setCurrentStep] = useState<'password' | 'confirm'>('password');
    const [password, setPassword] = useState('');

    const chatInputRef = useRef<HTMLTextAreaElement>(null);
    const isComponentMountedRef = useRef(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Cleanup effect
    useEffect(() => {
        return () => {
            isComponentMountedRef.current = false;
        };
    }, []);

    const showTypingIndicator = useCallback(() => {
        const typingMessage: Message = {
            id: Date.now(),
            text: '',
            type: 'typing',
        };
        setMessages(prev => [...prev, typingMessage]);
    }, []);

    const addTypingMessage = useCallback((text: string, gradient = false, delay = 0) => {
        return new Promise<void>(resolve => {
            if (!isComponentMountedRef.current) {
                resolve();
                return;
            }

            setTimeout(() => {
                if (!isComponentMountedRef.current) {
                    resolve();
                    return;
                }

                setMessages(prev => prev.filter(msg => msg.type !== 'typing'));

                const messageId = Date.now() + Math.random();
                const systemMessage: Message = {
                    id: messageId,
                    text,
                    type: 'system',
                    gradient,
                    isTyping: true,
                };

                setMessages(prev => [...prev, systemMessage]);

                const typingDuration = text.length * TYPING_SPEED + TYPING_INITIAL_DELAY;
                setTimeout(() => {
                    if (!isComponentMountedRef.current) {
                        resolve();
                        return;
                    }
                    setMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, isTyping: false } : msg)));
                    resolve();
                }, typingDuration);
            }, delay);
        });
    }, []);

    const handlePasswordSubmit = useCallback(
        async (inputPassword: string) => {
            if (currentStep === 'password') {
                if (inputPassword.length < 8) {
                    const userMessage: Message = {
                        id: Date.now() + Math.random(),
                        text: inputPassword,
                        type: 'user',
                    };
                    setMessages(prev => [...prev, userMessage]);

                    showTypingIndicator();
                    setTimeout(async () => {
                        await addTypingMessage('비밀번호는 8자 이상이어야 해요 😅\n다시 입력해주세요!', false, 0);
                    }, 800);
                    return;
                }

                const userMessage: Message = {
                    id: Date.now() + Math.random(),
                    text: '••••••••',
                    type: 'user',
                };
                setMessages(prev => [...prev, userMessage]);
                setPassword(inputPassword);

                showTypingIndicator();
                setTimeout(async () => {
                    await addTypingMessage('비밀번호를 한 번 더 입력해서 확인해주세요!', true, 0);
                    setCurrentStep('confirm');
                }, 800);
            } else {
                const userMessage: Message = {
                    id: Date.now() + Math.random(),
                    text: '••••••••',
                    type: 'user',
                };
                setMessages(prev => [...prev, userMessage]);

                if (inputPassword !== password) {
                    showTypingIndicator();
                    setTimeout(async () => {
                        await addTypingMessage('비밀번호가 일치하지 않아요 😥\n다시 확인해주세요!', false, 0);
                        setCurrentStep('password');
                        setPassword('');
                    }, 800);
                    return;
                }

                showTypingIndicator();
                setTimeout(async () => {
                    await addTypingMessage('회원가입이 완료되었습니다! 🎉', true, 0);
                    setTimeout(() => {
                        onComplete(password);
                    }, 1500);
                }, 800);
            }
        },
        [currentStep, password, showTypingIndicator, addTypingMessage, onComplete]
    );

    const initRef = useRef(false);
    useEffect(() => {
        if (!initRef.current) {
            initRef.current = true;
            setHasInitialized(true);

            const initializeChat = async () => {
                await addTypingMessage('이메일 인증이 완료되었어요! ✅', false, 500);
                await addTypingMessage('이제 비밀번호를 설정해주세요', false, 800);
                await addTypingMessage('8자 이상의 안전한 비밀번호를 입력해주세요!', true, 500);

                setIsInitialMessagesComplete(true);
                setTimeout(() => {
                    chatInputRef.current?.focus();
                }, 300);
            };

            initializeChat();
        }
    }, [addTypingMessage]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // 메시지가 변경될 때마다 자동 스크롤
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const getPlaceholder = useCallback(() => {
        return currentStep === 'password' ? '비밀번호를 입력해 주세요 (8자 이상)' : '비밀번호를 다시 입력해 주세요';
    }, [currentStep]);

    return (
        <div className="flex flex-col h-screen mx-auto bg-background">
            {/* Header */}
            <BrandHeader showBorder={false} />

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 pb-32 pt-[80px]">
                <div className="space-y-1">
                    {messages.map(message => {
                        if (message.type === 'typing') {
                            return (
                                <div key={message.id} className="flex justify-start">
                                    <TypingIndicator size="default" />
                                </div>
                            );
                        }
                        return message.isTyping ? (
                            <TypingMessage
                                key={message.id}
                                text={message.text}
                                type={message.type as 'system' | 'user'}
                                gradient={message.gradient}
                                typingSpeed={TYPING_SPEED}
                            />
                        ) : (
                            <ChatMessage
                                key={message.id}
                                message={message.text}
                                type={message.type as 'system' | 'user'}
                                gradient={message.gradient}
                            />
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Chat Input */}
            <div className="fixed bottom-0 left-0 right-0 bg-background">
                <ChatInput
                    ref={chatInputRef}
                    placeholder={getPlaceholder()}
                    onSend={handlePasswordSubmit}
                    disabled={!isInitialMessagesComplete}
                    type="password"
                />
            </div>
        </div>
    );
};
