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

import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";

import type { DocumentValidationResult, DocumentValidator } from "../../../ports/outbound/document-validator.js";

export class AjvDocumentValidator implements DocumentValidator {
  private readonly ajv: Ajv2020;
  private readonly cache = new Map<string, ValidateFunction>();
  private readonly frameworkRoot: string;
  private envelopesLoaded = false;

  public constructor(frameworkRoot: string) {
    this.frameworkRoot = frameworkRoot;
    this.ajv = new Ajv2020({ allErrors: true, strict: true });
    this.ajv.addFormat("date", { type: "string", validate: isDate });
    this.ajv.addFormat("date-time", { type: "string", validate: isDateTime });
  }

  public async validate(schemaPath: string, content: Readonly<Record<string, unknown>>): Promise<DocumentValidationResult> {
    const validate = await this.validator(schemaPath);
    const valid = validate(content);
    return {
      valid,
      errors: valid ? [] : (validate.errors ?? []).map((error) => `${error.instancePath || "(root)"} ${error.message ?? "invalid"}`),
    };
  }

  private async validator(schemaPath: string): Promise<ValidateFunction> {
    const cached = this.cache.get(schemaPath);
    if (cached !== undefined) return cached;
    await this.loadEnvelopes();
    const raw = await fs.readFile(resolve(this.frameworkRoot, schemaPath), "utf8");
    const schema = JSON.parse(raw) as AnySchema;
    const validate = this.ajv.compile(schema);
    this.cache.set(schemaPath, validate);
    return validate;
  }

  private async loadEnvelopes(): Promise<void> {
    if (this.envelopesLoaded) return;
    const schemas = await Promise.all([
      fs.readFile(resolve(this.frameworkRoot, "schemas", "document-envelope.schema.json"), "utf8"),
      fs.readFile(resolve(this.frameworkRoot, "schemas", "project-audit-envelope.schema.json"), "utf8"),
    ]);
    for (const raw of schemas) this.ajv.addSchema(JSON.parse(raw) as AnySchema);
    this.envelopesLoaded = true;
  }
}

function isDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}
