import type { Action, EntryView, LogKind } from '@/utils/importPlan';

export interface ImportPanelOptions<Entry> {
  title: string;
  /** What is imported, in the plural: "stats" or "achievements". */
  noun: string;
  appId: number;
  /** Parses the pasted JSON and compares it with Steamworks; `status` shows what it is doing. */
  plan(text: string, status: (text: string) => void): Promise<Entry[]>;
  describe(entry: Entry): EntryView;
  /**
   * Sends the plan to Steamworks and returns how many steps failed. With `deleteMissing`, what only
   * Steamworks has is deleted too.
   */
  apply(plan: Entry[], deleteMissing: boolean, log: (message: string, kind: LogKind) => void): Promise<number>;
}

const BADGES: Record<Action, string> = {
  create: 'new',
  update: 'changed',
  same: 'same',
  error: 'skipped',
  steamOnly: 'Steam only',
};

/** The import panel of a Steamworks page: paste, preview what changes, apply. */
export function mountImportPanel<Entry>(container: HTMLElement, options: ImportPanelOptions<Entry>) {
  const panel = element('div', 'panel');
  const header = element('div', 'header');
  const toggle = element('button', 'toggle', '–');
  const body = element('div', 'body');
  const input = element('textarea');
  const actions = element('div', 'actions');
  const previewButton = element('button', '', 'Preview');
  const applyButton = element('button', 'primary', 'Apply');
  const deleteOption = element('label', 'option');
  const deleteCheckbox = element('input');
  const summary = element('div', 'summary');
  const list = element('div', 'list');
  const log = element('ul', 'log');

  input.placeholder = 'Paste the JSON from "Copy JSON For Steamworks" or "Copy All As JSON" in Unity.';
  applyButton.disabled = true;
  deleteCheckbox.type = 'checkbox';
  deleteOption.append(deleteCheckbox, ` Delete the ${options.noun} not in the JSON`);

  header.append(element('strong', '', options.title), toggle);
  actions.append(previewButton, applyButton, deleteOption);
  body.append(input, actions, summary, list, log);
  panel.append(header, body);
  container.append(panel);

  let plan: Entry[] = [];
  let views: EntryView[] = [];

  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '+' : '–';
  });

  // Pasting again makes the preview stale.
  input.addEventListener('input', () => {
    plan = [];
    views = [];
    applyButton.disabled = true;
    list.replaceChildren();
    setSummary('');
  });

  deleteCheckbox.addEventListener('change', () => {
    if (views.length) render();
  });

  previewButton.addEventListener('click', () => void preview());
  applyButton.addEventListener('click', () => void apply());

  async function preview() {
    setBusy(true);
    list.replaceChildren();
    try {
      plan = await options.plan(input.value, (text) => setSummary(text));
      views = plan.map(options.describe);
      render();
    } catch (e) {
      plan = [];
      views = [];
      setSummary((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const deleteMissing = deleteCheckbox.checked;
    const deletes = deleteMissing ? count('steamOnly') : 0;
    const question =
      `Create ${count('create')}, update ${count('update')}` +
      (deletes ? ` and DELETE ${deletes}` : '') +
      ` ${options.noun} on Steamworks for app ${options.appId}?` +
      (deletes ? `

Deleting cannot be undone.` : '');
    if (!confirm(question)) return;

    setBusy(true);
    log.replaceChildren();
    try {
      const failed = await options.apply(plan, deleteMissing, addLog);
      addLog(
        `${failed ? `Done with ${failed} failed.` : 'Done.'} Reload the page to see the ${options.noun}, then publish them on the Publish tab.`,
        failed ? 'error' : 'ok',
      );
    } catch (e) {
      addLog((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }

    // What Steamworks has now, which should be all unchanged.
    await preview();
  }

  function render() {
    const of = (action: Action) => views.filter((view) => view.action === action);
    const errors = of('error');
    const creates = of('create');
    const updates = of('update');
    const same = of('same');
    const steamOnly = of('steamOnly');
    const deletes = deleteCheckbox.checked ? steamOnly : [];

    setSummary(
      `${creates.length} new · ${updates.length} changed · ${same.length} unchanged` +
        (errors.length ? ` · ${errors.length} skipped` : '') +
        (deletes.length ? ` · ${deletes.length} to delete` : steamOnly.length ? ` · ${steamOnly.length} only on Steamworks` : ''),
      errors.length ? 'error' : undefined,
    );

    list.replaceChildren();
    for (const view of [...errors, ...creates, ...updates]) list.append(renderEntry(view));
    for (const view of deletes) list.append(renderEntry(view, 'delete'));

    if (same.length) list.append(group(`${same.length} unchanged`, same));
    if (steamOnly.length && !deletes.length)
      list.append(group(`${steamOnly.length} only on Steamworks (left as they are)`, steamOnly));

    const changes = creates.length + updates.length + deletes.length;
    applyButton.disabled = changes === 0;
    applyButton.textContent = changes ? `Apply ${changes}` : 'Apply';
  }

  /** `delete` marks a Steamworks-only entry that the import will delete. */
  function renderEntry(view: EntryView, as?: 'delete') {
    const row = element('div', `entry ${as ?? view.action}`);
    row.append(element('span', 'badge', as === 'delete' ? 'delete' : BADGES[view.action]), element('span', 'name', view.name));
    for (const detail of view.details) if (detail) row.append(element('div', 'detail', detail));
    return row;
  }

  function group(label: string, entries: EntryView[]) {
    const details = element('details');
    details.append(element('summary', '', label), ...entries.map((view) => renderEntry(view)));
    return details;
  }

  function count(action: Action) {
    return views.filter((view) => view.action === action).length;
  }

  function changeCount() {
    return count('create') + count('update') + (deleteCheckbox.checked ? count('steamOnly') : 0);
  }

  function setBusy(busy: boolean) {
    previewButton.disabled = busy;
    applyButton.disabled = busy || changeCount() === 0;
    deleteCheckbox.disabled = busy;
    input.disabled = busy;
  }

  function setSummary(text: string, kind?: 'error') {
    summary.textContent = text;
    summary.classList.toggle('error', kind === 'error');
  }

  function addLog(message: string, kind: LogKind) {
    log.append(element('li', kind, message));
    log.scrollTop = log.scrollHeight;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
