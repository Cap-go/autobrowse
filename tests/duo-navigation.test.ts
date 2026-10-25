import { expect, mock, test } from 'bun:test';
import { WebPlugin } from '@capacitor/core';
import type { NativeNavigationTabbarOptions } from '@capgo/capacitor-native-navigation';
import { DuoNavigation } from '../src/ui/duo-navigation';

class NavigationPlugin extends WebPlugin {
  readonly updates: NativeNavigationTabbarOptions[] = [];
  readonly insets = { top: 0, right: 84, bottom: 0, left: 0, navbarHeight: 0, tabbarHeight: 0, systemTabbarHeight: 0 };
  gate: Promise<void> = Promise.resolve();
  fail = false;

  async configure() {
    await this.gate;
    return { insets: this.insets };
  }

  async setTabbar(options: NativeNavigationTabbarOptions) {
    if (this.fail) throw new Error('Native host unavailable');
    this.updates.push(options);
    return { insets: this.insets };
  }

  select(id: string): void {
    this.notifyListeners('tabSelect', { id, index: 0 });
  }
}

function setup(right = 84) {
  const plugin = new NavigationPlugin();
  plugin.insets.right = right;
  const actions = {
    back: mock(async () => {}),
    tabs: mock(() => {}),
    settings: mock(() => {}),
    active: mock((_active: boolean) => {}),
    layout: mock(() => {}),
    error: mock(() => {}),
  };
  const navigation = new DuoNavigation(plugin, actions);
  return { plugin, actions, navigation };
}

test('Duo uses the system sidebar and disables Back on the start page', async () => {
  const { navigation, plugin, actions } = setup();
  navigation.update({ visible: true, canGoBack: false, tabCount: 2 });
  await navigation.settled();
  expect(plugin.updates.at(-1)).toMatchObject({ hidden: false, selectedId: 'browse', style: { placement: 'sidebar' } });
  expect(plugin.updates.at(-1)?.tabs?.find((tab) => tab.id === 'back')?.enabled).toBe(false);
  expect(plugin.updates.at(-1)?.tabs?.find((tab) => tab.id === 'tabs')?.badge).toBe(2);
  plugin.select('back');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(actions.back).not.toHaveBeenCalled();
  expect(actions.active).toHaveBeenLastCalledWith(true);
});

test('native Back calls browser history and resets the selected action', async () => {
  const { navigation, plugin, actions } = setup();
  navigation.update({ visible: true, canGoBack: true, tabCount: 1 });
  await navigation.settled();
  plugin.select('back');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await navigation.settled();
  expect(actions.back).toHaveBeenCalledTimes(1);
  expect(plugin.updates.at(-1)?.selectedId).toBe('browse');
});

test('sidebar actions open the existing tab switcher and settings', async () => {
  const { navigation, plugin, actions } = setup();
  navigation.update({ visible: true, canGoBack: false, tabCount: 1 });
  await navigation.settled();
  plugin.select('tabs');
  await new Promise((resolve) => setTimeout(resolve, 0));
  plugin.select('settings');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(actions.tabs).toHaveBeenCalledTimes(1);
  expect(actions.settings).toHaveBeenCalledTimes(1);
});

test('a regular iPhone keeps the web controls and gets no sidebar', async () => {
  const { navigation, plugin, actions } = setup(0);
  navigation.update({ visible: true, canGoBack: true, tabCount: 1 });
  await navigation.settled();
  expect(plugin.updates).toHaveLength(0);
  expect(actions.active).not.toHaveBeenCalled();
});

test('web overlays hide the native rail and restore it when dismissed', async () => {
  const { navigation, plugin, actions } = setup();
  navigation.update({ visible: true, canGoBack: true, tabCount: 1 });
  await navigation.settled();
  navigation.update({ visible: false, canGoBack: true, tabCount: 1 });
  await navigation.settled();
  expect(plugin.updates.at(-1)).toMatchObject({ hidden: true, animated: true });
  plugin.select('back');
  expect(actions.back).not.toHaveBeenCalled();
  navigation.update({ visible: true, canGoBack: true, tabCount: 1 });
  await navigation.settled();
  expect(plugin.updates.at(-1)?.hidden).toBe(false);
  expect(actions.active).toHaveBeenLastCalledWith(true);
});

test('leaving the browser during native startup cannot reveal a stale sidebar', async () => {
  const { navigation, plugin, actions } = setup();
  const { promise, resolve } = Promise.withResolvers<void>();
  plugin.gate = promise;
  navigation.update({ visible: true, canGoBack: true, tabCount: 1 });
  navigation.update({ visible: false, canGoBack: false, tabCount: 1 });
  resolve();
  await navigation.settled();
  expect(plugin.updates.every((update) => update.hidden)).toBe(true);
  expect(actions.active).toHaveBeenLastCalledWith(false);
  plugin.select('back');
  expect(actions.back).not.toHaveBeenCalled();
});

test('native failures restore the web navigation controls', async () => {
  const { navigation, plugin, actions } = setup();
  plugin.fail = true;
  navigation.update({ visible: true, canGoBack: true, tabCount: 1 });
  await navigation.settled();
  expect(actions.active).toHaveBeenLastCalledWith(false);
  expect(actions.error).toHaveBeenCalledTimes(1);
});
