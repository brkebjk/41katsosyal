import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/dialog';
import { callRpc } from '@/lib/rpc';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };
type Code = { code: number; taken: boolean; mine: boolean; holder: string | null };

const TEXT: Record<string, string> = {
  alias_code_taken: 'Bu kodu başka bir moderatör kullanıyor. Önce onun kodu bırakması gerekir.',
  invalid_alias_code: 'Yalnızca #41 ve #1000 seçilebilir.',
};

/**
 * Moderatör paneli > Rumuz kodu: moderatörlere ayrılmış #41 ve #1000. Seçilen kodla rumuz “Moderatör#41” olur,
 * haftalık yenilemede değişmez ve akışta @41 ile etiketlenebilir. Başka moderatörün kullandığı kod seçilemez.
 */
export function AliasCodeTab({ onNotice }: { onNotice: (n: Notice) => void }) {
  const { refreshProfile } = useAuth();
  const [rows, setRows] = useState<Code[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await callRpc<Code[]>('admin_alias_codes');
    setError(res.error);
    setRows(res.data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function choose(code: number | null) {
    if (busy) return;
    const ok = await confirmAction(
      code === null ? 'Kodu bırak' : `#${code} kodunu al`,
      code === null
        ? 'Kodun bırakılacak ve sana yeni, rastgele bir rumuz verilecek.'
        : `Rumuzun “Moderatör#${code}” olacak ve haftalık yenilemede değişmeyecek. Elindeki diğer kod bırakılır.`,
      code === null ? 'Bırak' : 'Al',
    );
    if (!ok) return;
    setBusy(true);
    const res = await callRpc<string>('admin_set_alias_code', { p_code: code }, TEXT);
    setBusy(false);
    if (res.error) {
      onNotice({ text: res.error, error: true });
    } else {
      onNotice({ text: `Rumuzun artık: ${res.data ?? ''}`, error: false });
      void refreshProfile();
    }
    void load();
  }

  const mineHeld = rows?.some((r) => r.mine) ?? false;

  return (
    <View style={styles.wrap}>
      <Text style={styles.info}>
        #41 ve #1000 yalnızca moderatörlere ayrılmıştır. Seçtiğin kodla rumuzun “Moderatör#41” gibi görünür; üyeler
        seni akışta @41 yazarak etiketleyebilir. Bir kodu aynı anda yalnızca bir moderatör kullanabilir.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : (
        rows.map((r) => {
          const free = !r.taken;
          return (
            <View key={r.code} style={[styles.card, r.mine && styles.cardMine]}>
              <Text style={styles.code}>#{r.code}</Text>
              <View style={styles.mid}>
                <Text style={styles.state}>{r.mine ? 'Senin kodun' : free ? 'Boşta' : 'Kullanımda'}</Text>
                {r.taken && !r.mine && r.holder ? (
                  <Text style={styles.holder} numberOfLines={1}>
                    {r.holder}
                  </Text>
                ) : null}
              </View>
              {r.mine ? (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              ) : (
                <Pressable
                  onPress={() => void choose(r.code)}
                  disabled={!free || busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !free || busy }}
                  style={[styles.btn, (!free || busy) && styles.btnOff]}
                >
                  <Text style={styles.btnText}>{free ? 'Seç' : 'Dolu'}</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
      {mineHeld ? (
        <Pressable onPress={() => void choose(null)} disabled={busy} accessibilityRole="button" style={styles.release}>
          <Text style={styles.releaseText}>Kodu bırak</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  info: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardMine: { borderColor: colors.primary },
  code: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.xl, minWidth: 72 },
  mid: { flex: 1, gap: 2 },
  state: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  holder: { color: colors.textMuted, fontSize: 12 },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.primary },
  btnOff: { backgroundColor: colors.surfaceAlt },
  btnText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  release: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  releaseText: { color: colors.danger, fontFamily: fonts.semi, fontSize: fontSizes.sm },
});
