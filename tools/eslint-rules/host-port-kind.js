'use strict';

/**
 * Keeps a feature from asking a host port which side does its work.
 *
 * A host port (`runtime.links`, `runtime.appShell`, …) carries `kind` — `'shell'` or `'browser'` — and,
 * for `appShell` and `signIn`, `os`, the phone platform behind a shell. The app's declaration part
 * builds the ports from them, and the log pipeline reads `diagnostics.kind` there before the ports are
 * published. A feature that branches on either does the port's job itself: it holds both sides' code,
 * and a host that does the work a third way, or a toggle that moves one port to the page, has to find
 * every branch. The port's members are where the two sides live; a capability only some hosts have is
 * a member that is `null` elsewhere.
 *
 * So this reports, for each port named in `ports`, a read of `kind` (and of `os`, on the ports that
 * carry one) off:
 * - `runtime.<port>`, `?.` and casts included;
 * - a local name bound to it — `const links = runtime.links`, `const { links } = runtime` — resolved
 *   through the scope it is used in, so another function's `links` is not mistaken for it;
 * - a destructuring of one of those: `const { kind } = runtime.links`, `const { links: { kind } } =
 *   runtime`.
 *
 * The declaration part (`src/config/`) builds the ports and is left out by the config's file globs, as
 * are tests, which play a host on purpose.
 *
 * Options:
 * - `ports` — the host ports whose `kind` features may no longer read.
 *
 * What it does not see: a port handed on as an argument and read there, a function parameter
 * destructured from one, or a name bound any other way than a plain declaration.
 */

/** The ports that carry the phone platform beside the choice. */
const PORTS_WITH_OS = new Set(['appShell', 'signIn']);

/** `runtime.links` through casts, non-null assertions, `?.` and parentheses. */
const unwrap = node => {
    let current = node;
    while (
        current &&
        (current.type === 'TSAsExpression' ||
            current.type === 'TSTypeAssertion' ||
            current.type === 'TSNonNullExpression' ||
            current.type === 'TSSatisfiesExpression' ||
            current.type === 'ChainExpression')
    ) {
        current = current.expression;
    }
    return current;
};

const propertyName = member => {
    if (!member.computed && member.property.type === 'Identifier') return member.property.name;
    if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') {
        return member.property.value;
    }
    return undefined;
};

const keyName = property => {
    if (property.type !== 'Property') return undefined;
    if (!property.computed && property.key.type === 'Identifier') return property.key.name;
    if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value;
    return undefined;
};

const isRuntime = node => {
    const inner = unwrap(node);
    return inner?.type === 'Identifier' && inner.name === 'runtime';
};

/** Whether `field` names the choice on `port`: `kind` everywhere, `os` where the port carries one. */
const isChoiceField = (port, field) => field === 'kind' || (field === 'os' && PORTS_WITH_OS.has(port));

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: "Disallow branching on a host port's `kind` outside the app's declaration.",
        },
        schema: [
            {
                type: 'object',
                properties: { ports: { type: 'array', items: { type: 'string' } } },
                additionalProperties: false,
            },
        ],
        messages: {
            kind: "`runtime.{{port}}.{{field}}` asks which side does the work; call the port's member instead (a capability only some hosts have is a member that is null elsewhere).",
        },
    },
    create(context) {
        const ports = new Set(context.options[0]?.ports ?? []);
        if (ports.size === 0) return {};
        const sourceCode = context.sourceCode ?? context.getSourceCode();

        /** The declaration `name` resolves to from `node`'s scope, or `undefined`. */
        const declaratorOf = (node, name) => {
            for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
                const variable = scope.set.get(name);
                if (!variable) continue;
                const def = variable.defs[0];
                return def?.type === 'Variable' ? def : undefined;
            }
            return undefined;
        };

        /**
         * The port `node` stands for: `runtime.<port>`, or a local name declared as one — whether bound
         * to `runtime.<port>` or destructured out of `runtime` (`{ links }`, `{ links: l }`).
         */
        const portOf = node => {
            const inner = unwrap(node);
            if (inner?.type === 'MemberExpression') {
                const name = propertyName(inner);
                return isRuntime(inner.object) && name !== undefined && ports.has(name) ? name : undefined;
            }
            if (inner?.type !== 'Identifier') return undefined;
            const def = declaratorOf(inner, inner.name);
            if (!def) return undefined;
            const declarator = def.node;
            if (declarator.id.type === 'Identifier') return portOf(declarator.init);
            if (declarator.id.type !== 'ObjectPattern' || !isRuntime(declarator.init)) return undefined;
            for (const property of declarator.id.properties) {
                const key = keyName(property);
                if (
                    key !== undefined &&
                    ports.has(key) &&
                    property.value.type === 'Identifier' &&
                    property.value.name === inner.name
                ) {
                    return key;
                }
            }
            return undefined;
        };

        const report = (node, port, field) => context.report({ node, messageId: 'kind', data: { port, field } });

        /** Reports the choice fields a pattern takes out of `port`. */
        const checkPattern = (pattern, port) => {
            for (const property of pattern.properties) {
                const key = keyName(property);
                if (key !== undefined && isChoiceField(port, key)) report(property, port, key);
            }
        };

        return {
            VariableDeclarator(node) {
                if (node.id.type !== 'ObjectPattern') return;
                // `const { kind } = runtime.links`, or through a local name for the port.
                const port = portOf(node.init);
                if (port) {
                    checkPattern(node.id, port);
                    return;
                }
                // `const { links: { kind } } = runtime`.
                if (!isRuntime(node.init)) return;
                for (const property of node.id.properties) {
                    const key = keyName(property);
                    if (key !== undefined && ports.has(key) && property.value.type === 'ObjectPattern') {
                        checkPattern(property.value, key);
                    }
                }
            },
            MemberExpression(node) {
                const field = propertyName(node);
                if (field !== 'kind' && field !== 'os') return;
                const port = portOf(node.object);
                if (port && isChoiceField(port, field)) report(node, port, field);
            },
        };
    },
};
