import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { notify, notifyReportSent } from '@/lib/dialog';
import { REPORT_REASONS } from '@/lib/feed';
import { reportTarget } from '@/lib/invites';
import { callEmergency } from '@/lib/safety';
import { colors } from '@/theme';

type Target = { type: 'room' | 'event'; id: string };

/**
 * Kırmızı ünlem düğmesi ve açılır menüsü: “Kolluk kuvvetlerini ara (112)” ve “Oyunu / Etkinliği bildir”.
 * `button` başlığa, `nodes` ekranın üst katmanına (Screen `overlay`) konur.
 */
export function useSafetyMenu(
  target: Target | null,
  /** emergency false: 112 seçeneği gösterilmez (uzaktan oyunlarda herkes kendi evindedir) */
  opts: { emergency?: boolean } = {},
): {
  button: ReactNode;
  nodes: ReactNode;
  isOpen: boolean;
  open: () => void;
} {
  const [step, setStep] = useState<'menu' | 'report' | null>(null);
  const emergency = opts.emergency !== false;
  const noun = target?.type === 'event' ? 'Etkinliği' : 'Oyunu';

  async function report(reason: string) {
    if (!target) return;
    setStep(null);
    const res = await reportTarget(target.type, target.id, reason);
    if (res.error) {
      await notify('Bildirilemedi', res.error, { tone: 'danger', icon: 'alert-circle' });
      return;
    }
    await notifyReportSent();
  }

  const button = target ? (
    <Pressable
      onPress={() => setStep('menu')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Güvenlik menüsü: 112'yi ara ya da bildir"
      testID="safety-menu"
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Ionicons name="alert-circle" size={30} color={colors.danger} />
    </Pressable>
  ) : null;

  const nodes =
    step === 'menu' ? (
      <ActionSheet
        title="Güvenlik"
        subtitle={
          emergency
            ? "Kendini güvende hissetmiyorsan ortamdan ayrıl. Acil durumda 112'yi ara."
            : 'Rahatsız edici bir durum varsa oyunu moderatörlere bildirebilirsin.'
        }
        options={[
          ...(emergency
            ? [
                {
                  label: 'Kolluk kuvvetlerini ara (112)',
                  icon: 'call' as const,
                  destructive: true,
                  onPress: () => {
                    setStep(null);
                    void callEmergency();
                  },
                },
              ]
            : []),
          { label: `${noun} bildir`, icon: 'flag-outline', onPress: () => setStep('report') },
        ]}
        onClose={() => setStep(null)}
      />
    ) : step === 'report' ? (
      <ActionSheet
        title={`${noun} neden bildiriyorsun?`}
        options={[
          ...['Tehlikeli ya da tehdit edici davranış', 'Taciz ya da rahatsız edici davranış', ...REPORT_REASONS].map(
            (r) => ({ label: r, onPress: () => void report(r) }),
          ),
        ]}
        onClose={() => setStep(null)}
      />
    ) : null;

  return { button, nodes, isOpen: step !== null, open: () => setStep('menu') };
}

const styles = StyleSheet.create({
  btn: { padding: 2 },
  pressed: { opacity: 0.7 },
});
