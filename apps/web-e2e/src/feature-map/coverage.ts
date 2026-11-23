import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface FeatureMap {
    features: Record<string, string[]>;
    crossCutting: string[];
}

export interface FeatureCoverage {
    features: { name: string; specs: string[] }[];
    uncovered: string[];
    problems: string[];
}

const E2E_ROOT = join(__dirname, '..', '..');
export const FEATURE_MAP_PATH = join(E2E_ROOT, 'feature-map.json');
export const SPECS_ROOT = join(E2E_ROOT, 'src', 'specs');
export const FEATURES_ROOT = join(E2E_ROOT, '..', 'web', 'src', 'app', 'features');

export const listSpecs = (root: string = SPECS_ROOT): string[] => {
    const found: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
            const path = join(dir, entry);
            if (statSync(path).isDirectory()) walk(path);
            else if (entry.endsWith('.spec.ts')) found.push(relative(root, path).split(sep).join('/'));
        }
    };
    walk(root);
    return found.sort();
};

export const listFeatures = (root: string = FEATURES_ROOT): string[] =>
    readdirSync(root)
        .filter(entry => statSync(join(root, entry)).isDirectory())
        .sort();

export const readFeatureMap = (path: string = FEATURE_MAP_PATH): FeatureMap => {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<FeatureMap>;
    return { features: parsed.features ?? {}, crossCutting: parsed.crossCutting ?? [] };
};

export const checkCoverage = (map: FeatureMap, features: string[], specs: string[]): FeatureCoverage => {
    const problems: string[] = [];
    const specSet = new Set(specs);
    const mapped = new Set<string>();

    for (const name of features) {
        if (!(name in map.features)) problems.push(`feature folder "${name}" is missing from feature-map.json`);
    }
    for (const [name, list] of Object.entries(map.features)) {
        if (!features.includes(name)) problems.push(`feature-map.json names "${name}", which is not a feature folder`);
        for (const spec of list) {
            if (!specSet.has(spec)) problems.push(`feature "${name}" lists ${spec}, which does not exist`);
            mapped.add(spec);
        }
    }
    for (const spec of map.crossCutting) {
        if (!specSet.has(spec)) problems.push(`crossCutting lists ${spec}, which does not exist`);
        mapped.add(spec);
    }
    for (const spec of specs) {
        if (!mapped.has(spec)) problems.push(`${spec} is under no feature and not crossCutting`);
    }

    const rows = features.map(name => ({ name, specs: map.features[name] ?? [] }));
    return { features: rows, uncovered: rows.filter(row => row.specs.length === 0).map(row => row.name), problems };
};

export const currentCoverage = (): FeatureCoverage | null => {
    if (!existsSync(FEATURE_MAP_PATH) || !existsSync(FEATURES_ROOT)) return null;
    return checkCoverage(readFeatureMap(), listFeatures(), listSpecs());
};
