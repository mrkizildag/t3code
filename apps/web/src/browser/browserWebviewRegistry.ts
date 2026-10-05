/**
 * Registry of live `<webview>` elements keyed by their Electron webContents
 * id, used to map a guest-page coordinate from a native context-menu request
 * back to a position in the host document.
 */
const webviewElementsByWebContentsId = new Map<number, HTMLElement>();

/** Registers a webview element; the returned cleanup removes only that registration. */
export function registerBrowserWebviewElement(
  webContentsId: number,
  element: HTMLElement,
): () => void {
  webviewElementsByWebContentsId.set(webContentsId, element);
  return () => {
    if (webviewElementsByWebContentsId.get(webContentsId) === element) {
      webviewElementsByWebContentsId.delete(webContentsId);
    }
  };
}

export interface BrowserWebviewScreenLayout {
  readonly left: number;
  readonly top: number;
  /** Host px per guest CSS px, read off the webview's own scale transform. */
  readonly scale: number;
}

const SCALE_TRANSFORM_PATTERN = /scale\(([\d.]+)\)/;

/**
 * The registered webview's on-screen origin and current scale, or null when
 * no webview is registered for this id (already detached, or the id is
 * stale). `getBoundingClientRect` already reflects the scale transform
 * `HostedBrowserWebview` applies, so its origin is exactly where a guest CSS
 * px of (0, 0) renders in the host document.
 */
export function resolveBrowserWebviewScreenLayout(
  webContentsId: number,
): BrowserWebviewScreenLayout | null {
  const element = webviewElementsByWebContentsId.get(webContentsId);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const match = SCALE_TRANSFORM_PATTERN.exec(element.style.transform);
  const scale = match ? Number(match[1]) : 1;
  return {
    left: rect.left,
    top: rect.top,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}
