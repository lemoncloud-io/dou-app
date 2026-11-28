import type { ToolDef } from '../toolTypes';

export const findTool = (tools: ToolDef[], name: string): ToolDef => {
    const tool = tools.find(candidate => candidate.name === name);
    if (!tool) throw new Error(`no tool named ${name}`);
    return tool;
};
