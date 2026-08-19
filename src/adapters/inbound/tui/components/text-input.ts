/**
 * TextInput -- Scene de saisie de texte libre (chemins de fichier/dossier).
 * N'existe pas dans arka-cc-management (son menu gère un mode filtre, pas
 * une saisie libre) -- composant propre à arka-norn, porté depuis la phase
 * JS précédente (déjà testé sur TTY réel, cf. le fix ci-dessous).
 *
 * `enter` retourne `'consumed'`, jamais `'pop'` -- même raison que menu.ts :
 * `onSubmit` gère lui-même push()/pop() pour enchaîner vers l'écran
 * suivant sans course avec le pop automatique de `dispatchKey`.
 *
 * `mapKeypress` (runtime/input.ts) transforme `/` -> filter, `?` -> help,
 * `q` -> quit AVANT que la Scene ne voie l'event -- raccourcis utiles dans
 * un menu, mais qui rendraient ces trois caractères IMPOSSIBLES à taper
 * dans un chemin de fichier (très fréquent pour `/`). Trouvé en testant
 * sur un vrai TTY : un chemin contenant `/` perdait silencieusement
 * chaque slash. On restitue donc ici le caractère brut correspondant,
 * uniquement dans ce contexte de saisie libre.
 */
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";

const CURSOR_GLYPH = String.fromCharCode(0x2588); // █

export interface TextInputOptions {
  readonly title?: string;
  readonly hint?: string;
  readonly initialValue?: string;
  /** Si false, permet la soumission d'une valeur vide (défaut true). */
  readonly required?: boolean;
  readonly onSubmit: (value: string) => void;
  readonly onCancel?: () => void;
}

export interface TextInputScene {
  onKey(event: KeyEvent): "pop" | "consumed" | undefined;
  render(renderer: Renderer, theme: Theme): void;
  readonly value: string;
}

export function createTextInputScene(options: TextInputOptions): TextInputScene {
  let value = options.initialValue ?? "";

  return {
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (event.kind === "escape") {
        options.onCancel?.();
        return "pop";
      }
      if (event.kind === "enter") {
        if (value.trim() === "" && options.required !== false) return "consumed";
        options.onSubmit(value);
        return "consumed";
      }
      if (event.kind === "backspace") {
        value = value.slice(0, -1);
        return "consumed";
      }
      if (event.kind === "char") {
        value += event.value;
        return "consumed";
      }
      if (event.kind === "filter") {
        value += "/";
        return "consumed";
      }
      if (event.kind === "help") {
        value += "?";
        return "consumed";
      }
      if (event.kind === "quit") {
        value += "q";
        return "consumed";
      }
      return "consumed";
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        if (options.title !== undefined) {
          line(`  ${theme.bold(options.title)}`);
          line("");
        }
        if (options.hint !== undefined) {
          line(`  ${theme.dim(options.hint)}`);
          line("");
        }
        line(`  ${theme.arkaAccent(">")} ${value}${theme.dim(CURSOR_GLYPH)}`);
        line("");
        line(`  ${theme.dim("Entrée valider, Échap annuler")}`);
      });
    },
    get value(): string {
      return value;
    },
  };
}
