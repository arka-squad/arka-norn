import { AUDIT_MESSAGES } from "./en/audit.js";
import { CLI_MESSAGES } from "./en/cli.js";
import { CLI_OPERATION_MESSAGES } from "./en/cli-operations.js";
import { COMMON_MESSAGES } from "./en/common.js";
import { ORCHESTRATION_MESSAGES } from "./en/orchestration.js";
import { PIPELINE_MESSAGES } from "./en/pipeline.js";
import { TUI_MESSAGES } from "./en/tui.js";
import { TUI_VIEW_MESSAGES } from "./en/tui-views.js";
import { TUI_ORCHESTRATION_MESSAGES } from "./en/tui-orchestration.js";
import { TUI_ACTION_MESSAGES } from "./en/tui-actions.js";
import { WEB_MESSAGES } from "./en/web.js";
export const EN_MESSAGES = {
    ...COMMON_MESSAGES,
    ...CLI_MESSAGES,
    ...CLI_OPERATION_MESSAGES,
    ...TUI_MESSAGES,
    ...TUI_VIEW_MESSAGES,
    ...TUI_ORCHESTRATION_MESSAGES,
    ...TUI_ACTION_MESSAGES,
    ...PIPELINE_MESSAGES,
    ...AUDIT_MESSAGES,
    ...ORCHESTRATION_MESSAGES,
    ...WEB_MESSAGES,
};
//# sourceMappingURL=en.js.map