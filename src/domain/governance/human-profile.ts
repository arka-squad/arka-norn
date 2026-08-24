/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

export interface HumanProfile {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
}

const PROFILE_ID = /^human_[a-f0-9]{24}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createHumanProfile(value: HumanProfile): HumanProfile {
  if (!PROFILE_ID.test(value.id)) throw new Error("Human profile id is invalid.");
  const name = cleanText(value.name, "name", 120);
  const email = value.email?.trim();
  if (email !== undefined && (email.length > 254 || !EMAIL.test(email))) {
    throw new Error("Human profile email is invalid.");
  }
  return Object.freeze({ id: value.id, name, ...(email === undefined ? {} : { email }) });
}

export function isHumanProfile(value: unknown): value is HumanProfile {
  if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["name"] !== "string") return false;
  if (value["email"] !== undefined && typeof value["email"] !== "string") return false;
  try {
    createHumanProfile(value as unknown as HumanProfile);
    return true;
  } catch {
    return false;
  }
}

function cleanText(value: string, field: string, max: number): string {
  const text = value.trim();
  if (text.length === 0 || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`Human profile ${field} is invalid.`);
  }
  return text;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
