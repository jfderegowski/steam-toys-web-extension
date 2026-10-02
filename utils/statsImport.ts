// Works out what importing stats would change on Steamworks, and then changes it.

import {
  ChangeList,
  describeChanges,
  pause,
  permissionLabel,
  toFlag,
  toNumber,
  type EntryView,
  type FieldChange,
  type LogKind,
} from './importPlan';
import { permissionValue, type StatItem } from './payload';
import { deleteStat, newStat, saveStat, type StatInfo } from './steamworks';

export type StatPlanEntry =
  | { action: 'create'; item: StatItem }
  | { action: 'update'; item: StatItem; steam: StatInfo; changes: FieldChange[] }
  | { action: 'same'; item: StatItem; steam: StatInfo }
  | { action: 'error'; item: StatItem; steam?: StatInfo; message: string }
  | { action: 'steamOnly'; steam: StatInfo };

/** Every stat of the JSON next to the same stat on Steamworks, by API Name, then the stats only Steamworks has. */
export function planStats(items: StatItem[], steamStats: StatInfo[]): StatPlanEntry[] {
  const byName = new Map(steamStats.map((stat) => [stat.name, stat]));
  const plan: StatPlanEntry[] = [];

  for (const item of items) {
    const steam = byName.get(item.apiName);
    byName.delete(item.apiName);

    if (!steam) {
      plan.push({ action: 'create', item });
      continue;
    }

    // Changing the type of a stat players already have is not something to do in bulk.
    if (steam.type !== item.type) {
      plan.push({
        action: 'error',
        item,
        steam,
        message: `Steamworks has it as ${steam.type}, the JSON as ${item.type}. Change the type by hand if you mean it.`,
      });
      continue;
    }

    const changes = compareStat(item, steam);
    plan.push(changes.length ? { action: 'update', item, steam, changes } : { action: 'same', item, steam });
  }

  for (const steam of byName.values()) plan.push({ action: 'steamOnly', steam });

  return plan;
}

function compareStat(item: StatItem, steam: StatInfo): FieldChange[] {
  const isFloat = item.type !== 'INT';
  const list = new ChangeList();

  list.text('Display Name', steam.display?.name ?? '', item.displayName);
  list.text('Set By', permissionLabel(toNumber(steam.permission) ?? 0), permissionLabel(permissionValue[item.permission]));
  list.number('Default', toNumber(steam.default), item.default, isFloat);
  list.number('Min', toNumber(steam.min), item.min, isFloat);
  list.number('Max', toNumber(steam.max), item.max, isFloat);

  if (item.type === 'AVGRATE') {
    list.number('Window', toNumber(steam.windowsize), item.windowSize, true);
  } else {
    list.text('Increment Only', String(toFlag(steam.incrementonly)), String(item.incrementOnly));
    list.number('Max Change', toNumber(steam.maxchange), item.maxChange, isFloat);
    list.text('Aggregated', String(toFlag(steam.aggregated)), String(item.aggregated));
  }

  return list.changes;
}

export function describeStat(entry: StatPlanEntry): EntryView {
  switch (entry.action) {
    case 'create':
      return { action: 'create', name: entry.item.apiName, details: [[entry.item.type, entry.item.displayName].filter(Boolean).join(' · ')] };
    case 'update':
      return { action: 'update', name: entry.item.apiName, details: describeChanges(entry.changes) };
    case 'same':
      return { action: 'same', name: entry.item.apiName, details: [] };
    case 'error':
      return { action: 'error', name: entry.item.apiName, details: [entry.message] };
    case 'steamOnly':
      return { action: 'steamOnly', name: entry.steam.name, details: [] };
  }
}

/**
 * Creates and saves the stats the plan marks, one request at a time, then deletes the stats only
 * Steamworks has when `deleteMissing` is set. Returns how many failed.
 *
 * `maxStatId` is the highest stat ID in use, achievements included, which Steamworks needs to pick
 * the next one; `onMaxStatId` hears about every new one so the page can keep its copy current.
 */
export async function applyStats(
  appId: number,
  plan: StatPlanEntry[],
  deleteMissing: boolean,
  maxStatId: number,
  log: (message: string, kind: LogKind) => void,
  onMaxStatId: (maxStatId: number) => void,
): Promise<number> {
  let failed = 0;

  for (const entry of plan) {
    if (entry.action !== 'create' && entry.action !== 'update') continue;

    const { item } = entry;
    let statId: number;

    try {
      if (entry.action === 'create') {
        const created = await newStat(appId, maxStatId);
        if (!created?.stat) throw new Error('Steamworks did not create the stat.');

        maxStatId = Number(created.maxstatid);
        onMaxStatId(maxStatId);
        statId = Number(created.stat.stat_id);
      } else {
        statId = Number(entry.steam.stat_id);
      }
    } catch (e) {
      failed++;
      log(`${item.apiName}: ${(e as Error).message}`, 'error');
      continue;
    }

    try {
      const saved = await saveStat(appId, {
        statId,
        type: item.type,
        apiName: item.apiName,
        displayName: item.displayName,
        permission: permissionValue[item.permission],
        incrementOnly: item.incrementOnly,
        aggregated: item.aggregated,
        min: item.min ?? undefined,
        max: item.max ?? undefined,
        maxChange: item.maxChange ?? undefined,
        default: item.default ?? undefined,
        windowSize: item.windowSize ?? undefined,
      });
      if (!saved?.saved) throw new Error('Steamworks did not save the settings.');

      log(`${item.apiName}: ${entry.action === 'create' ? `created as stat ${statId}` : 'updated'}`, 'ok');
    } catch (e) {
      failed++;
      const leftover = entry.action === 'create' ? ` An empty stat ${statId} was left on Steamworks; delete it or import again.` : '';
      log(`${item.apiName}: ${(e as Error).message}${leftover}`, 'error');
    }

    await pause();
  }

  if (deleteMissing) {
    for (const entry of plan) {
      if (entry.action !== 'steamOnly') continue;

      const { steam } = entry;
      try {
        const result = await deleteStat(appId, Number(steam.stat_id));
        if (!result?.deleted) throw new Error('Steamworks did not delete it.');
        log(`${steam.name}: deleted`, 'ok');
      } catch (e) {
        failed++;
        log(`${steam.name}: ${(e as Error).message}`, 'error');
      }

      await pause();
    }
  }

  return failed;
}
