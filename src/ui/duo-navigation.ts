import type { NativeNavigationPlugin } from '@capgo/capacitor-native-navigation';

interface NavigationState {
  visible: boolean;
  canGoBack: boolean;
  tabCount: number;
}

interface NavigationActions {
  back(): Promise<void>;
  tabs(): void;
  settings(): void;
  active(active: boolean): void;
  layout(): void;
  error(): void;
}

type NavigationPlugin = Pick<NativeNavigationPlugin, 'configure' | 'setTabbar' | 'addListener'>;

export class DuoNavigation {
  private state: NavigationState = { visible: false, canGoBack: false, tabCount: 1 };
  private sideDisplay = false;
  private failed = false;
  private acting = false;
  private revision = 0;
  private work: Promise<void> = Promise.resolve();
  private readonly ready: Promise<void>;

  constructor(private plugin: NavigationPlugin, private actions: NavigationActions) {
    this.ready = this.initialize();
    void this.ready.catch(() => this.fallback());
  }

  update(state: NavigationState): void {
    if (state.visible === this.state.visible && state.canGoBack === this.state.canGoBack && state.tabCount === this.state.tabCount) return;
    this.state = state;
    this.render();
  }

  async settled(): Promise<void> {
    await this.ready.catch(() => undefined);
    let pending: Promise<void>;
    do {
      pending = this.work;
      await pending;
    } while (pending !== this.work);
  }

  private async initialize(): Promise<void> {
    await this.plugin.addListener('tabSelect', ({ id }) => this.select(id));
    await this.plugin.addListener('safeAreaChanged', ({ insets }) => {
      this.detectSideDisplay(insets.left, insets.right);
      this.actions.layout();
    });
    const { insets } = await this.plugin.configure({ enabled: true, contentInsetMode: 'none' });
    this.detectSideDisplay(insets.left, insets.right);
  }

  private detectSideDisplay(left: number, right: number): void {
    if (this.sideDisplay || Math.max(left, right) < 64) return;
    this.sideDisplay = true;
    this.render();
  }

  private render(): void {
    const revision = ++this.revision;
    this.work = this.work.then(async () => {
      await this.ready;
      if (this.failed || !this.sideDisplay || revision !== this.revision) return;
      const state = this.state;
      await this.plugin.setTabbar({
        hidden: !state.visible,
        animated: true,
        selectedId: 'browse',
        tabs: [
          { id: 'back', title: 'Back', icon: { ios: { sfSymbol: 'chevron.backward' } }, enabled: state.canGoBack },
          { id: 'browse', title: 'Browse', icon: { ios: { sfSymbol: 'globe' } } },
          { id: 'tabs', title: 'Tabs', icon: { ios: { sfSymbol: 'square.on.square' } }, badge: state.tabCount > 1 ? state.tabCount : undefined },
          { id: 'settings', title: 'Settings', icon: { ios: { sfSymbol: 'gearshape' } } },
        ],
        style: { placement: 'sidebar' },
        colors: { tint: '#34d399' },
      });
      if (revision === this.revision) this.actions.active(state.visible);
      this.actions.layout();
    }).catch(() => this.fallback());
  }

  private select(id: string): void {
    if (this.failed || this.acting || !this.sideDisplay || !this.state.visible) return;
    this.acting = true;
    const perform = async (): Promise<void> => {
      switch (id) {
        case 'back':
          if (this.state.canGoBack) await this.actions.back();
          break;
        case 'tabs':
          this.actions.tabs();
          break;
        case 'settings':
          this.actions.settings();
          break;
      }
    };
    void perform().catch(() => this.actions.error()).finally(() => {
      this.acting = false;
      this.render();
    });
  }

  private fallback(): void {
    if (this.failed) return;
    this.failed = true;
    this.actions.active(false);
    this.actions.error();
    void this.plugin.setTabbar({ hidden: true }).catch(() => undefined);
  }
}
