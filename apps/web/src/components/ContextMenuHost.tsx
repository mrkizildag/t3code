import type { ContextMenuItem } from "@t3tools/contracts";
import {
  ArchiveIcon,
  BugIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  CloudUploadIcon,
  CopyIcon,
  FlaskConicalIcon,
  FolderIcon,
  FolderTreeIcon,
  GitBranchIcon,
  GitCommitIcon,
  HammerIcon,
  HashIcon,
  ListChecksIcon,
  MailOpenIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  RefreshCwIcon,
  SettingsIcon,
  TimerIcon,
  TrashIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type Ref,
} from "react";

import {
  completeContextMenuClose,
  dismissContextMenu,
  readContextMenuState,
  registerContextMenuHost,
  respondToContextMenu,
  subscribeContextMenu,
} from "../contextMenu";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroupLabel,
  MenuItem,
  MenuItemLabel,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "./ui/menu";

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  archive: ArchiveIcon,
  check: CheckIcon,
  timer: TimerIcon,
  "circle-check": CircleCheckIcon,
  clock: ClockIcon,
  pencil: PencilIcon,
  copy: CopyIcon,
  folder: FolderIcon,
  "git-branch": GitBranchIcon,
  hash: HashIcon,
  "mail-open": MailOpenIcon,
  "message-square-plus": MessageSquarePlusIcon,
  pin: PinIcon,
  "pin-off": PinOffIcon,
  "refresh-cw": RefreshCwIcon,
  settings: SettingsIcon,
  "folder-tree": FolderTreeIcon,
  trash: TrashIcon,
  commit: GitCommitIcon,
  push: CloudUploadIcon,
  play: PlayIcon,
  test: FlaskConicalIcon,
  lint: ListChecksIcon,
  configure: WrenchIcon,
  build: HammerIcon,
  debug: BugIcon,
};

const EMPTY_ITEMS: readonly ContextMenuItem[] = [];

function ContextMenuIcon({ icon }: { readonly icon: string }) {
  const Icon = ICON_COMPONENTS[icon];
  return Icon ? <Icon /> : null;
}

function isBareLetterKeyDown(event: KeyboardEvent): event is KeyboardEvent & { key: string } {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.length === 1 &&
    /[a-zA-Z]/.test(event.key)
  );
}

function focusFirstEnabledMenuItem(popup: HTMLElement | null): void {
  if (!popup) return;
  const candidate = popup.querySelector<HTMLElement>(
    '[data-slot="menu-item"]:not([data-disabled]), [data-slot="menu-sub-trigger"]:not([data-disabled]), [data-slot="menu-checkbox-item"]:not([data-disabled])',
  );
  candidate?.focus();
}

interface ContextMenuLevelProps {
  readonly items: readonly ContextMenuItem[];
  readonly onSelect: (id: string) => void;
  readonly kind: "root" | "sub";
  readonly popupRef?: Ref<HTMLDivElement>;
  /** Root-only: focus target base-ui restores focus to once the menu closes. */
  readonly returnFocus?: HTMLElement | null;
}

