export class AgentToolError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'AgentToolError';
        this.code = code;
    }
}

export const toolErrorBody = (error: unknown): { code: string; message: string } => {
    if (error instanceof AgentToolError) return { code: error.code, message: error.message };
    const status = (error as { status?: unknown } | null)?.status;
    const message = error instanceof Error ? error.message : String(error);
    if (typeof status === 'number') return { code: `http_${status}`, message };
    return { code: 'engine_error', message };
};
