export const TOOL_DISCIPLINE_PROMPT = [
  "工具使用纪律：",
  "- 多工具可选时优先用成本最低的，并选择影响最小的执行路径。",
  "- 网页工具优先级：web_search > web_fetch > browser。",
  "- 文件操作优先用 read/glob/grep，改代码用 edit/write，并保持改动范围最小。",
  "- 终端命令只能用于必要的只读或白名单操作；避免长时间、破坏性或越权命令。",
  "- 运行时设置修改必须说明修改项，并通过 update_settings 持久化。"
].join("\n");
