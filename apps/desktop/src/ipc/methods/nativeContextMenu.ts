import { DesktopRunNativeContextMenuActionInputSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

interface PendingNativeContextMenuRequest {
  readonly contents: Electron.WebContents;
  readonly actions: ReadonlyMap<string, () => void>;
}

const pendingRequests = new Map<number, PendingNativeContextMenuRequest>();
let nextRequestId = 1;

/**
 * Registers a styled context-menu request awaiting the renderer's choice and
 * returns its id. Only one styled menu can be open at a time, so a new
 * request clears whatever was still pending rather than accumulating stale
 * entries a closed menu will never answer.
 */
export function registerNativeContextMenuRequest(entry: PendingNativeContextMenuRequest): number {
  pendingRequests.clear();
  const requestId = nextRequestId++;
  pendingRequests.set(requestId, entry);
  return requestId;
}

export const runNativeContextMenuAction = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.RUN_NATIVE_CONTEXT_MENU_ACTION_CHANNEL,
  payload: DesktopRunNativeContextMenuActionInputSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.nativeContextMenu.runAction")(function* ({
    requestId,
    actionId,
  }) {
    const pending = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    if (!pending || actionId === null) return;
    const action = pending.actions.get(actionId);
    if (!action || pending.contents.isDestroyed()) return;
    pending.contents.focus();
    action();
  }),
});
