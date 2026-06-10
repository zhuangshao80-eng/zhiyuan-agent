import { createRequire } from "node:module";
import type { ModelOption } from "../shared/types.js";

const require = createRequire(import.meta.url);
const defaultModels = require("./default-models.json") as Array<Omit<ModelOption, "capabilities">>;
const knownModels = require("./known-models.json") as Record<string, string[]>;

export function listDefaultModelOptions(): ModelOption[] {
  return defaultModels
    .map((model) => ({
      ...model,
      capabilities: knownModels[model.model] ?? ["chat"]
    }))
    .sort((left, right) => {
      if (left.providerId === "deepseek") {
        return -1;
      }

      if (right.providerId === "deepseek") {
        return 1;
      }

      return left.label.localeCompare(right.label, "zh-CN");
    });
}
