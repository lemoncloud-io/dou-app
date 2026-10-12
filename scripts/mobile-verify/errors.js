/**
 * The runner's three outcomes, as exit codes an agent can branch on without parsing output:
 *
 *   0  the scenario ran and passed
 *   1  the scenario ran and failed — a product bug or a stale selector, never the machine
 *   2  the scenario could not run — the environment (or the invocation) needs fixing first
 *
 * Keeping "could not run" apart from "ran and failed" is the point: retrying an exit 2 changes
 * nothing until a person acts on the printed fix, while an exit 1 is worth reading.
 */
const EXIT = Object.freeze({ PASS: 0, SCENARIO_FAILED: 1, ENVIRONMENT: 2 });

/** The run cannot happen. `fix` is the actionable line printed under the problem. */
class EnvironmentError extends Error {
    /**
     * @param {string} message what is wrong
     * @param {string | string[]} [fix] what to do about it, one step per entry
     */
    constructor(message, fix) {
        super(message);
        this.name = 'EnvironmentError';
        this.fix = Array.isArray(fix) ? fix : fix ? [fix] : [];
    }
}

/** The app ran and the scenario did not pass. */
class ScenarioError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ScenarioError';
    }
}

/** Format preflight problems ({ message, fix[] }) as the block printed before exiting 2. */
function formatProblems(problems) {
    const lines = [`${problems.length} problem(s) stop this run:`, ''];
    problems.forEach((problem, index) => {
        lines.push(`  ${index + 1}. ${problem.message}`);
        for (const step of problem.fix ?? []) lines.push(`       fix: ${step}`);
        lines.push('');
    });
    return lines.join('\n');
}

module.exports = { EXIT, EnvironmentError, ScenarioError, formatProblems };
