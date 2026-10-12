// Uygulamanın kendi uyarı pencereleri. Telefonun yerel pencereleri (Alert) yerine bunlar açılır.
//
// Kullanım:
//   const ok = await confirmAction('Başlık', 'Açıklama', 'Evet', true);
//   const secim = await showDialog({ title: '...', buttons: [{ label: 'A', value: 'a' }, ...], cancelValue: null });
//   await notify('Gönderildi', 'İsteğin iletildi.');
//
// Pencereyi ekrana çizen şey `DialogHost` bileşenidir (bkz. components/DialogHost.tsx).
// Bu dosya yalnızca "sıradaki pencereler" listesini tutar; böylece pencereyi herhangi bir yerden,
// ekran bileşeni olmayan kodlardan bile açabiliriz.

import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type DialogTone = 'default' | 'danger' | 'friend' | 'success';

export type DialogButton<T> = {
  label: string;
  value: T;
  /** primary: sarı dolu, danger: kırmızı dolu, ghost: çerçeveli (varsayılan) */
  style?: 'primary' | 'danger' | 'ghost';
};

/**
 * Pencerede, düğmelerin üstünde açılıp kapanan bir anahtar. Açılınca `onEnable` çalışır: bir değer döndürürse pencere
 * o değerle kapanır; `undefined` dönerse pencere açık kalır, anahtar kapalı konuma döner ve varsa `failText` görünür.
 */
export type DialogToggle = {
  label: string;
  onEnable: () => Promise<unknown>;
  failText?: string;
};

export type DialogOptions<T> = {
  title: string;
  message?: string;
  toggle?: DialogToggle;
  /** Kırmızı, belirgin uyarı satırı (ör. “Gerçek adın görünür”). Mesajın altında çerçeveli kutuda çıkar. */
  warning?: string;
  icon?: IconName;
  tone?: DialogTone;
  buttons: DialogButton<T>[];
  /** Pencerenin dışına dokunulunca ya da Geri tuşuna basılınca dönen değer */
  cancelValue: T;
};

export type DialogRequest = {
  id: number;
  title: string;
  message?: string;
  toggle?: DialogToggle;
  warning?: string;
  icon: IconName;
  tone: DialogTone;
  buttons: DialogButton<unknown>[];
  cancelValue: unknown;
  resolve: (value: unknown) => void;
};

type State = { queue: DialogRequest[]; hosts: string[] };

let state: State = { queue: [], hosts: [] };
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): State {
  return state;
}

/**
 * Pencereyi çizecek bir "ev sahibi" kaydeder. Birden fazla varsa (ör. açık bir alt pencerenin içindeki)
 * en son kaydolan çizer; böylece pencere her zaman en üstteki ekranın önünde görünür.
 */
export function registerHost(id: string): () => void {
  emit({ ...state, hosts: [...state.hosts, id] });
  return () => emit({ ...state, hosts: state.hosts.filter((h) => h !== id) });
}

const DEFAULT_ICONS: Record<DialogTone, IconName> = {
  default: 'help-circle',
  danger: 'warning',
  friend: 'people',
  success: 'checkmark-circle',
};

export function showDialog<T>(options: DialogOptions<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    const tone = options.tone ?? 'default';
    const request: DialogRequest = {
      id: nextId++,
      title: options.title,
      message: options.message,
      toggle: options.toggle,
      warning: options.warning,
      icon: options.icon ?? DEFAULT_ICONS[tone],
      tone,
      buttons: options.buttons as DialogButton<unknown>[],
      cancelValue: options.cancelValue,
      resolve: resolve as (value: unknown) => void,
    };
    emit({ ...state, queue: [...state.queue, request] });
  });
}

/** Pencereyi kapatır ve seçilen değeri bekleyen koda iletir. */
export function closeDialog(id: number, value: unknown): void {
  const request = state.queue.find((r) => r.id === id);
  if (!request) return;
  emit({ ...state, queue: state.queue.filter((r) => r.id !== id) });
  request.resolve(value);
}

/** "Emin misin?" penceresi. Onaylanırsa true, vazgeçilirse false döner. */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  destructive = false,
  options: { icon?: IconName; tone?: DialogTone; cancelLabel?: string; warning?: string } = {},
): Promise<boolean> {
  return showDialog<boolean>({
    title,
    message,
    warning: options.warning,
    icon: options.icon,
    tone: options.tone ?? (destructive ? 'danger' : 'default'),
    buttons: [
      { label: confirmLabel, value: true, style: destructive ? 'danger' : 'primary' },
      { label: options.cancelLabel ?? 'Vazgeç', value: false, style: 'ghost' },
    ],
    cancelValue: false,
  });
}

/** Tek düğmeli bilgi penceresi. */
export function notify(
  title: string,
  message?: string,
  options: { icon?: IconName; tone?: DialogTone; okLabel?: string; warning?: string } = {},
): Promise<void> {
  return showDialog<void>({
    title,
    message,
    warning: options.warning,
    icon: options.icon,
    tone: options.tone ?? 'default',
    buttons: [{ label: options.okLabel ?? 'Tamam', value: undefined, style: 'primary' }],
    cancelValue: undefined,
  });
}

/** Şikayet gönderildi: ekranda “Tamam” ile kapatılan pencere. */
export function notifyReportSent(): Promise<void> {
  return notify('Şikayetin alındı', 'Konu çözüldüğünde sana bildirim gelecek.', {
    icon: 'flag',
    tone: 'success',
    okLabel: 'Tamam',
  });
}
