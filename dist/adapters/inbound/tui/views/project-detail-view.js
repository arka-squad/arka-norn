import { createHash } from "node:crypto";
import { basename, relative, resolve } from "node:path";
import { DomainError } from "../../../../domain/errors.js";
import { FeatureId } from "../../../../domain/feature/feature-id.js";
import { titledBox } from "../components/box.js";
import { createMenuScene } from "../components/menu.js";
export function createProjectDetailView(deps) {
    let features = [...deps.initialFeatures];
    let statuses = new Map(deps.initialStatuses ?? []);
    let metrics = new Map(deps.initialMetrics ?? []);
    let mode = "menu";
    let createPath = `${deps.project.root}/`;
    let message;
    let menu = buildMenu();
    function items() {
        const groupedFeatures = [...features].sort((left, right) => {
            const byStatus = (statuses.get(left.id.value) ?? "unknown").localeCompare(statuses.get(right.id.value) ?? "unknown");
            return byStatus === 0 ? left.name.localeCompare(right.name) : byStatus;
        });
        return [
            { label: "Créer ou importer une feature", value: "action:create" },
            ...groupedFeatures.map((feature) => ({ label: `● [${statuses.get(feature.id.value) ?? "inconnu"}] ${feature.name}`, value: `feature:${feature.id.value}`, description: feature.root })),
            { label: "Rescanner le projet", value: "action:scan" },
            { label: "Retirer ce projet de l’index", value: "action:forget" },
            { label: "← Retour", value: "action:back" },
        ];
    }
    function buildMenu() {
        return createMenuScene(items(), {
            hint: "Flèches naviguer, Entrée sélectionner, Échap retour",
            maxVisible: 12,
            onSelect: (value) => void select(value),
        });
    }
    async function select(value) {
        if (value.startsWith("feature:")) {
            const feature = await deps.features.switchTo(FeatureId.of(value.slice("feature:".length)));
            await deps.onOpenFeature?.(feature);
        }
        else if (value === "action:create") {
            mode = "create";
            deps.redraw();
        }
        else if (value === "action:scan") {
            const results = await deps.scan.scan({ target: deps.project.root, projectId: deps.project.id });
            await refresh();
            message = `Scan terminé : ${results.filter((entry) => entry.feature !== undefined).length} feature(s).`;
        }
        else if (value === "action:forget") {
            await deps.onForget?.(deps.project);
        }
        else {
            deps.onBack();
        }
    }
    async function submit() {
        const root = resolve(createPath.trim());
        if (!isContained(deps.project.root, root)) {
            message = `La Feature doit rester dans le Project "${deps.project.root}".`;
            deps.redraw();
            return;
        }
        try {
            const name = basename(root);
            try {
                await deps.features.importFrom({ root, projectId: deps.project.id });
            }
            catch (error) {
                if (!(error instanceof DomainError) || error.code !== "FEATURE_NOT_FOUND")
                    throw error;
                await deps.features.create({ id: deriveFeatureId(root, slugify(name)), projectId: deps.project.id, name, root });
            }
            mode = "menu";
            await refresh();
        }
        catch (error) {
            message = error instanceof Error ? error.message : String(error);
            deps.redraw();
        }
    }
    async function refresh() {
        features = (await deps.features.list()).filter((feature) => feature.belongsTo(deps.project.id));
        if (deps.statusForFeature !== undefined) {
            statuses = new Map(await Promise.all(features.map(async (feature) => [feature.id.value, await deps.statusForFeature(feature)])));
        }
        if (deps.metricsForFeature !== undefined) {
            metrics = new Map(await Promise.all(features.map(async (feature) => [feature.id.value, await deps.metricsForFeature(feature)])));
        }
        menu = buildMenu();
        deps.redraw();
    }
    return {
        chrome: { contextBanner: false },
        onKey(event) {
            if (mode === "create") {
                if (event.kind === "escape")
                    mode = "menu";
                else if (event.kind === "enter")
                    void submit();
                else if (event.kind === "backspace")
                    createPath = createPath.slice(0, -1);
                else if (event.kind === "char")
                    createPath += event.value;
                else if (event.kind === "filter")
                    createPath += "/";
                deps.redraw();
                return "consumed";
            }
            if (event.kind === "escape") {
                deps.onBack();
                return "consumed";
            }
            return menu.onKey(event);
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                if (mode === "create") {
                    for (const value of titledBox("Créer ou importer une feature", [`Sous ${deps.project.root}`, `${createPath}${theme.dim("_")}`, message ?? ""], theme).split("\n"))
                        line(value);
                    return;
                }
                const health = [...statuses.values()].reduce((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {});
                const groups = Object.entries(health).sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => `${status}=${count}`).join(" · ") || "aucune";
                const totals = [...metrics.values()].reduce((sum, item) => ({
                    debts: sum.debts + item.debtDocuments,
                    qa: sum.qa + item.qaFailures,
                    handoffs: sum.handoffs + item.handoffSignals,
                    invalid: sum.invalid + item.invalidDocuments,
                }), { debts: 0, qa: 0, handoffs: 0, invalid: 0 });
                for (const value of titledBox(deps.project.name, [
                    `Racine : ${deps.project.root}`,
                    `Features : ${features.length}`,
                    `États : ${groups}`,
                    `Dettes : ${totals.debts} · anomalies QA : ${totals.qa} · handoffs : ${totals.handoffs} · documents invalides : ${totals.invalid}`,
                ], theme, { border: theme.arkaRed }).split("\n"))
                    line(value);
                if (message !== undefined)
                    line(`  ${theme.arkaAccent(message)}`);
                for (const value of menu.renderLines(theme))
                    line(value);
            });
        },
    };
}
function isContained(projectRoot, featureRoot) {
    const relation = relative(resolve(projectRoot), resolve(featureRoot));
    return relation.length > 0 && !relation.startsWith("..") && !relation.startsWith("/");
}
function deriveFeatureId(root, code) {
    const suffix = createHash("sha1").update(root).digest("hex").slice(0, 8);
    return FeatureId.of(`${code.slice(0, 55)}-${suffix}`);
}
function slugify(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug.length === 0)
        throw new DomainError("INVALID_FEATURE_OPTION", `Nom de Feature inexploitable : "${name}".`);
    return slug;
}
//# sourceMappingURL=project-detail-view.js.map