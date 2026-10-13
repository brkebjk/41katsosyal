// Profil > Bir Sorun Bildir: sorun türleri ve gönderme. Bildirim sunucuda saklanır, moderatörlere bildirim gider.

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type Ionicons from '@expo/vector-icons/Ionicons';

import { callRpcVoid, type Result } from '@/lib/rpc';

export type ProblemCategory =
  | 'bug'
  | 'account'
  | 'points'
  | 'event'
  | 'game'
  | 'map'
  | 'subscription'
  | 'abuse'
  | 'suggestion'
  | 'other';

export const PROBLEM_CATEGORIES: {
  key: ProblemCategory;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'bug', label: 'Uygulama hatası / çökme', icon: 'bug' },
  { key: 'account', label: 'Hesap ve giriş', icon: 'person-circle' },
  { key: 'points', label: 'Puan, seviye ve sıralama', icon: 'stats-chart' },
  { key: 'event', label: 'Etkinlik ve katılım kodu', icon: 'calendar' },
  { key: 'game', label: 'Oyunlar ve Bilgi Yarışması', icon: 'game-controller' },
  { key: 'map', label: 'Harita ve konum', icon: 'map' },
  { key: 'subscription', label: 'Abonelik ve ödeme', icon: 'card' },
  { key: 'abuse', label: 'Kötüye kullanım / güvenlik', icon: 'shield' },
  { key: 'suggestion', label: 'Öneri', icon: 'bulb' },
  { key: 'other', label: 'Diğer', icon: 'ellipsis-horizontal-circle' },
];

const TEXT: Record<string, string> = {
  invalid_category: 'Bir sorun türü seç.',
  invalid_body: 'Sorunu en az 10, en çok 2000 karakterle anlat.',
  invalid_email: 'E-posta adresi geçersiz görünüyor.',
  invalid_phone: 'Telefon numarası geçersiz görünüyor.',
  rate_limited: 'Bugün çok fazla bildirim gönderdin. Yarın tekrar deneyebilirsin.',
};

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

export async function submitProblemReport(input: {
  category: ProblemCategory;
  message: string;
  name: string;
  email: string;
  phone: string;
}): Promise<Result> {
  return callRpcVoid(
    'submit_problem_report',
    {
      p_category: input.category,
      p_message: input.message.trim(),
      p_name: input.name.trim() || null,
      p_email: input.email.trim() || null,
      p_phone: input.phone.trim() || null,
      p_version: appVersion(),
      p_platform: Platform.OS,
    },
    TEXT,
  );
}

export type ProblemReport = {
  id: string;
  category: ProblemCategory;
  message: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  app_version: string | null;
  platform: string | null;
  status: 'open' | 'closed';
  created_at: string;
  user_id: string | null;
  user_full_name: string | null;
  user_alias: string | null;
};
