export function isSafeRememberedRoute(value: string | undefined): value is string {
  return value !== undefined && /^\/projects(?:\/[a-z0-9][a-z0-9._-]{0,127})?(?:\/.*)?$/u.test(value);
}
