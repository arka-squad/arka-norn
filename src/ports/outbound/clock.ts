/**
 * Clock — testable time source. Port fidèle de arka-cc-management
 * (core/ports/outbound/clock.ts). `Date.now()` est interdit hors adapter.
 */
export interface Clock {
  /** Retourne l'instant courant. Toujours une `Date` fraîche. */
  now(): Date;
}
