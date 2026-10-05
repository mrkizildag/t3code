import type { ContextMenuItem } from "@t3tools/contracts";

export type ContextMenuState =
  | { readonly status: "idle" }
  | {
      readonly status: "open";
      readonly requestId: number;
      readonly items: readonly ContextMenuItem[];
      readonly position: { readonly x: number; readonly y: number } | undefined;
      readonly returnFocus: HTMLElement | null;
    }
  | {
      readonly status: "closing";
      readonly requestId: number;
      readonly items: readonly ContextMenuItem[];
      readonly position: { readonly x: number; readonly y: number } | undefined;
      readonly returnFocus: HTMLElement | null;
    };

type PendingContextMenu = {
  readonly resolve: (id: string | null) => void;
};

const idleState: ContextMenuState = { status: "idle" };
let state: ContextMenuState = idleState;
let activeMenu: PendingContextMenu | null = null;
let registeredHostCount = 0;
let nextRequestId = 1;
const listeners = new Set<() => void>();

function publish(next: ContextMenuState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function readContextMenuState(): ContextMenuState {
  return state;
}

export function subscribeContextMenu(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Registers the renderer host that can present the themed context menu. The
 * returned cleanup function also resolves any request left without a host.
 */
export function registerContextMenuHost(): () => void {
  registeredHostCount += 1;
  let registered = true;

  return () => {
    if (!registered) return;
    registered = false;
    registeredHostCount = Math.max(0, registeredHostCount - 1);

    if (registeredHostCount === 0) {
      activeMenu?.resolve(null);
      activeMenu = null;
      publish(idleState);
    }
  };
}

/**
 * Requests a themed context menu when a host is mounted. An undefined result
 * means no host is currently available. A request made while another is open
 * resolves the earlier one with null before opening the new menu.
 */
export function requestContextMenu<T extends string>(
  items: readonly ContextMenuItem<T>[],
  position?: { readonly x: number; readonly y: number },
): Promise<T | null> | undefined {
  if (registeredHostCount === 0) return undefined;

  activeMenu?.resolve(null);
  // Guarded for the "unit" vitest project, which runs this module in a plain
  // Node environment with no `document` global.
  const returnFocus =
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  return new Promise<T | null>((resolve) => {
    // Erased at the store boundary: callers only ever see the `T` they
    // passed in, since `id` always comes from one of their own `items`.
    activeMenu = { resolve: resolve as (id: string | null) => void };
    publish({
      status: "open",
      requestId: nextRequestId++,
      items: assignMenuShortcuts(items),
      position,
      returnFocus,
    });
  });
}

/** Resolves the open menu's request with the selected item id, or null when dismissed. */
export function respondToContextMenu(id: string | null): void {
  if (state.status !== "open" || !activeMenu) return;

  const pending = activeMenu;
  activeMenu = null;
  pending.resolve(id);
  publish({
    status: "closing",
    requestId: state.requestId,
    items: state.items,
    position: state.position,
    returnFocus: state.returnFocus,
  });
}

/** Closes the open menu, resolving its request with null. No-op when nothing is open. */
export function dismissContextMenu(): void {
  respondToContextMenu(null);
}

export function completeContextMenuClose(): void {
  if (state.status !== "closing") return;
  publish(idleState);
}

export function isContextMenuOpen(): boolean {
  return state.status !== "idle";
}

export function resetContextMenuForTests(): void {
  activeMenu?.resolve(null);
  activeMenu = null;
  registeredHostCount = 0;
  publish(idleState);
  listeners.clear();
}

const LETTER_PATTERN = /[a-zA-Z]/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function pickAutoLetter(label: string, usedLetters: ReadonlySet<string>): string | undefined {
  let atWordStart = true;
  for (const char of label) {
    if (!LETTER_PATTERN.test(char)) {
      atWordStart = true;
      continue;
    }
    if (atWordStart && !usedLetters.has(char.toUpperCase())) return char.toUpperCase();
    atWordStart = false;
  }
  for (const char of label) {
    if (LETTER_PATTERN.test(char) && !usedLetters.has(char.toUpperCase())) {
      return char.toUpperCase();
    }
  }
  return [...ALPHABET].find((letter) => !usedLetters.has(letter));
}

function canTakeShortcut(item: ContextMenuItem): boolean {
  return !item.disabled && !item.header;
}

/**
 * Fills in `shortcut` for every enabled, non-header item. Letters are unique
 * within one menu level, since a letter only acts on the level that has focus.
 * Explicit shortcuts win; the rest get the first unused letter at a word start
 * of their label, then anywhere in it, then any unused letter.
 */
export function assignMenuShortcuts<T extends string>(
  items: readonly ContextMenuItem<T>[],
): ContextMenuItem<T>[] {
  const usedLetters = new Set<string>();
  const explicitLetters = new Map<ContextMenuItem<T>, string>();
  for (const item of items) {
    const letter = item.shortcut?.trim().charAt(0).toUpperCase();
    if (!letter || !canTakeShortcut(item)) continue;
    if (usedLetters.has(letter)) {
      console.error(`Context menu: duplicate shortcut letter "${letter}" on item "${item.id}"`);
      continue;
    }
    usedLetters.add(letter);
    explicitLetters.set(item, letter);
  }

  return items.map((item) => {
    const { shortcut: explicitShortcut, children, ...rest } = item;
    let shortcut: string | undefined;
    if (canTakeShortcut(item)) {
      // A losing duplicate explicit letter gets none rather than one its author didn't pick.
      shortcut = explicitShortcut
        ? explicitLetters.get(item)
        : pickAutoLetter(item.label, usedLetters);
      if (shortcut) usedLetters.add(shortcut);
    }
    return {
      ...rest,
      ...(shortcut ? { shortcut } : {}),
      ...(children ? { children: assignMenuShortcuts(children) } : {}),
    } as ContextMenuItem<T>;
  });
}
