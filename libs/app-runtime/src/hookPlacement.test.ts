import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * A hook lives in its own module's `hooks/` folder — no exceptions.
 *
 * Back when this was convention rather than a rule, hooks were scattered across five different
 * shapes: `runtime/` was a folder that was entirely hooks, `connection/` mixed hooks with `.tsx`
 * components, `push/` had a single one at its root, while `data/hooks/` · `session/hooks/` ·
 * `socket/sync/hooks/` already used a subfolder. No single placement was wrong, and that was exactly
 * the problem — the only basis for deciding where a new hook belonged was whatever that folder had
 * done before.
 *
 * The repo-wide convention is already `hooks/` (`libs/shared/src/hooks` · `libs/device-utils/src/hooks`
 * · `libs/theme/src/hooks` + most app feature folders). This check turns that convention into a rule
 * this package can verify mechanically.
 *
 * The judgment is by filename: a source file starting with `use*` must have `hooks/` in its path. The
 * reverse isn't checked — a non-hook file inside `hooks/` (`queryKeys.ts` · `mutationKeys.ts`) is fine,
 * since those are constants the hooks themselves use.
 */
const SRC = join(__dirname);

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [path];
    });

describe('app-runtime — 훅 배치', () => {
    it('use* 파일은 전부 hooks/ 안에 있다', () => {
        const misplaced = sourceFiles(SRC)
            .map(file => relative(SRC, file))
            .filter(file => /(^|[\\/])use[A-Z]/.test(file))
            .filter(file => !file.split(sep).slice(0, -1).includes('hooks'))
            .sort();

        // Print offending files by name — a bare count wouldn't say where to move them.
        expect(misplaced).toEqual([]);
    });

    /**
     * A filename-only check misses **a hook declared inside a file**. It really did miss one:
     * `data/invitedCloudDurability.ts` was exporting `useInvitedCloudNameSync`, and that file doesn't
     * start with `use*`, so it sailed right through the check above. When the guard is narrower than
     * the rule, the rule doesn't hold.
     *
     * Only looks at **exported** hooks. A local hook used only by its own component, like
     * `SocketBinder.tsx`'s `useSameWssSwitchGuard`/`useSocketSlot`, can't leave the file, so it isn't
     * a placement problem — it's normal React composition, splitting a component up.
     */
    it('export된 훅은 선언 위치까지 hooks/ 안이다', () => {
        const declaredOutside = sourceFiles(SRC)
            .filter(file => !relative(SRC, file).split(sep).slice(0, -1).includes('hooks'))
            .flatMap(file =>
                readFileSync(file, 'utf8')
                    .split('\n')
                    .filter(line => /^export (const|function) use[A-Z]/.test(line))
                    .map(line => `${relative(SRC, file)}: ${line.trim().slice(0, 60)}`)
            )
            .sort();

        expect(declaredOutside).toEqual([]);
    });

    it('훅을 가진 모듈은 모두 hooks/ 폴더로 그것을 표현한다', () => {
        const hookFolders = sourceFiles(SRC)
            .map(file => relative(SRC, file))
            .filter(file => file.split(sep).includes('hooks'))
            .map(file => file.split(sep).slice(0, file.split(sep).indexOf('hooks')).join('/') || '<root>')
            .filter((value, index, all) => all.indexOf(value) === index)
            .sort();

        // If placement quietly regresses (a hook leaks to a module's root), this list shrinks.
        expect(hookFolders).toEqual(['connection', 'data', 'push', 'session', 'socket/sync']);
    });
});
