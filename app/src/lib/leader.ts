// Etkinlik lideri başvurusu. Kontrollerin hepsi sunucuda (apply_event_leader) yapılır; telefon yalnızca moderatöre görünür.

import { callRpc, type Result } from '@/lib/rpc';

export const AUDIENCE_OPTIONS = [
  { value: '1-10', label: '1–10' },
  { value: '10-30', label: '10–30' },
  { value: '30-100', label: '30–100' },
  { value: '100+', label: '100+' },
] as const;
export type Audience = (typeof AUDIENCE_OPTIONS)[number]['value'];

const LEADER_TEXT: Record<string, string> = {
  forbidden: 'Bu hesap türü başvuru yapamaz.',
  already_leader: 'Zaten Etkinlik Liderisin.',
  invalid_name: 'Ad soyad 2 ile 60 karakter arasında olmalı.',
  invalid_phone: 'Telefon numarasını başında 0 ya da +90 ile, yalnızca rakam olarak yaz (ör. 05xx xxx xx xx).',
  invalid_categories: 'En az bir etkinlik türü seç.',
  invalid_audience: 'Ortalama kitleni seç.',
  application_pending: 'Bekleyen bir başvurun zaten var; moderatör inceleyince bildirim alırsın.',
  recently_rejected: 'Son başvurun reddedildi; 7 gün sonra yeniden başvurabilirsin.',
};

export async function applyEventLeader(input: {
  fullName: string;
  phone: string;
  categories: string[];
  audience: Audience;
}): Promise<Result> {
  const { error } = await callRpc<string>(
    'apply_event_leader',
    {
      p_full_name: input.fullName.trim(),
      p_phone: input.phone.replace(/[^0-9+]/g, ''),
      p_categories: input.categories,
      p_audience: input.audience,
    },
    LEADER_TEXT,
  );
  return { error };
}
