/**
 * SystemClock — implémentation production du port Clock. Port fidèle de
 * arka-cc-management (adapters/outbound/system/system-clock.ts).
 */
import type { Clock } from "../../../ports/outbound/clock.js";

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}
