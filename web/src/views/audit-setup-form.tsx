import type { ComponentType, FormEvent, SVGProps } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  Check,
  Code2,
  Compass,
  GitBranch,
  HeartPulse,
  Network,
  PanelsTopLeft,
  Rocket,
  Scale,
  ServerCog,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import type { AuditDepth, AuditMode, AuditModuleId } from "../../../src/domain/audit/audit-types";
import type { MessageKey } from "../i18n/i18n";
import { useI18n } from "../i18n/i18n";
import { AUDIT_PURPOSE_DEFAULTS, USER_AUDIT_MODULES, type AuditPurpose } from "./audit-form-model";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { readonly size?: number }>;

const PURPOSES: readonly { readonly id: AuditPurpose; readonly icon: Icon }[] = [
  { id: "health", icon: HeartPulse },
  { id: "release", icon: Rocket },
  { id: "discovery", icon: Compass },
];

const MODULE_ICONS: Readonly<Record<string, Icon>> = {
  git: GitBranch,
  code: Code2,
  architecture: Network,
  stack: Boxes,
  security: ShieldCheck,
  cicd: Workflow,
  observability: Activity,
  compliance: Scale,
  product: PanelsTopLeft,
  operations: ServerCog,
  business: BriefcaseBusiness,
};

const MODE_DESCRIPTION_KEYS: Readonly<Record<AuditMode, MessageKey>> = {
  audit: "web.audits.mode.auditDetail",
  discovery: "web.audits.mode.discoveryDetail",
  mixed: "web.audits.mode.mixedDetail",
};

const DEPTH_DESCRIPTION_KEYS: Readonly<Record<"inventory" | "static", MessageKey>> = {
  inventory: "web.audits.depth.inventoryDetail",
  static: "web.audits.depth.staticDetail",
};

interface AuditSetupFormProps {
  readonly features: readonly { readonly id: string; readonly name: string }[];
  readonly purpose: AuditPurpose | null;
  readonly objective: string;
  readonly featureId: string;
  readonly mode: AuditMode;
  readonly depth: Extract<AuditDepth, "inventory" | "static">;
  readonly modules: readonly AuditModuleId[];
  readonly busy: boolean;
  readonly error?: string;
  readonly onPurposeChange: (purpose: AuditPurpose) => void;
  readonly onObjectiveChange: (objective: string) => void;
  readonly onFeatureChange: (featureId: string) => void;
  readonly onModeChange: (mode: AuditMode) => void;
  readonly onDepthChange: (depth: Extract<AuditDepth, "inventory" | "static">) => void;
  readonly onModulesChange: (modules: readonly AuditModuleId[]) => void;
  readonly onSubmit: (event: FormEvent) => void;
}

