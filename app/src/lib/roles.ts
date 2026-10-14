// İki oyunun (Köpekbalığı Kafesi, Vampir–Köylü) rollerini tek yerden okumak için: ortak ekran parçaları (rol ikonu,
// çark, sıralama tablosu, oyuncu listesi, rol listesi) hangi oyunun rolü gelirse gelsin adını, rengini ve takımını bulur.
// Rol anahtarları iki oyunda çakışmaz.

import { SK_ROLES, type SkRole } from '@/lib/shark';
import { ROLES as VV_ROLES, type VvRole } from '@/lib/vampire';

export type AnyRole = SkRole | VvRole;

/** Takım sırası (listelerde): kötü takım, iyi takım, tarafsız */
export type RoleSide = 'evil' | 'good' | 'neutral';

export type AnyRoleInfo = { name: string; emoji: string; color: string; side: RoleSide; goal: string };

const VV_EMOJI: Record<VvRole, string> = { vampire: '🧛', doctor: '🩺', detective: '🕵️', villager: '🧑‍🌾' };

export function isRoleKey(k: string): k is AnyRole {
  return k in SK_ROLES || k in VV_ROLES;
}

export function isVampireRole(k: string): k is VvRole {
  return k in VV_ROLES;
}

export function roleInfo(k: string | null | undefined): AnyRoleInfo | null {
  if (!k) return null;
  if (k in SK_ROLES) {
    const r = SK_ROLES[k as SkRole];
    return { name: r.name, emoji: r.emoji, color: r.color, side: r.team === 'shark' ? 'evil' : r.team === 'human' ? 'good' : 'neutral', goal: r.goal };
  }
  if (k in VV_ROLES) {
    const r = VV_ROLES[k as VvRole];
    return { name: r.name, emoji: VV_EMOJI[k as VvRole], color: r.color, side: r.team === 'vampire' ? 'evil' : 'good', goal: r.goal };
  }
  return null;
}
