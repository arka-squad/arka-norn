export interface PathPolicy {
  canonicalDirectory(candidate: string, options?: { readonly allowMissing?: boolean }): Promise<string>;
  assertContained(parent: string, child: string): Promise<{ readonly parent: string; readonly child: string }>;
  assertMarkerRoot(declaredRoot: string, actualRoot: string): Promise<string>;
  assertWritableFile(filePath: string, allowedRoot: string): Promise<string>;
}