export function AuditSetupForm(props: AuditSetupFormProps) {
  const { t } = useI18n();
  const mixedNeedsAnotherDomain = props.mode === "mixed" && props.modules.length < 2;
  const applyPurpose = (purpose: AuditPurpose) => {
    props.onPurposeChange(purpose);
  };
  const toggleModule = (moduleId: AuditModuleId, selected: boolean) => {
    props.onModulesChange(selected ? [...props.modules, moduleId] : props.modules.filter((candidate) => candidate !== moduleId));
  };

  return <form id="prepare-audit" className="audit-setup" onSubmit={props.onSubmit}>
    <div className="modal-intro"><ShieldCheck size={16} /><span>{t("web.audits.setupIntro")}</span></div>

    <section className="audit-form-section" aria-labelledby="audit-purpose-title">
      <FormSectionHeading number="1" id="audit-purpose-title" title={t("web.audits.purposeTitle")} detail={t("web.audits.purposeDetail")} />
      <div className="audit-purpose-options">
        {PURPOSES.map(({ id, icon: PurposeIcon }, index) => <label className={`audit-purpose-option${props.purpose === id ? " selected" : ""}`} key={id}>
          <input type="radio" name="audit-purpose" value={id} checked={props.purpose === id} onChange={() => applyPurpose(id)} />
          <span className="audit-choice-icon"><PurposeIcon size={17} /></span>
          <span><strong>{t(`web.audits.purpose.${id}.title`)}</strong><small>{t(`web.audits.purpose.${id}.detail`)}</small></span>
          {index === 0 ? <em>{t("web.common.recommended")}</em> : null}
          {props.purpose === id ? <Check className="audit-choice-check" size={16} /> : null}
        </label>)}
      </div>
    </section>

    <section className="audit-form-section" aria-labelledby="audit-scope-title">
      <FormSectionHeading number="2" id="audit-scope-title" title={t("web.audits.scopeTitle")} detail={t("web.audits.scopeDetail")} />
      <div className="form-grid audit-scope-grid">
        <label>{t("web.audits.scope")}<select value={props.featureId} onChange={(event) => props.onFeatureChange(event.target.value)}><option value="">{t("web.audits.wholeProject")}</option>{props.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select><span className="field-hint">{props.featureId === "" ? t("web.audits.wholeProjectHint") : t("web.audits.featureHint")}</span></label>
        <label className="full">{t("web.audits.objective")}<textarea required rows={3} maxLength={2_000} value={props.objective} placeholder={t("web.audits.objectivePlaceholder")} onChange={(event) => props.onObjectiveChange(event.target.value)} /><span className="field-hint">{t("web.audits.objectiveHint")}</span></label>
      </div>
    </section>

    <section className="audit-form-section" aria-labelledby="audit-domains-title">
      <FormSectionHeading number="3" id="audit-domains-title" title={t("web.audits.domainsTitle")} detail={t("web.audits.domainsDetail")} aside={`${props.modules.length} ${t("web.audits.selectedDomains")}`} />
      <div className="audit-domain-actions"><button type="button" className="text-link" onClick={() => props.onModulesChange(AUDIT_PURPOSE_DEFAULTS[props.purpose ?? "health"].modules)}>{t("web.audits.resetRecommendation")}</button><button type="button" className="text-link" onClick={() => props.onModulesChange(USER_AUDIT_MODULES.map((module) => module.id))}>{t("web.audits.selectAll")}</button></div>
      <div className="audit-domain-grid">
        {USER_AUDIT_MODULES.map((module) => {
          const selected = props.modules.includes(module.id);
          const ModuleIcon = MODULE_ICONS[module.key] ?? Boxes;
          return <label className={`audit-domain-option${selected ? " selected" : ""}`} key={module.id}>
            <input type="checkbox" checked={selected} onChange={(event) => toggleModule(module.id, event.target.checked)} />
            <span className="audit-choice-icon"><ModuleIcon size={16} /></span>
            <span><strong>{t(auditModuleKey(module.key, "title"))}</strong><small>{t(auditModuleKey(module.key, "description"))}</small></span>
            {selected ? <Check className="audit-choice-check" size={15} /> : null}
          </label>;
        })}
      </div>
      {props.modules.length === 0 ? <p className="form-error"><AlertTriangle size={15} />{t("web.audits.noDomains")}</p> : null}
      {mixedNeedsAnotherDomain ? <p className="form-error"><AlertTriangle size={15} />{t("web.audits.mixedNeedsTwoDomains")}</p> : null}
    </section>

    <details className="form-advanced audit-advanced">
      <summary>{t("web.audits.advancedSettings")}</summary>
      <p className="field-hint">{t("web.audits.advancedDetail")}</p>
      <div className="form-advanced-body">
        <label>{t("web.audits.mode")}<select value={props.mode} onChange={(event) => props.onModeChange(event.target.value as AuditMode)}><option value="audit">{t("web.audits.mode.audit")}</option><option value="discovery">{t("web.audits.mode.discovery")}</option><option value="mixed">{t("web.audits.mode.mixed")}</option></select><span className="field-hint">{t(MODE_DESCRIPTION_KEYS[props.mode])}</span></label>
        <label>{t("web.audits.depth")}<select value={props.depth} onChange={(event) => props.onDepthChange(event.target.value as "inventory" | "static")}><option value="inventory">{t("web.audits.depth.inventory")}</option><option value="static">{t("web.audits.depth.static")}</option></select><span className="field-hint">{t(DEPTH_DESCRIPTION_KEYS[props.depth])}</span></label>
      </div>
    </details>

    {props.error === undefined ? null : <p className="form-error"><AlertTriangle size={15} /><span>{t("web.audits.prepareError")}<small>{props.error}</small></span></p>}
    <div className="audit-readonly-note"><ShieldCheck size={15} /><span><strong>{t("web.audits.readOnlyTitle")}</strong>{t("web.audits.readOnlyDetail")}</span></div>
    <button className="audit-hidden-submit" type="submit" disabled={props.busy || props.modules.length === 0 || mixedNeedsAnotherDomain} tabIndex={-1} aria-hidden="true" />
  </form>;
}

function FormSectionHeading({ number, id, title, detail, aside }: { readonly number: string; readonly id: string; readonly title: string; readonly detail: string; readonly aside?: string }) {
  return <header className="audit-form-heading"><span aria-hidden="true">{number}</span><div><h3 id={id}>{title}</h3><p>{detail}</p></div>{aside === undefined ? null : <small>{aside}</small>}</header>;
}

function auditModuleKey(key: string, field: "title" | "description"): MessageKey {
  return `web.audits.module.${key}.${field}` as MessageKey;
}
