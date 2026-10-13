// Profil > Kişisel Verilerim & Rapor: kimlik bilgisi, açık rızalar ve resmi veri dosyası (.json).

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type ConsentKey = 'marketing' | 'map_density';

export type MyPrivacy = {
  user_id: string;
  created_at: string;
  consents: Record<ConsentKey, boolean>;
};

/** Açık rızalar: her biri açılıp kapanabilir; sunucu kapalı rızaya göre davranır. */
export const CONSENTS: { key: ConsentKey; title: string; text: string }[] = [
  {
    key: 'marketing',
    title: 'Kampanya ve özel etkinlik bildirimleri',
    text: '41. Kat Özel etkinlikleri, kampanyalar ve duyurular hakkında bana bildirim gönderilmesine izin veriyorum. Kapalıyken bu bildirimler gönderilmez.',
  },
  {
    key: 'map_density',
    title: 'Haritadaki anonim yoğunluğa sayılmak',
    text: 'Oyun, etkinlik, gönderi ve petek bildirimlerinde bulunduğum peteğin, adım görünmeden haritadaki kişi yoğunluğuna sayılmasına izin veriyorum. Kapalıyken hiçbir yoğunluk kaydım tutulmaz (petek bildirimlerim de sayılmaz).',
  },
];

export async function getMyPrivacy(): Promise<{ data: MyPrivacy | null; error: string | null }> {
  return callRpc<MyPrivacy>('my_privacy');
}

export async function setConsent(key: ConsentKey, granted: boolean): Promise<Result> {
  return callRpcVoid('set_consent', { p_key: key, p_granted: granted });
}

/**
 * Resmi veri dosyasını sunucudan alır, telefonda .json dosyası olarak oluşturur ve paylaşma / kaydetme penceresini
 * açar (Dosyalar'a kaydet, e-posta ile gönder vb.).
 */
export async function exportMyData(): Promise<Result> {
  const { data, error } = await callRpc<Record<string, unknown>>('my_data_export');
  if (error || !data) return { error: error ?? 'Veri dosyası hazırlanamadı.' };
  try {
    const day = new Date().toISOString().slice(0, 10);
    const file = new File(Paths.cache, `41kat-veri-dosyasi-${day}.json`);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(data, null, 2));
    if (!(await Sharing.isAvailableAsync())) {
      return { error: 'Bu telefonda dosya paylaşma açılamadı.' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Resmi veri dosyan',
      UTI: 'public.json',
    });
    return { error: null };
  } catch {
    return { error: 'Dosya oluşturulamadı. Telefonunda yer olduğundan emin olup tekrar dene.' };
  }
}
