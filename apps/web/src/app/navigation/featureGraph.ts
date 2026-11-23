export interface FeatureGraphNode {
    feature: string;
    instance: string;
}

const GRAPH_PATTERNS: readonly { feature: string; pattern: RegExp }[] = [
    { feature: 'channels', pattern: /^\/channels\/(?!start-dm(?:\/|$))([^/]+)(?:\/|$)/ },
    { feature: 'place', pattern: /^\/place\/([^/]+)(?:\/|$)/ },
];

const pathnameOf = (location: string): string => location.split('#')[0].split('?')[0];

export const readFeatureGraph = (location: string): FeatureGraphNode | null => {
    const pathname = pathnameOf(location);

    for (const { feature, pattern } of GRAPH_PATTERNS) {
        const match = pattern.exec(pathname);
        if (match) return { feature, instance: match[1] };
    }

    return null;
};

export const isSiblingGraphEntry = (from: string, to: string): boolean => {
    const fromGraph = readFeatureGraph(from);
    const toGraph = readFeatureGraph(to);

    if (!fromGraph || !toGraph) return false;

    return fromGraph.feature === toGraph.feature && fromGraph.instance !== toGraph.instance;
};

export const countGraphRun = (
    stack: readonly (string | null)[],
    currentIndex: number | null,
    graph: FeatureGraphNode | null
): number => {
    if (!graph || currentIndex === null) return 0;

    let run = 0;
    for (let index = Math.min(currentIndex, stack.length - 1); index >= 0; index -= 1) {
        const pathname = stack[index];
        if (!pathname) break;

        const entryGraph = readFeatureGraph(pathname);
        if (!entryGraph || entryGraph.feature !== graph.feature || entryGraph.instance !== graph.instance) break;

        run += 1;
    }

    return run;
};
