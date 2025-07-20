import React, { useState } from 'react';

import { BrandHeader, ChatButton, ChatInput, ChatMessage, TypingIndicator, TypingMessage } from '@lemon/ui-kit';

interface Message {
    id: number;
    text: string;
    type: 'system' | 'user' | 'button' | 'typing';
    gradient?: boolean;
    isTyping?: boolean;
}

type SignUpStep = 'email' | 'verification';

// 타이핑 속도 상수
const TYPING_SPEED = 40; // ms per character
const TYPING_INITIAL_DELAY = 200; // ms

export const SignUpPage: React.FC = () => {
    const [currentStep, setCurrentStep] = useState<SignUpStep>('email');
    const [userEmail, setUserEmail] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isSystemTyping, setIsSystemTyping] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasInitialized, setHasInitialized] = useState(false);
    const [isInitialMessagesComplete, setIsInitialMessagesComplete] = useState(false);

    // ChatInput에 대한 ref 생성
    const chatInputRef = React.useRef<HTMLInputElement>(null);

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const showTypingIndicator = () => {
        setIsTyping(true);
        const typingMessage: Message = {
            id: Date.now(),
            text: '',
            type: 'typing',
        };
        setMessages(prev => [...prev, typingMessage]);
    };

    const hideTypingIndicator = () => {
        setIsTyping(false);
        setMessages(prev => prev.filter(msg => msg.type !== 'typing'));
    };

    const addTypingMessage = (text: string, gradient = false, delay = 0) => {
        return new Promise<void>(resolve => {
            setTimeout(() => {
                // 기존 타이핑 인디케이터 제거
                setMessages(prev => prev.filter(msg => msg.type !== 'typing'));
                setIsSystemTyping(true);

                const messageId = Date.now() + Math.random();
                const systemMessage: Message = {
                    id: messageId,
                    text,
                    type: 'system',
                    gradient,
                    isTyping: true,
                };

                setMessages(prev => [...prev, systemMessage]);

                // 타이핑 완료 후 resolve
                const typingDuration = text.length * TYPING_SPEED + TYPING_INITIAL_DELAY;
                setTimeout(() => {
                    setMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, isTyping: false } : msg)));
                    setIsSystemTyping(false);
                    resolve();
                }, typingDuration);
            }, delay);
        });
    };

    // 초기 메시지 애니메이션 - useRef로 중복 실행 방지
    const initRef = React.useRef(false);

    React.useEffect(() => {
        if (!initRef.current) {
            initRef.current = true;
            setHasInitialized(true);

            const initializeChat = async () => {
                // 첫 번째 메시지
                await addTypingMessage('안녕! Chatic에 온걸 환영해 😄', false, 500);

                // 두 번째 메시지
                await addTypingMessage('회원가입을 시작하기 위해', false, 800);

                // 세 번째 메시지 (그라디언트)
                await addTypingMessage('너의 이메일을 입력해줘!', true, 500);

                // 모든 초기 메시지 완료
                setIsInitialMessagesComplete(true);

                // 입력 폼에 포커스
                setTimeout(() => {
                    chatInputRef.current?.focus();
                }, 300);
            };

            initializeChat();
        }
    }, []); // 빈 의존성 배열

    const handleSendMessage = async (message: string) => {
        if (currentStep === 'email') {
            // 이메일 입력 단계
            if (!validateEmail(message)) {
                // 유효하지 않은 이메일 형식
                const userMessage: Message = {
                    id: Date.now() + Math.random(),
                    text: message,
                    type: 'user',
                };
                setMessages(prev => [...prev, userMessage]);

                // 타이핑 인디케이터 표시 후 타이핑 메시지
                setTimeout(() => {
                    showTypingIndicator();
                }, 300);

                setTimeout(async () => {
                    await addTypingMessage('올바른 이메일 형식이 아니에요. 다시 입력해주세요!', false, 0);
                }, 800);
                return;
            }

            // 유효한 이메일인 경우
            const userMessage: Message = {
                id: Date.now() + Math.random(),
                text: message,
                type: 'user',
            };
            setMessages(prev => [...prev, userMessage]);
            setUserEmail(message);

            // 타이핑 인디케이터 표시
            setTimeout(() => {
                showTypingIndicator();
            }, 500);

            // 기존 메시지 삭제 후 새로운 메시지 표시
            setTimeout(async () => {
                await addTypingMessage('이메일 계정으로 인증 번호를 전송했어요. 인증번호를 입력해주세요', true, 0);
                setCurrentStep('verification');
            }, 1000);
        } else if (currentStep === 'verification') {
            // 인증번호 입력 단계
            const userMessage: Message = {
                id: Date.now() + Math.random(),
                text: message,
                type: 'user',
            };
            setMessages(prev => [...prev, userMessage]);

            // 타이핑 인디케이터 표시
            setTimeout(() => {
                showTypingIndicator();
            }, 300);

            // 인증번호 검증 (예시: 123456)
            setTimeout(async () => {
                if (message === '123456') {
                    await addTypingMessage('인증이 완료되었습니다! 🎉', true, 0);
                } else {
                    await addTypingMessage('입력한 인증번호가 정확하지 않아요😥\n다시 확인해 주세요!', false, 0);

                    // 버튼 추가
                    setTimeout(() => {
                        const buttonMessage: Message = {
                            id: Date.now() + Math.random(),
                            text: '인증번호 재전송',
                            type: 'button',
                        };
                        setMessages(prev => [...prev, buttonMessage]);
                    }, 300);
                }
            }, 800);
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
                </div>
            </div>

            {/* Chat Input */}
            <div className="fixed bottom-0 left-0 right-0 bg-white px-4 py-4">
                <ChatInput
                    ref={chatInputRef}
                    placeholder={getPlaceholder()}
                    onSend={handleSendMessage}
                    disabled={isSystemTyping || !isInitialMessagesComplete}
                />
            </div>
        </div>
    );
};
