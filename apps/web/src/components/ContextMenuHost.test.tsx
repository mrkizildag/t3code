// @vitest-environment jsdom

import type { ContextMenuItem } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { requestContextMenu, resetContextMenuForTests } from "../contextMenu";
import { ContextMenuHost } from "./ContextMenuHost";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  act(() => {
    resetContextMenuForTests();
  });
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mountHost(): Promise<void> {
  await act(async () => {
    root.render(<ContextMenuHost />);
  });
}

function pressKey(key: string, target: Element | null = document.activeElement): KeyboardEvent {
  if (!target) throw new Error("No element to dispatch the keydown on");
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("ContextMenuHost key handling", () => {
  it("resolves with the id of an item whose explicit letter is pressed", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [
      { id: "rename", label: "Rename", shortcut: "R" },
      { id: "archive", label: "Archive" },
    ];
    let request: ReturnType<typeof requestContextMenu>;
    act(() => {
      request = requestContextMenu(items, { x: 10, y: 10 });
    });
    expect(request).toBeDefined();

    await act(async () => {
      pressKey("r");
    });

    await expect(request).resolves.toBe("rename");
  });

  it("resolves with the id of an item whose auto-assigned letter is pressed", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [{ id: "archive", label: "Archive" }];
    let request: ReturnType<typeof requestContextMenu>;
    act(() => {
      request = requestContextMenu(items, { x: 10, y: 10 });
    });

    await act(async () => {
      pressKey("a");
    });

    await expect(request).resolves.toBe("archive");
  });

  it("leaves the menu open, with the keydown defaultPrevented, when no item uses the letter", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [{ id: "rename", label: "Rename", shortcut: "R" }];
    let request: ReturnType<typeof requestContextMenu>;
    act(() => {
      request = requestContextMenu(items, { x: 10, y: 10 });
    });

    let event: KeyboardEvent | undefined;
    await act(async () => {
      event = pressKey("z");
    });

    expect(event?.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    let resolved = false;
    void request?.then(() => {
      resolved = true;
    });
    await act(async () => {});
    expect(resolved).toBe(false);
  });

  it("does nothing when a disabled item's letter is pressed", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [{ id: "archive", label: "Archive", disabled: true }];
    let request: ReturnType<typeof requestContextMenu>;
    act(() => {
      request = requestContextMenu(items, { x: 10, y: 10 });
    });

    await act(async () => {
      pressKey("a");
    });

    let resolved = false;
    void request?.then(() => {
      resolved = true;
    });
    await act(async () => {});
    expect(resolved).toBe(false);
  });

  // jsdom doesn't run base-ui's keyboard focus hand-off into a submenu, so the
  // child-letter step is verified in a real browser; here only the parent's claim.
  it("claims the keydown for a letter whose item has a submenu", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [
      {
        id: "snooze",
        label: "Snooze",
        shortcut: "Z",
        children: [{ id: "snooze:custom", label: "Custom", shortcut: "U" }],
      },
      { id: "commit", label: "Commit", shortcut: "C" },
    ];
    act(() => {
      requestContextMenu(items, { x: 10, y: 10 });
    });

    let event: KeyboardEvent | undefined;
    await act(async () => {
      event = pressKey("z");
    });

    expect(event?.defaultPrevented).toBe(true);
  });

  it("resolves null on Escape", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [{ id: "rename", label: "Rename", shortcut: "R" }];
    let request: ReturnType<typeof requestContextMenu>;
    act(() => {
      request = requestContextMenu(items, { x: 10, y: 10 });
    });

    await act(async () => {
      pressKey("Escape");
    });

    await expect(request).resolves.toBeNull();
  });

  it("returns focus to the element focused before the menu opened", async () => {
    await mountHost();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const items: ContextMenuItem[] = [{ id: "rename", label: "Rename", shortcut: "R" }];
    let request: ReturnType<typeof requestContextMenu>;
    act(() => {
      request = requestContextMenu(items, { x: 10, y: 10 });
    });

    await act(async () => {
      pressKey("Escape");
    });
    await expect(request).resolves.toBeNull();

    // base-ui restores focus once its close transition completes, which in
    // jsdom (no CSS animations/transitions) should resolve on this tick.
    await act(async () => {});

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("shows and responds to a checked item's letter", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [
      { id: "pin", label: "Pin", shortcut: "P", checked: true },
      { id: "unpin", label: "Unpin", shortcut: "U", checked: false },
    ];
    let request: ReturnType<typeof requestContextMenu>;
    act(() => {
      request = requestContextMenu(items, { x: 10, y: 10 });
    });

    const checkboxItems = document.querySelectorAll('[data-slot="menu-checkbox-item"]');
    expect(checkboxItems).toHaveLength(2);
    expect(checkboxItems[0]?.getAttribute("data-checked")).not.toBeNull();
    expect(checkboxItems[1]?.getAttribute("data-checked")).toBeNull();

    await act(async () => {
      pressKey("u");
    });

    await expect(request).resolves.toBe("unpin");
  });
});

describe("ContextMenuHost submenus and key isolation", () => {
  it("opens an item's submenu when its letter is pressed, keeping the root open", async () => {
    await mountHost();
    const items: ContextMenuItem[] = [
      { id: "rename", label: "Rename", shortcut: "R" },
      {
        id: "snooze",
        label: "Snooze",
        shortcut: "Z",
        children: [{ id: "snooze:custom", label: "Custom…" }],
      },
    ];
    act(() => {
      requestContextMenu(items, { x: 10, y: 10 });
    });
    await act(async () => {});

    await act(async () => {
      pressKey("z");
    });
    await act(async () => {});

    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2);
  });

  it("keeps menu letters from reaching document-level key listeners", async () => {
    await mountHost();
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    document.addEventListener("keydown", listener);
    act(() => {
      requestContextMenu([{ id: "rename", label: "Rename", shortcut: "R" }], { x: 10, y: 10 });
    });
    await act(async () => {});

    await act(async () => {
      pressKey("q");
    });

    document.removeEventListener("keydown", listener);
    expect(seen).toEqual([]);
  });
});
