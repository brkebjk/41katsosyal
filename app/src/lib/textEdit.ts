// GEÇİCİ: Yazı düzenleme modu. Moderatör, Moderatör paneli > "Yazı düzenleme modu"nu açınca uygulamadaki sabit
// yazılara uzun basıp düzeltebilir. Düzeltmeler sunucuda (ui_text_overrides) saklanır ve herkeste görünür. Düzeltmeler
// koda işlenince bu dosya, components/AppText.tsx, components/TextEditHost.tsx ve uiStrings.generated.ts kaldırılır.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

type State = {
  /** Düzenleme modu açık mı (yalnızca moderatörde) */
  editing: boolean;
  /** Orijinal yazı → düzeltilmiş yazı */
  overrides: ReadonlyMap<string, string>;
  /** Düzenleme penceresinde açık olan orijinal yazı */
  pending: string | null;
};

const CACHE_KEY = 'kat41.uiTexts';
const MODE_KEY = 'kat41.textEditMode';

let wanted = false;
let isAdmin = false;
let state: State = { editing: false, overrides: new Map(), pending: null };
const listeners = new Set<() => void>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeTextEdit(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getTextEditState(): State {
  return state;
}

function setMap(obj: Record<string, unknown>) {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) if (typeof v === 'string' && v) m.set(k, v);
  emit({ overrides: m });
}

/** Uygulama açılınca: önce telefondaki kopya, sonra sunucudaki güncel düzeltmeler */
export async function loadUiTexts(): Promise<void> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached && state.overrides.size === 0) setMap(JSON.parse(cached) as Record<string, unknown>);
  } catch {
    // önbellek okunamadıysa sunucudan gelir
  }
  try {
    const mode = await AsyncStorage.getItem(MODE_KEY);
    wanted = mode === '1';
    emit({ editing: wanted && isAdmin });
  } catch {
    // mod kapalı kalır
  }
  if (!supabase) return;
  const { data, error } = await supabase.rpc('get_ui_texts');
  if (error || !data || typeof data !== 'object') return;
  setMap(data as Record<string, unknown>);
  void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
}

/** Giriş yapan moderatör mü? (düzenleme modu yalnızca moderatörde açılır) */
export function setTextEditAdmin(admin: boolean): void {
  if (admin === isAdmin) return;
  isAdmin = admin;
  emit({ editing: wanted && isAdmin, pending: isAdmin ? state.pending : null });
}

export function isTextEditWanted(): boolean {
  return wanted;
}

export function setTextEditMode(on: boolean): void {
  wanted = on;
  void AsyncStorage.setItem(MODE_KEY, on ? '1' : '0').catch(() => {});
  emit({ editing: on && isAdmin });
}

export function openTextEditor(source: string): void {
  if (!state.editing) return;
  emit({ pending: source });
}

export function closeTextEditor(): void {
  emit({ pending: null });
}

const TEXT: Record<string, string> = {
  forbidden: 'Bu işlem yalnızca moderatörler içindir.',
  invalid_text: 'Yazı boş olamaz ve en çok 2000 karakter olabilir.',
  too_many: 'Çok fazla düzeltme var. Önce düzeltmelerin koda işlenmesi gerekiyor.',
};

/** Düzeltmeyi kaydeder. `text` boşsa ya da orijinalle aynıysa düzeltme silinir (orijinale döner). */
export async function saveUiText(source: string, text: string | null): Promise<Result> {
  const clean = text && text.trim() && text !== source ? text : null;
  const res = await callRpcVoid('admin_set_ui_text', { p_source: source, p_text: clean }, TEXT);
  if (res.error) return res;
  const m = new Map(state.overrides);
  if (clean) m.set(source, clean);
  else m.delete(source);
  emit({ overrides: m, pending: null });
  void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(m))).catch(() => {});
  return { error: null };
}

export async function countUiTexts(): Promise<number> {
  const res = await callRpc<Record<string, string>>('get_ui_texts');
  return res.data ? Object.keys(res.data).length : state.overrides.size;
}
