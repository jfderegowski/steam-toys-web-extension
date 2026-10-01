// Works out what importing achievements would change on Steamworks, and then changes it.

import { fetchSteamIcon, iconBlob, looksSame } from './icons';
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
import { permissionValue, type AchievementItem, type IconFile, type LocalizedInput } from './payload';
import {
  newAchievement,
  saveAchievement,
  uploadAchievementIcon,
  type AchievementIconKind,
  type AchievementInfo,
  type LocalizedText,
  type StatInfo,
} from './steamworks';

export type AchievementPlanEntry =
  | { action: 'create'; item: AchievementItem; icons: AchievementIconKind[] }
  | { action: 'update'; item: AchievementItem; steam: AchievementInfo; changes: FieldChange[]; icons: AchievementIconKind[] }
  | { action: 'same'; item: AchievementItem; steam: AchievementInfo }
  | { action: 'error'; item: AchievementItem; steam?: AchievementInfo; message: string }
  | { action: 'steamOnly'; steam: AchievementInfo };

/**
 * Every achievement of the JSON next to the same achievement on Steamworks, by API Name, then the
 * ones only Steamworks has. Downloads the icons Steamworks has to compare them, so it takes a moment;
 * `onProgress` hears how far it got.
 */
export async function planAchievements(
  items: AchievementItem[],
  steamAchievements: AchievementInfo[],
  steamStats: StatInfo[],
  onProgress: (done: number, total: number) => void,
): Promise<AchievementPlanEntry[]> {
  const byName = new Map(steamAchievements.map((achievement) => [achievement.api_name, achievement]));
  const statTypes = new Map(steamStats.map((stat) => [stat.name, stat.type]));
  const plan: AchievementPlanEntry[] = [];

  for (const [index, item] of items.entries()) {
    onProgress(index, items.length);

    const steam = byName.get(item.apiName);
    byName.delete(item.apiName);

    // Steamworks ties the progress to a stat it has, so the stat has to be there first.
    if (item.progress && !statTypes.has(item.progress.stat)) {
      plan.push({
        action: 'error',
        item,
        steam,
        message: `Its progress stat "${item.progress.stat}" is not on Steamworks. Import the stats on the Stats page first.`,
      });
      continue;
    }

    const icons: AchievementIconKind[] = [];
    if (item.icon && !(await iconMatches(item.icon, steam?.icon))) icons.push('achievement');
    if (item.lockedIcon && !(await iconMatches(item.lockedIcon, steam?.icon_gray))) icons.push('achievement_gray');

    if (!steam) {
      plan.push({ action: 'create', item, icons });
      continue;
    }

    const isFloat = item.progress ? statTypes.get(item.progress.stat) !== 'INT' : false;
    const changes = compareAchievement(item, steam, isFloat);

    for (const kind of icons) {
      const had = kind === 'achievement' ? steam.icon : steam.icon_gray;
      changes.push({ field: kind === 'achievement' ? 'Icon' : 'Locked Icon', from: had ? 'old' : '(none)', to: 'new' });
    }

    plan.push(changes.length ? { action: 'update', item, steam, changes, icons } : { action: 'same', item, steam });
  }

  onProgress(items.length, items.length);

  for (const steam of byName.values()) plan.push({ action: 'steamOnly', steam });

  return plan;
}

async function iconMatches(icon: IconFile, steamUrl: string | undefined): Promise<boolean> {
  const steamIcon = await fetchSteamIcon(steamUrl);
  if (!steamIcon) return false;
  try {
    return await looksSame(iconBlob(icon), steamIcon);
  } catch {
    // An icon that cannot be decoded is sent again rather than skipped.
    return false;
  }
}

function compareAchievement(item: AchievementItem, steam: AchievementInfo, isFloat: boolean): FieldChange[] {
  const list = new ChangeList();

  compareLocalized(list, 'Display Name', steam.display_name, item.displayName);
  compareLocalized(list, 'Description', steam.description, item.description);
  list.text('Set By', permissionLabel(toNumber(steam.permission) ?? 0), permissionLabel(permissionValue[item.permission]));
  list.text('Hidden', String(toFlag(steam.hidden)), String(item.hidden));

  const steamProgress = typeof steam.progress === 'object' ? steam.progress : undefined;
  list.text('Progress Stat', steamProgress?.value?.operand1 ?? '(none)', item.progress?.stat ?? '(none)');

  if (item.progress) {
    list.number('Progress Min', toNumber(steamProgress?.min_val), item.progress.min, isFloat);
    list.number('Progress Max', toNumber(steamProgress?.max_val), item.progress.max, isFloat);
  }

  return list.changes;
}

/** Compares only the languages the JSON has, so translations made on Steamworks are not reported. */
function compareLocalized(list: ChangeList, field: string, steam: LocalizedText | undefined, input: LocalizedInput) {
  const steamTexts = typeof steam === 'string' ? { english: steam } : (steam ?? {});
  const inputTexts = typeof input === 'string' ? { english: input } : input;

  for (const [language, text] of Object.entries(inputTexts)) {
    if (language === 'token') continue;
    list.text(language === 'english' ? field : `${field} (${language})`, steamTexts[language] ?? '', text);
  }
}

