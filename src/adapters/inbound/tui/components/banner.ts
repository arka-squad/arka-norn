/**
 * Banner -- LOGO ASCII ARKALABS + bandeau contexte. Port TS de
 * arka-cc-management (adapters/inbound/tui/components/banner.ts).
 *
 * `LOGO_GLYPHS`/`decodeLogoLine`/`LOGO_CODED`/`ARKA_LOGO` sont repris
 * VERBATIM (identité de la maison mère ARKALABS -- ne pas réinventer).
 * Seuls la ligne de marque (nom de produit "arka-norn" au lieu de "arka")
 * et le tagline par défaut sont adaptés au produit.
 *
 * `renderPromoBanner`/`renderOfflineBanner` de la source NE SONT PAS
 * portées : elles dépendent d'un catalogue distant et d'un état
 * online/offline qui n'existent pas dans arka-norn (pas d'API, pas de
 * connectivité réseau à surveiller).
 *
 * Encodage : aucun caractère non-ASCII direct -- tous les glyphes passent
 * par `String.fromCharCode`.
 */
import type { Theme } from "../runtime/theme.js";
import { titledBox } from "./box.js";

const HORIZONTAL = String.fromCharCode(0x2500);

// LOGO glyph codes -- mapping compact conservé ASCII-pur à la source.
// Décodé via `decodeLogoLine` à l'init du module.
//   ' ' -- espace (inchangé)
//   'F' -- U+2588 bloc plein
//   'T' -- U+2554 box-drawings double down + right
//   'R' -- U+2557 box-drawings double down + left
//   'L' -- U+255A box-drawings double up + right
//   'J' -- U+255D box-drawings double up + left
//   'H' -- U+2550 box-drawings double horizontal
//   'V' -- U+2551 box-drawings double vertical
const LOGO_GLYPHS: Record<string, string> = {
  F: String.fromCharCode(0x2588),
  T: String.fromCharCode(0x2554),
  R: String.fromCharCode(0x2557),
  L: String.fromCharCode(0x255a),
  J: String.fromCharCode(0x255d),
  H: String.fromCharCode(0x2550),
  V: String.fromCharCode(0x2551),
};

function decodeLogoLine(coded: string): string {
  let out = "";
  for (const ch of coded) {
    out += LOGO_GLYPHS[ch] ?? ch;
  }
  return out;
}

// LOGO ARKALABS original -- 6 lignes, largeur uniforme 66 cellules.
// Mapping repris octet pour octet de la source (vérifié via stringWidth).
const LOGO_CODED: readonly string[] = [
  "   FFFFFR FFFFFFR FFR  FFR FFFFFR FFR      FFFFFR FFFFFFR FFFFFFFR",
  "  FFTHHFFRFFTHHFFRFFV FFTJFFTHHFFRFFV     FFTHHFFRFFTHHFFRFFTHHHHJ",
  "  FFFFFFFVFFFFFFTJFFFFFTJ FFFFFFFVFFV     FFFFFFFVFFFFFFTJFFFFFFFR",
  "  FFTHHFFVFFTHHFFRFFTHFFR FFTHHFFVFFV     FFTHHFFVFFTHHFFRLHHHHFFV",
  "  FFV  FFVFFV  FFVFFV  FFRFFV  FFVFFFFFFFRFFV  FFVFFFFFFTJFFFFFFFV",
  "  LHJ  LHJLHJ  LHJLHJ  LHJLHJ  LHJLHHHHHHJLHJ  LHJLHHHHHJ LHHHHHHJ",
];

export const ARKA_LOGO: readonly string[] = Object.freeze(LOGO_CODED.map(decodeLogoLine));

export interface ArkaHeaderOptions {
  readonly version?: string;
  readonly tagline?: string;
  readonly runtimeLabel?: string;
}

/**
 * Header pleine page -- LOGO + ligne de marque + tagline. Affiché au
 * démarrage de la TUI (chrome persistant, cf. tui-app.ts).
 */
export function renderArkaHeader(theme: Theme, opts: ArkaHeaderOptions = {}): readonly string[] {
  const version = opts.version ?? "1.2.0";
  const tagline = opts.tagline ?? "Framework méthodologique multiprovider";
  const runtimeLabel = opts.runtimeLabel ?? "";
  const runtimePart = runtimeLabel ? ` ${theme.dim("-")} ${theme.arkaAccent(runtimeLabel)}` : "";
  return [
    ...ARKA_LOGO.map((line) => theme.arkaRed(line)),
    "",
    `${theme.dim("arkalabs")} ${theme.dim("-")} ${theme.bold("arka-norn")} ${theme.gray(`v${version}`)}${runtimePart}`,
    theme.gray(tagline),
    "",
  ];
}

export interface ArkaBannerOptions {
  readonly version?: string;
  readonly section?: string;
}

/** Bandeau compact -- en-tête de sous-vues secondaires. */
export function renderArkaBanner(theme: Theme, opts: ArkaBannerOptions = {}): readonly string[] {
  const version = opts.version ?? "1.2.0";
  const sectionPart = opts.section ? ` ${theme.dim(">")} ${theme.bold(opts.section)}` : "";
  const line = `  ${theme.dim("arkalabs")} ${theme.dim("-")} ${theme.bold("arka-norn")} ${theme.gray(`v${version}`)}${sectionPart}`;
  const rule = `  ${theme.dim(HORIZONTAL.repeat(40))}`;
  return [line, rule];
}

export interface ContextInfo {
  readonly runtime: string;
  readonly root: string;
  readonly project?: { readonly name: string };
  readonly feature?: { readonly name: string };
  readonly agent?: { readonly id: string };
}

/** Encadré haut d'écran -- runtime + racine + Project/Feature actifs éventuels. */
export function renderContextBanner(ctx: ContextInfo, theme: Theme): readonly string[] {
  const lines: string[] = [];
  lines.push(`${theme.dim("Runtime :")} ${ctx.runtime}`);
  lines.push(`${theme.dim("Racine  :")} ${ctx.root}`);
  if (ctx.project !== undefined) {
    lines.push(`${theme.dim("Project :")} ${ctx.project.name}`);
  }
  if (ctx.feature !== undefined) {
    lines.push(`${theme.dim("Feature :")} ${ctx.feature.name}`);
  }
  if (ctx.agent !== undefined) {
    lines.push(`${theme.dim("Agent   :")} ${ctx.agent.id}`);
  }
  const titleSuffix =
    ctx.feature !== undefined
      ? `Feature : ${ctx.feature.name}`
      : ctx.project !== undefined
        ? `Project : ${ctx.project.name}`
        : undefined;
  const title = titleSuffix !== undefined ? `${theme.bold("arka-norn")} ${theme.dim("-")} ${theme.bold(titleSuffix)}` : theme.bold("arka-norn");
  return titledBox(title, lines, theme, { paddingX: 1, border: theme.dim }).split("\n");
}
