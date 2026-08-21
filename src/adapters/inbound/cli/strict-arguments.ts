/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type CliOptionKind = "boolean" | "string";

export interface StrictArgumentSpec {
  readonly options?: Readonly<Record<string, CliOptionKind>>;
  readonly minPositionals?: number;
  readonly maxPositionals?: number;
  readonly exclusiveGroups?: readonly (readonly string[])[];
  readonly requires?: Readonly<Record<string, readonly string[]>>;
}

export interface StrictArguments {
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
  readonly booleans: ReadonlySet<string>;
}

export class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function parseStrictArguments(argv: readonly string[], spec: StrictArgumentSpec = {}): StrictArguments {
  const definitions = spec.options ?? {};
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  let positionalOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (positionalOnly) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      positionalOnly = true;
      continue;
    }
    if (!token.startsWith("--")) {
      if (token.startsWith("-")) throw new CliUsageError(`unknown option: ${token}`);
      positionals.push(token);
      continue;
    }
    const separator = token.indexOf("=");
    const name = token.slice(2, separator === -1 ? undefined : separator);
    const inlineValue = separator === -1 ? undefined : token.slice(separator + 1);
    const kind = definitions[name];
    if (kind === undefined) throw new CliUsageError(`unknown option: --${name}`);
    if (values.has(name) || booleans.has(name)) throw new CliUsageError(`--${name} may only be provided once`);
    if (kind === "boolean") {
      if (inlineValue !== undefined) throw new CliUsageError(`--${name} does not accept a value`);
      booleans.add(name);
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.length === 0 || (inlineValue === undefined && value.startsWith("--"))) {
      throw new CliUsageError(`--${name} requires a value`);
    }
    values.set(name, value);
    if (inlineValue === undefined) index += 1;
  }
  validatePositionals(positionals, spec);
  validateOptionRelations(values, booleans, spec);
  return { positionals, values, booleans };
}

function validatePositionals(positionals: readonly string[], spec: StrictArgumentSpec): void {
  const minimum = spec.minPositionals ?? 0;
  const maximum = spec.maxPositionals ?? Number.POSITIVE_INFINITY;
  if (positionals.length < minimum || positionals.length > maximum) {
    const expected = minimum === maximum ? String(minimum) : `${minimum}..${maximum === Number.POSITIVE_INFINITY ? "n" : maximum}`;
    throw new CliUsageError(`expected ${expected} positional argument(s), received ${positionals.length}`);
  }
}

function validateOptionRelations(
  values: ReadonlyMap<string, string>,
  booleans: ReadonlySet<string>,
  spec: StrictArgumentSpec,
): void {
  const present = (name: string): boolean => values.has(name) || booleans.has(name);
  for (const group of spec.exclusiveGroups ?? []) {
    const selected = group.filter(present);
    if (selected.length > 1) throw new CliUsageError(`options ${selected.map((name) => `--${name}`).join(" and ")} are mutually exclusive`);
  }
  for (const [name, requirements] of Object.entries(spec.requires ?? {})) {
    if (!present(name)) continue;
    const missing = requirements.filter((requirement) => !present(requirement));
    if (missing.length > 0) throw new CliUsageError(`--${name} requires ${missing.map((requirement) => `--${requirement}`).join(", ")}`);
  }
}
