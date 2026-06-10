import { automationTool } from "./automation-tool.js";
import { browserTool } from "./browser.js";
import { channelTool } from "./channel-tool.js";
import { checkDeferredTool } from "./check-deferred.js";
import { computerUseTool } from "./computer-use.js";
import { fileOpsTool } from "./file-ops.js";
import { cronTool } from "./cron-tool.js";
import { currentStatusTool } from "./current-status.js";
import { dmTool } from "./dm-tool.js";
import { experienceTool } from "./experience.js";
import { installSkillTool } from "./install-skill.js";
import { notifyTool } from "./notify.js";
import { sessionFoldersTool } from "./session-folders.js";
import { stageFilesTool } from "./stage-files.js";
import { stopTaskTool } from "./stop-task.js";
import { subagentCloseTool, subagentReplyTool, subagentTool } from "./subagent.js";
import { terminalTool } from "./terminal.js";
import { todoTool } from "./todo.js";
import { ToolRegistry } from "./tool-registry.js";
import type { AnyToolDefinition } from "./types.js";
import { updateSettingsTool } from "./update-settings.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";
import { workflowTool } from "./workflow-tool.js";

export const DEFAULT_DISABLED_TOOLS = ["dm_tool", "workflow_tool", "experience"];

export function createCoreTools(): AnyToolDefinition[] {
  return [
    webSearchTool,
    webFetchTool,
    todoTool,
    terminalTool,
    fileOpsTool,
    notifyTool,
    stageFilesTool,
    updateSettingsTool,
    subagentTool,
    subagentReplyTool,
    subagentCloseTool,
    browserTool,
    computerUseTool,
    cronTool,
    automationTool,
    channelTool,
    dmTool,
    workflowTool,
    installSkillTool,
    sessionFoldersTool,
    checkDeferredTool,
    currentStatusTool,
    stopTaskTool,
    experienceTool
  ];
}

export function createCoreToolRegistry(disabled: string[] = []): ToolRegistry {
  return new ToolRegistry(createCoreTools(), [...DEFAULT_DISABLED_TOOLS, ...disabled]);
}
