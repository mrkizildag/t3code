// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { showMock, readLocalApiMock, resolveLayoutMock } = vi.hoisted(() => {
  const showMock = vi.fn<(items: unknown, position?: unknown) => Promise<string | null>>();
  const readLocalApiMock = vi.fn();
  const resolveLayoutMock =
    vi.fn<(webContentsId: number) => { left: number; top: number; scale: number } | null>();
  return { showMock, readLocalApiMock, resolveLayoutMock };
});

vi.mock("./localApi", () => ({
  readLocalApi: () => readLocalApiMock(),
}));

vi.mock("./browser/browserWebviewRegistry", () => ({
  resolveBrowserWebviewScreenLayout: (webContentsId: number) => resolveLayoutMock(webContentsId),
}));

import {
  handleNativeContextMenuRequest,
  installNativeContextMenuForwarding,
  resolveNativeContextMenuPosition,
} from "./nativeContextMenu";

describe("resolveNativeContextMenuPosition", () => {
  it("passes an app-source request's coordinates through unchanged", () => {
    expect(
      resolveNativeContextMenuPosition({
        requestId: 1,
        source: { kind: "app" },
        x: 12,
        y: 34,
        items: [],
      }),
    ).toEqual({ x: 12, y: 34 });
  });

  it("maps a browser-source request through the guest webview's screen layout", () => {
    resolveLayoutMock.mockReturnValue({ left: 100, top: 40, scale: 0.5 });

    expect(
      resolveNativeContextMenuPosition({
        requestId: 2,
        source: { kind: "browser", webContentsId: 7 },
        x: 20,
        y: 10,
        items: [],
      }),
    ).toEqual({ x: 110, y: 45 });
    expect(resolveLayoutMock).toHaveBeenCalledWith(7);
  });

  it("returns null for a browser source with no registered webview", () => {
    resolveLayoutMock.mockReturnValue(null);

    expect(
      resolveNativeContextMenuPosition({
        requestId: 3,
        source: { kind: "browser", webContentsId: 9 },
        x: 0,
        y: 0,
        items: [],
      }),
    ).toBeNull();
  });
});

describe("handleNativeContextMenuRequest", () => {
  beforeEach(() => {
    showMock.mockReset();
    readLocalApiMock.mockReset();
    resolveLayoutMock.mockReset();
    readLocalApiMock.mockReturnValue({ contextMenu: { show: showMock } });
  });

  it("shows the mapped items and reports the chosen action back to main", async () => {
    showMock.mockResolvedValue("copy");
    const runNativeContextMenuAction =
      vi.fn<(input: { requestId: number; actionId: string | null }) => Promise<void>>();

    await handleNativeContextMenuRequest(
      { runNativeContextMenuAction },
      {
        requestId: 1,
        source: { kind: "app" },
        x: 12,
        y: 34,
        items: [{ id: "copy", label: "Copy", disabled: true, separatorBefore: true }],
      },
      null,
    );

    expect(showMock).toHaveBeenCalledWith(
      [{ id: "copy", label: "Copy", disabled: true, separatorBefore: true }],
      { x: 12, y: 34 },
    );
    expect(runNativeContextMenuAction).toHaveBeenCalledWith({ requestId: 1, actionId: "copy" });
  });

  it("refocuses the right-clicked field before invoking the action for an app source", async () => {
    showMock.mockResolvedValue("paste");
    const runNativeContextMenuAction =
      vi.fn<(input: { requestId: number; actionId: string | null }) => Promise<void>>();
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();
    expect(document.activeElement).toBe(other);

    await handleNativeContextMenuRequest(
      { runNativeContextMenuAction },
      {
        requestId: 4,
        source: { kind: "app" },
        x: 0,
        y: 0,
        items: [{ id: "paste", label: "Paste" }],
      },
      field,
    );

    expect(document.activeElement).toBe(field);
    expect(runNativeContextMenuAction.mock.invocationCallOrder[0]).toBeGreaterThan(0);
  });

  it("does nothing for a browser source with no registered webview", async () => {
    resolveLayoutMock.mockReturnValue(null);
    const runNativeContextMenuAction = vi.fn();

    await handleNativeContextMenuRequest(
      { runNativeContextMenuAction },
      { requestId: 3, source: { kind: "browser", webContentsId: 9 }, x: 0, y: 0, items: [] },
      null,
    );

    expect(showMock).not.toHaveBeenCalled();
    expect(runNativeContextMenuAction).not.toHaveBeenCalled();
  });
});

describe("installNativeContextMenuForwarding", () => {
  it("subscribes once and unsubscribes via the returned cleanup", () => {
    const unsubscribe = vi.fn();
    const onNativeContextMenu = vi.fn().mockReturnValue(unsubscribe);

    const cleanup = installNativeContextMenuForwarding({
      onNativeContextMenu,
      runNativeContextMenuAction: vi.fn(),
    });

    expect(onNativeContextMenu).toHaveBeenCalledTimes(1);
    cleanup?.();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("no-ops when the bridge has no onNativeContextMenu (older desktop builds)", () => {
    expect(installNativeContextMenuForwarding(undefined)).toBeUndefined();
    expect(installNativeContextMenuForwarding({})).toBeUndefined();
  });
});
