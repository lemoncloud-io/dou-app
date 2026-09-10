import { logger } from '@chatic/bridges';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

/**
 * What the registry does when a port reports trouble (ADR-0080 결정 10).
 *
 * Split out of `adapters.ts` so it can be unit-tested: that file reads `import.meta.env`, which
 * makes it — and anything importing it — unloadable under the CommonJS test transform. The repo
 * already isolates such reads for the same reason (`utils/buildEnv.ts`, `logUploadSwitch.ts`).
 */

/**
 * A key declared twice. **Log only.**
 *
 * A registry authoring error, not something the person holding the phone can act on, and
 * `allModules.spec.ts` asserts the set is empty — so this is loud where it matters (collected logs)
 * and silent where it would only confuse.
 */
export const onDuplicateKey = (key: string): void => {
    logger.error('CONFIG', `Duplicate config key declared twice: ${key}`);
};

/**
 * The shell refused a write, after the retry. **Log AND tell the person.**
 *
 * Different from the duplicate above: this write is something they just did, and a refusal means
 * the setting silently did not stick. Staying quiet is exactly the "화면은 껐다고 하는데 실제로는
 * 안 꺼진" state 결정 10 exists to prevent — ADR-0079 4단계 wired the log and left the visible half
 * as "다음 라운드", which is this.
 *
 * The imperative `toast`, not the hook: this runs from `config.set`, which has no React context.
 * The toaster is mounted app-wide and this is the shadcn escape hatch for reaching it.
 */
export const onShellWriteFailed = (key: string, error: unknown): void => {
    logger.error('CONFIG', `Shell write failed after retry: ${key}`, error as Error);
    toast({
        variant: 'destructive',
        title: '설정을 저장하지 못했습니다',
        description: `앱에 쓰기가 실패했습니다 (${key}). 다시 시도해 주세요.`,
    });
};
