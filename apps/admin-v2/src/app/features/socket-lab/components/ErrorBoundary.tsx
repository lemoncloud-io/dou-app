import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}
interface State {
    error?: Error;
    info?: string;
}

/** 렌더 크래시를 화면에 노출 — 콘솔 없이도 원인 파악용. */
export default class ErrorBoundary extends Component<Props, State> {
    override state: State = {};

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }
    override componentDidCatch(error: Error, info: ErrorInfo): void {
        this.setState({ error, info: info.componentStack ?? '' });

        console.error('[demo] render crash', error, info);
    }

    override render() {
        if (this.state.error) {
            return (
                <div
                    style={{
                        margin: 24,
                        padding: 20,
                        border: '1px solid #e06b6b',
                        borderRadius: 12,
                        background: 'var(--sm-red-bg)',
                        color: 'var(--sm-text)',
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        fontSize: 13,
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    <strong style={{ color: '#e06b6b' }}>render crash:</strong> {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                    {'\n\n'}
                    {this.state.info}
                </div>
            );
        }
        return this.props.children;
    }
}
