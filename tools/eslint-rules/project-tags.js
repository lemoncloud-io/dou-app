'use strict';

const fs = require('fs');
const path = require('path');

const readJson = file => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
};

const isInside = (file, root) => file === root || file.startsWith(root + path.sep);

let nxGraph;
const nxProjects = () => {
    if (nxGraph !== undefined) return nxGraph;
    try {
        const { readCachedProjectGraph, workspaceRoot } = require('@nx/devkit');
        const projects = Object.values(readCachedProjectGraph().nodes).map(node => ({
            root: path.join(workspaceRoot, node.data.root),
            tags: node.data.tags ?? [],
        }));
        nxGraph = { workspaceRoot, projects };
    } catch {
        nxGraph = null;
    }
    return nxGraph;
};

const projectFromGraph = (file, graph) =>
    graph.projects
        .filter(project => project.root !== graph.workspaceRoot && isInside(file, project.root))
        .sort((a, b) => b.root.length - a.root.length)[0] ?? null;

const projectFromFiles = file => {
    let dir = path.dirname(file);
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'nx.json'))) return null;
        const project = readJson(path.join(dir, 'project.json'));
        const pkg = readJson(path.join(dir, 'package.json'));
        if (project || pkg) {
            return { root: dir, tags: [...(project?.tags ?? []), ...(pkg?.nx?.tags ?? [])] };
        }
        dir = path.dirname(dir);
    }
    return null;
};

const projectOf = filename => {
    const file = path.resolve(filename);
    const graph = nxProjects();
    if (graph && isInside(file, graph.workspaceRoot)) return projectFromGraph(file, graph);
    return projectFromFiles(file);
};

const reportedOn = new Map();

module.exports = {
    meta: {
        type: 'problem',
        docs: { description: 'Requires every Nx project to carry a tag on each named axis.' },
        schema: [
            {
                type: 'object',
                properties: { axes: { type: 'array', items: { type: 'string' } } },
                additionalProperties: false,
            },
        ],
        messages: {
            missing:
                'The project at {{root}} has no `{{axis}}:*` tag. Add one to `tags` in its project.json or `nx.tags` in its package.json.',
        },
    },
    create(context) {
        const axes = context.options[0]?.axes ?? [];
        return {
            Program(node) {
                const project = projectOf(context.filename);
                if (!project) return;
                for (const axis of axes) {
                    if (project.tags.some(tag => tag.startsWith(`${axis}:`))) continue;
                    const key = `${project.root}\0${axis}`;
                    const first = reportedOn.get(key) ?? context.filename;
                    reportedOn.set(key, first);
                    if (first !== context.filename) continue;
                    context.report({ node, messageId: 'missing', data: { root: project.root, axis } });
                }
            },
        };
    },
};
