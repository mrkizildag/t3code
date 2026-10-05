import type { ContextMenuItem } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  assignMenuShortcuts,
  dismissContextMenu,
  registerContextMenuHost,
  requestContextMenu,
  resetContextMenuForTests,
  respondToContextMenu,
} from "./contextMenu";

function shortcutFor(items: readonly ContextMenuItem[], id: string): string | undefined {
  return items.find((item) => item.id === id)?.shortcut;
}

afterEach(() => {
  resetContextMenuForTests();
});

describe("assignMenuShortcuts", () => {
  it("keeps an explicit shortcut instead of auto-assigning one", () => {
    const [result] = assignMenuShortcuts([{ id: "rename", label: "Rename thread", shortcut: "R" }]);
    expect(result?.shortcut).toBe("R");
  });

  it("assigns each item the first unused letter at one of its word starts", () => {
    const items = assignMenuShortcuts([
      { id: "settle", label: "Settle thread" },
      { id: "unsettle", label: "Un-settle thread" },
      { id: "show-all", label: "Show all projects" },
    ]);
    expect(shortcutFor(items, "settle")).toBe("S");
    // "S" is taken by "Settle thread", so "Un-settle thread" takes its other
    // word-start letter, "U" ("Un-", "settle", "thread").
    expect(shortcutFor(items, "unsettle")).toBe("U");
    // "S" is also taken here, so "Show all projects" falls through to its
    // next word-start letter, "A" ("Show", "all", "projects").
    expect(shortcutFor(items, "show-all")).toBe("A");
  });

  it("falls back to any unused letter in the label once its only word start is taken", () => {
    const items = assignMenuShortcuts([
      { id: "settle", label: "Settle" },
      { id: "show", label: "Show" },
    ]);
    expect(shortcutFor(items, "settle")).toBe("S");
    // "Show" has one word start, "S", already taken by "Settle"; it falls
    // back to the next unused letter found scanning its own label, "H".
    expect(shortcutFor(items, "show")).toBe("H");
  });

  it("assigns letters per menu level, so a submenu can reuse its parent's letters", () => {
    const items = assignMenuShortcuts([
      { id: "pin", label: "Pin thread", shortcut: "P" },
      { id: "copy", label: "Copy", children: [{ id: "copy-path", label: "Path" }] },
    ]);
    const copy = items.find((item) => item.id === "copy");
    expect(shortcutFor(copy?.children ?? [], "copy-path")).toBe("P");
  });

  it("falls back to any unused letter once every letter in the label is taken", () => {
    const items = assignMenuShortcuts([
      { id: "a", label: "A" },
      { id: "b", label: "AB" },
      { id: "c", label: "BA" },
    ]);
    expect(shortcutFor(items, "a")).toBe("A");
    expect(shortcutFor(items, "b")).toBe("B");
    expect(shortcutFor(items, "c")).toBe("C");
  });

  it("never assigns a shortcut to a disabled or header item", () => {
    const items = assignMenuShortcuts([
      { id: "header", label: "Section", header: true },
      { id: "disabled", label: "Disabled action", disabled: true },
    ]);
    expect(shortcutFor(items, "header")).toBeUndefined();
    expect(shortcutFor(items, "disabled")).toBeUndefined();
  });

  it("logs and drops the shortcut for a duplicate explicit letter", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const items = assignMenuShortcuts([
      { id: "first", label: "First", shortcut: "F" },
      { id: "second", label: "Follow-up", shortcut: "F" },
    ]);
    expect(shortcutFor(items, "first")).toBe("F");
    expect(shortcutFor(items, "second")).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});

describe("requestContextMenu", () => {
  it("returns undefined when no host is mounted", () => {
    expect(requestContextMenu([{ id: "rename", label: "Rename" }])).toBeUndefined();
  });

  it("resolves with the selected item id", async () => {
    const unregister = registerContextMenuHost();
    const request = requestContextMenu([{ id: "rename", label: "Rename" }]);
    expect(request).toBeDefined();

    respondToContextMenu("rename");
    await expect(request).resolves.toBe("rename");
    unregister();
  });

  it("resolves with null when dismissed", async () => {
    const unregister = registerContextMenuHost();
    const request = requestContextMenu([{ id: "rename", label: "Rename" }]);

    dismissContextMenu();
    await expect(request).resolves.toBeNull();
    unregister();
  });

  it("resolves an earlier request with null when a second request opens over it", async () => {
    const unregister = registerContextMenuHost();
    const first = requestContextMenu([{ id: "a", label: "A" }]);
    const second = requestContextMenu([{ id: "b", label: "B" }]);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    await expect(first).resolves.toBeNull();

    respondToContextMenu("b");
    await expect(second).resolves.toBe("b");
    unregister();
  });

  it("resolves the open request with null when the host unmounts", async () => {
    const unregister = registerContextMenuHost();
    const request = requestContextMenu([{ id: "rename", label: "Rename" }]);

    unregister();
    await expect(request).resolves.toBeNull();
  });
});
