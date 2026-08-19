export interface DocumentValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface DocumentValidator {
  validate(schemaPath: string, content: Readonly<Record<string, unknown>>): Promise<DocumentValidationResult>;
}
