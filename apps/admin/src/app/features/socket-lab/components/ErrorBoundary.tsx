import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logger } from '@chatic/bridges';

interface Props {
    children: ReactNode;
}
interface State {
    error?: Error;
    info?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
    override state: State = {};

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }
    override componentDidCatch(error: Error, info: ErrorInfo): void {
        this.setState({ error, info: info.componentStack ?? '' });

        // The fallback below already shows the crash on screen, so this is for the
        // record rather than the operator: the entry joins the upload queue and
        // reaches the collector with the component stack that identifies it.
        logger.error('GLOBAL', '[socket-lab] render crash', { error, data: { componentStack: info.componentStack } });
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
