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
    this.state = {
      isOpen: true,
      x: options.x,
      y: options.y,
      items: options.items,
      header: options.header,
      subHeader: options.subHeader,
    };
  }

  close() {
    this.state.isOpen = false;
  }
}

export const contextMenuManager = new ContextMenuManager();

export function openContextMenu(options: ContextMenuOptions) {
  contextMenuManager.open(options);
}

export function closeContextMenu() {
  contextMenuManager.close();
}
