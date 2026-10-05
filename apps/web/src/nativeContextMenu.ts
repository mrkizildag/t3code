import type {
  ContextMenuItem,
  DesktopBridge,
  DesktopNativeContextMenuRequest,
} from "@t3tools/contracts";

import { resolveBrowserWebviewScreenLayout } from "./browser/browserWebviewRegistry";
import { readLocalApi } from "./localApi";

/** Maps request coordinates (CSS px of the right-clicked contents) to host client px; null for a gone webview. */
export function resolveNativeContextMenuPosition(
  request: DesktopNativeContextMenuRequest,
): { readonly x: number; readonly y: number } | null {
  if (request.source.kind === "app") {
    return { x: request.x, y: request.y };
  }
  const layout = resolveBrowserWebviewScreenLayout(request.source.webContentsId);
  if (!layout) return null;
  return {
    x: layout.left + request.x * layout.scale,
    y: layout.top + request.y * layout.scale,
  };
}

function toContextMenuItems(
  items: DesktopNativeContextMenuRequest["items"],
): readonly ContextMenuItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    ...(item.disabled ? { disabled: true } : {}),
    ...(item.separatorBefore ? { separatorBefore: true } : {}),
  }));
}

/**
 * Shows the styled menu for one native right-click and reports the choice to main.
 * The menu only returns focus after its close animation, so an app-source Cut/Paste
 * refocuses the right-clicked field first or it would land on the menu.
 */
export async function handleNativeContextMenuRequest(
  bridge: Pick<DesktopBridge, "runNativeContextMenuAction">,
  request: DesktopNativeContextMenuRequest,
  refocusTarget: Element | null,
): Promise<void> {
  const localApi = readLocalApi();
  if (!localApi || !bridge.runNativeContextMenuAction) return;
  const position = resolveNativeContextMenuPosition(request);
  if (!position) return;

  const actionId = await localApi.contextMenu.show(toContextMenuItems(request.items), position);
  if (request.source.kind === "app" && refocusTarget instanceof HTMLElement) {
    refocusTarget.focus();
  }
  await bridge.runNativeContextMenuAction({ requestId: request.requestId, actionId });
}

/** Subscribed once from the app root; forwards every native context-menu request to the styled menu. */
export function installNativeContextMenuForwarding(
  bridge: Pick<DesktopBridge, "onNativeContextMenu" | "runNativeContextMenuAction"> | undefined,
): (() => void) | undefined {
  return bridge?.onNativeContextMenu?.((request) => {
    const refocusTarget = document.activeElement;
    void handleNativeContextMenuRequest(bridge, request, refocusTarget);
  });
}
