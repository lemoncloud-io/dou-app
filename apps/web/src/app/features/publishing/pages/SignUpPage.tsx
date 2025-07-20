import React, { useState } from 'react';

import { ChatInput } from '../components/ChatInput';
import { ChatMessage } from '../components/ChatMessage';
import { Header } from '../components/Header';

interface Message {
    id: number;
    text: string;
    type: 'system' | 'user';
    gradient?: boolean;
}

export const SignUpPage: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, text: '안녕! Chatic에 온걸 환영해 😄', type: 'system' },
        { id: 2, text: '회원가입을 시작하기 위해', type: 'system' },
        { id: 3, text: '너의 이메일을 입력해줘!', type: 'system', gradient: true },
    ]);

    const handleSendMessage = (message: string) => {
        const newMessage: Message = {
            id: messages.length + 1,
            text: message,
            type: 'user',
        };
        setMessages([...messages, newMessage]);

        // Simulate system response
        setTimeout(() => {
            const responseMessage: Message = {
                id: messages.length + 2,
                text: '좋아! 다음 단계로 넘어갈게.',
                type: 'system',
            };
            setMessages(prev => [...prev, responseMessage]);
        }, 1000);
    };

    return (
        <div className="flex flex-col h-screen bg-white max-w-md mx-auto">
            {/* Header */}
            <Header showBorder={false} />

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 pt-24 pb-24">
                <div className="space-y-3">
                    {messages.map(message => (
                        <ChatMessage
                            key={message.id}
                            message={message.text}
                            type={message.type}
                            gradient={message.gradient}
                        />
                    ))}
                </div>
            </div>

            {/* Chat Input */}
            <ChatInput placeholder="이메일을 입력해 주세요" onSend={handleSendMessage} />
        </div>
    );
};
