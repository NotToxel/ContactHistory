export interface ContextMenuItem {
  id?: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
  action?: () => void | Promise<void>;
}

export interface ContextMenuOptions {
  x: number;
  y: number;
  items: ContextMenuItem[];
  header?: string;
  subHeader?: string;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  header?: string;
  subHeader?: string;
}

class ContextMenuManager {
  state = $state<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  open(options: ContextMenuOptions) {
    if (!options.items || options.items.length === 0) {
      this.close();
      return;
    }

    const pad = 10;
    const estWidth = 240;
    const estHeight = Math.min(420, options.items.length * 36 + (options.header ? 55 : 12));

    const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 700;

    let clampedX = options.x;
    let clampedY = options.y;

    if (clampedX + estWidth > winW - pad) {
      clampedX = Math.max(pad, winW - estWidth - pad);
    }
    if (clampedY + estHeight > winH - pad) {
      clampedY = Math.max(pad, winH - estHeight - pad);
    }

    this.state = {
      isOpen: true,
      x: clampedX,
      y: clampedY,
      items: options.items,
      header: options.header,
      subHeader: options.subHeader,
    };
  }

  close() {
    this.state.isOpen = false;
    this.state.items = [];
    this.state.header = undefined;
    this.state.subHeader = undefined;
  }
}

export const contextMenuManager = new ContextMenuManager();

export function openContextMenu(options: ContextMenuOptions) {
  contextMenuManager.open(options);
}

export function closeContextMenu() {
  contextMenuManager.close();
}
