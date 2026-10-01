// What the stats and achievements imports share: how a plan entry is described, and how values that
// Steamworks sends as strings are compared with the JSON.

import { Permission } from './steamworks';

export type Action = 'create' | 'update' | 'same' | 'error' | 'steamOnly';

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export type LogKind = 'info' | 'ok' | 'error';

/** One row of the preview. */
export interface EntryView {
  action: Action;
  name: string;
  details: string[];
}

export const describeChanges = (changes: FieldChange[]) =>
  changes.map((change) => `${change.field}: ${change.from} → ${change.to}`);

/** Collects the fields that differ, formatted for the preview. */
export class ChangeList {
  readonly changes: FieldChange[] = [];

  text(field: string, from: string, to: string) {
    if (from !== to) this.changes.push({ field, from: from || '(empty)', to: to || '(empty)' });
  }

  number(field: string, from: number | null, to: number | null, isFloat: boolean) {
    if (!sameNumber(from, to, isFloat)) this.changes.push({ field, from: formatNumber(from), to: formatNumber(to) });
  }
}

/** Float stats are kept at float precision, so 0.1 on one side matches 0.1 on the other. */
export function sameNumber(a: number | null, b: number | null, isFloat: boolean): boolean {
  if (a === null || b === null) return a === b;
  return isFloat ? Math.fround(a) === Math.fround(b) : a === b;
}

/** Steamworks sends numbers as strings, and leaves unset ones out or empty. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Steamworks sends flags as 0/1, "0"/"1" or booleans. */
export function toFlag(value: unknown): boolean {
  return value === true || (value !== false && value !== null && value !== undefined && Number(value) !== 0);
}

export function formatNumber(value: number | null): string {
  return value === null ? '(not set)' : String(value);
}

export function permissionLabel(value: number): string {
  switch (value) {
    case Permission.GameServer:
      return 'Game Server';
    case Permission.OfficialGameServer:
      return 'Official Game Server';
    default:
      return 'Client';
  }
}

/** The pause between requests, so an import runs at the pace of someone clicking through the page. */
export function pause() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}