/** Renders one popup's worth of items: the root menu or a single submenu. */
function ContextMenuLevel({ items, onSelect, kind, popupRef, returnFocus }: ContextMenuLevelProps) {
  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent) => {
      // Submenu popups are portals but stay React children of this level, so
      // without this check this level's capture handler would also fire for
      // keys pressed inside an already-open submenu.
      if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
        return;
      }
      if (!isBareLetterKeyDown(event)) return;
      event.preventDefault();
      event.stopPropagation();

      const letter = event.key.toUpperCase();
      const match = items.find(
        (item) => !item.disabled && !item.header && item.shortcut === letter,
      );
      if (!match) return;

      if (match.children && match.children.length > 0) {
        // Hand off to base-ui's own keyboard path, which opens the submenu and
        // focuses its first item so the submenu's letters work next.
        const trigger = [
          ...event.currentTarget.querySelectorAll<HTMLElement>('[data-slot="menu-sub-trigger"]'),
        ].find((element) => element.dataset.contextMenuItemId === match.id);
        trigger?.focus();
        trigger?.dispatchEvent(
          new window.KeyboardEvent("keydown", {
            key: "ArrowRight",
            bubbles: true,
            cancelable: true,
          }),
        );
      } else {
        onSelect(match.id);
      }
    },
    [items, onSelect],
  );

  const content = items.map((item, index) => {
    const separator =
      item.separatorBefore && index > 0 ? <MenuSeparator key={`${item.id}:separator`} /> : null;

    if (item.header) {
      return (
        <Fragment key={item.id}>
          {separator}
          <MenuGroupLabel>{item.label}</MenuGroupLabel>
        </Fragment>
      );
    }

    if (item.children && item.children.length > 0) {
      return (
        <Fragment key={item.id}>
          {separator}
          <MenuSub>
            <MenuSubTrigger
              disabled={item.disabled}
              data-context-menu-item-id={item.id}
              shortcut={item.shortcut ? <MenuShortcut>{item.shortcut}</MenuShortcut> : undefined}
            >
              {item.icon ? <ContextMenuIcon icon={item.icon} /> : null}
              <MenuItemLabel>{item.label}</MenuItemLabel>
            </MenuSubTrigger>
            <ContextMenuLevel items={item.children} onSelect={onSelect} kind="sub" />
          </MenuSub>
        </Fragment>
      );
    }

    if (typeof item.checked === "boolean") {
      return (
        <Fragment key={item.id}>
          {separator}
          <MenuCheckboxItem
            checked={item.checked}
            disabled={item.disabled}
            onCheckedChange={() => onSelect(item.id)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {item.icon ? <ContextMenuIcon icon={item.icon} /> : null}
              <MenuItemLabel>{item.label}</MenuItemLabel>
              {item.shortcut ? <MenuShortcut>{item.shortcut}</MenuShortcut> : null}
            </span>
          </MenuCheckboxItem>
        </Fragment>
      );
    }

    return (
      <Fragment key={item.id}>
        {separator}
        <MenuItem
          disabled={item.disabled}
          variant={item.destructive ? "destructive" : "default"}
          onClick={() => onSelect(item.id)}
        >
          {item.icon ? <ContextMenuIcon icon={item.icon} /> : null}
          <MenuItemLabel>{item.label}</MenuItemLabel>
          {item.shortcut ? <MenuShortcut>{item.shortcut}</MenuShortcut> : null}
        </MenuItem>
      </Fragment>
    );
  });

  if (kind === "root") {
    return (
      <MenuPopup
        ref={popupRef}
        align="start"
        sideOffset={0}
        finalFocus={() => returnFocus ?? null}
        onKeyDownCapture={onKeyDownCapture}
      >
        {content}
      </MenuPopup>
    );
  }

  return <MenuSubPopup onKeyDownCapture={onKeyDownCapture}>{content}</MenuSubPopup>;
}

/**
 * Single root-mounted renderer for every `localApi.contextMenu.show()` call,
 * driven by the `contextMenu.ts` store. A controlled base-ui `Menu` opens at the
 * click point; focus returns to whatever was focused before the menu opened.
 */
export function ContextMenuHost() {
  const state = useSyncExternalStore(
    subscribeContextMenu,
    readContextMenuState,
    readContextMenuState,
  );

  useEffect(() => registerContextMenuHost(), []);

  const isOpen = state.status === "open";
  const items = state.status === "idle" ? EMPTY_ITEMS : state.items;
  const position = state.status === "idle" ? undefined : state.position;
  const returnFocus = state.status === "idle" ? null : state.returnFocus;
  // Remount per request so submenu state from a previous menu never carries over.
  const requestId = state.status === "idle" ? 0 : state.requestId;

  const onSelect = useCallback((id: string) => {
    respondToContextMenu(id);
  }, []);

  const rootPopupRef = useRef<HTMLDivElement | null>(null);

  return (
    <Menu
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) dismissContextMenu();
      }}
      onOpenChangeComplete={(open) => {
        if (open) {
          focusFirstEnabledMenuItem(rootPopupRef.current);
          return;
        }
        completeContextMenuClose();
      }}
    >
      {/* base-ui assigns a menu's tree node through its trigger. Without one, the root and
          its submenus share a null parent, so opening a submenu closes the root as a sibling. */}
      <MenuTrigger
        nativeButton={false}
        render={
          <span
            inert
            className="pointer-events-none fixed size-0"
            style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
          />
        }
      />
      <ContextMenuLevel
        key={requestId}
        items={items}
        onSelect={onSelect}
        kind="root"
        popupRef={rootPopupRef}
        returnFocus={returnFocus}
      />
    </Menu>
  );
}