/**
 * The texts to save: everything Steamworks has, languages and localization token alike, with the
 * languages of the JSON put over it. The page always sends every language, and Steamworks replaces
 * the whole set, so sending only English would drop the translations.
 */
function mergeLocalized(steam: LocalizedText | undefined, input: LocalizedInput, fallbackToken: string): Record<string, string> {
  const merged: Record<string, string> = typeof steam === 'string' ? { english: steam } : { ...(steam ?? {}) };

  Object.assign(merged, typeof input === 'string' ? { english: input } : input);
  merged.token ||= fallbackToken;

  // The page leaves empty languages out too.
  for (const language of Object.keys(merged)) if (!merged[language]) delete merged[language];

  return merged;
}

export function describeAchievement(entry: AchievementPlanEntry): EntryView {
  switch (entry.action) {
    case 'create': {
      const name = typeof entry.item.displayName === 'string' ? entry.item.displayName : (entry.item.displayName.english ?? '');
      const icons = entry.icons.length ? `${entry.icons.length} icon${entry.icons.length > 1 ? 's' : ''}` : 'no icons';
      return { action: 'create', name: entry.item.apiName, details: [[name, icons].filter(Boolean).join(' · ')] };
    }
    case 'update':
      return { action: 'update', name: entry.item.apiName, details: describeChanges(entry.changes) };
    case 'same':
      return { action: 'same', name: entry.item.apiName, details: [] };
    case 'error':
      return { action: 'error', name: entry.item.apiName, details: [entry.message] };
    case 'steamOnly':
      return { action: 'steamOnly', name: entry.steam.api_name, details: [] };
  }
}

/**
 * Creates, saves and uploads the icons of the achievements the plan marks, one request at a time.
 * Returns how many steps failed: saving an achievement and uploading each icon count apart.
 *
 * `maxIds` is the highest stat and bit in use, which Steamworks needs to pick the slot of a new
 * achievement; `onMaxIds` hears about every new one so the page can keep its copy current.
 */
export async function applyAchievements(
  appId: number,
  plan: AchievementPlanEntry[],
  maxIds: { maxStatId: number; maxBitId: number },
  log: (message: string, kind: LogKind) => void,
  onMaxIds: (maxIds: { maxStatId: number; maxBitId: number }) => void,
): Promise<number> {
  let failed = 0;

  for (const entry of plan) {
    if (entry.action !== 'create' && entry.action !== 'update') continue;

    const { item } = entry;
    let steam: AchievementInfo;

    try {
      if (entry.action === 'create') {
        const created = await newAchievement(appId, maxIds.maxStatId, maxIds.maxBitId);
        if (!toFlag(created?.success) || !created.achievement) throw new Error(created?.error || 'Steamworks did not create the achievement.');

        maxIds = { maxStatId: Number(created.maxstatid), maxBitId: Number(created.maxbitid) };
        onMaxIds(maxIds);
        steam = created.achievement;
        await pause();
      } else {
        steam = entry.steam;
      }
    } catch (e) {
      failed++;
      log(`${item.apiName}: ${(e as Error).message}`, 'error');
      continue;
    }

    const statId = Number(steam.stat_id);
    const bitId = Number(steam.bit_id);
    const slot = `${statId}/${bitId}`;

    try {
      const saved = await saveAchievement(appId, {
        statId,
        bitId,
        apiName: item.apiName,
        displayName: mergeLocalized(steam.display_name, item.displayName, `${item.apiName}_NAME`),
        description: mergeLocalized(steam.description, item.description, `${item.apiName}_DESC`),
        permission: permissionValue[item.permission],
        hidden: item.hidden,
        progressStat: item.progress?.stat,
        progressMin: item.progress?.min ?? undefined,
        progressMax: item.progress?.max ?? undefined,
      });
      if (!toFlag(saved?.success)) throw new Error(saved?.error || 'Steamworks refused the settings.');
      if (!saved.saved) throw new Error('Steamworks did not save the settings.');

      log(`${item.apiName}: ${entry.action === 'create' ? `created in slot ${slot}` : 'updated'}`, 'ok');
    } catch (e) {
      failed++;
      const leftover = entry.action === 'create' ? ` An empty achievement ${slot} was left on Steamworks; delete it or import again.` : '';
      log(`${item.apiName}: ${(e as Error).message}${leftover}`, 'error');
      continue;
    }

    for (const kind of entry.icons) {
      await pause();

      const icon = kind === 'achievement' ? item.icon! : item.lockedIcon!;
      const label = kind === 'achievement' ? 'icon' : 'locked icon';

      try {
        const result = await uploadAchievementIcon(appId, statId, bitId, kind, iconBlob(icon), icon.fileName);
        if (!toFlag(result.success)) throw new Error(result.message || 'Steamworks refused it.');
        log(`${item.apiName}: ${label} uploaded`, 'ok');
      } catch (e) {
        failed++;
        log(`${item.apiName}: ${label} not uploaded: ${(e as Error).message}`, 'error');
      }
    }

    await pause();
  }

  return failed;
}
