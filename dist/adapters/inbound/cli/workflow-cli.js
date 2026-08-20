import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
export async function runWorkflowCommand(argv, frameworkRoot) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    try {
        const runtime = createPipelineRuntime(frameworkRoot);
        if (action === "list") {
            parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 0, maxPositionals: 0 });
            return success("workflow.list", await runtime.listWorkflows(), json);
        }
        if (action === "show") {
            const parsed = parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
            return success("workflow.show", await runtime.showWorkflow(parsed.positionals[0]), json);
        }
        throw new CliUsageError("workflow action must be list or show");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof CliUsageError ? 64 : 3;
        return json
            ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command: `workflow.${action ?? "unknown"}`, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
            : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
    }
}
function success(command, data, json) {
    if (json)
        return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings: [] })}\n`, stderr: "" };
    const workflows = Array.isArray(data) ? data : [data];
    const lines = workflows.flatMap((workflow) => [
        `${workflow.id} (${workflow.aliases.join(", ") || "sans alias"}) — ${workflow.name}`,
        `  ${workflow.description}`,
        `  ${workflow.steps.map((step) => step.id).join(" → ")}`,
    ]);
    return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}
//# sourceMappingURL=workflow-cli.js.map