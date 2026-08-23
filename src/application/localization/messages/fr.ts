import type { EN_MESSAGES } from "./en.js";
import { AUDIT_MESSAGES_FR } from "./fr/audit.js";
import { CLI_MESSAGES_FR } from "./fr/cli.js";
import { CLI_OPERATION_MESSAGES_FR } from "./fr/cli-operations.js";
import { COMMON_MESSAGES_FR } from "./fr/common.js";
import { ORCHESTRATION_MESSAGES_FR } from "./fr/orchestration.js";
import { PIPELINE_MESSAGES_FR } from "./fr/pipeline.js";
import { TUI_MESSAGES_FR } from "./fr/tui.js";
import { TUI_VIEW_MESSAGES_FR } from "./fr/tui-views.js";
import { TUI_ORCHESTRATION_MESSAGES_FR } from "./fr/tui-orchestration.js";
import { TUI_ACTION_MESSAGES_FR } from "./fr/tui-actions.js";
import { WEB_MESSAGES_FR } from "./fr/web.js";

export const FR_MESSAGES: Readonly<Record<keyof typeof EN_MESSAGES, string>> = {
  ...COMMON_MESSAGES_FR,
  ...CLI_MESSAGES_FR,
  ...CLI_OPERATION_MESSAGES_FR,
  ...TUI_MESSAGES_FR,
  ...TUI_VIEW_MESSAGES_FR,
  ...TUI_ORCHESTRATION_MESSAGES_FR,
  ...TUI_ACTION_MESSAGES_FR,
  ...PIPELINE_MESSAGES_FR,
  ...AUDIT_MESSAGES_FR,
  ...ORCHESTRATION_MESSAGES_FR,
  ...WEB_MESSAGES_FR,
};
