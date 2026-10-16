// Açılış sekmesi (Profil > Tercihler): uygulama açılınca hangi sekmeyle başlansın. Telefonda saklanır.

import * as SecureStore from 'expo-secure-store';

export type StartTab = 'index' | 'akis' | 'events';
const KEY = 'peoplehere_start_tab';

export const START_TABS: { key: StartTab; label: string; path: '/' | '/akis' | '/events' }[] = [
  { key: 'index', label: 'Harita', path: '/' },
  { key: 'akis', label: 'Akış', path: '/akis' },
  { key: 'events', label: 'Etkinlik', path: '/events' },
];

export function readStartTab(): StartTab {
  try {
    const v = SecureStore.getItem(KEY);
    return v === 'akis' || v === 'events' ? v : 'index';
  } catch {
    return 'index';
  }
}

export function saveStartTab(tab: StartTab): boolean {
  try {
    SecureStore.setItem(KEY, tab);
    return true;
  } catch {
    return false;
  }
}
