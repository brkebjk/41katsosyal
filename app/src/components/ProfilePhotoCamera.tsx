import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Kamera izni açıklaması (izin istenmeden önce gösterilir) */
export const CAMERA_REASON =
  'Cihaz dosyalarınız bizi ilgilendirmiyor. Kişi gerçekliğini maksimize etmek ve küçük yaşta kullanıcıların önüne geçmek için profil fotoğrafı eklemek için sadece kameranı kullanabilirsin.';

/** Çekilen resim kare kırpılır ve küçültülür (2 MB sınırının çok altında kalır) */
const SIZE = 720;

/**
 * Profil resmi: yalnızca uygulama içindeki kamerayla çekilir (galeriden seçilemez). Ön / arka kamera seçilebilir.
 * Çekilen kare resim önizlenir; "Kullan" denince `onDone` yerel dosya adresiyle çağrılır.
 */
export function ProfilePhotoCamera({ onDone, onClose }: { onDone: (uri: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function take() {
    if (!camera.current || busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.85, shutterSound: false });
      if (!pic?.uri) throw new Error('no_picture');
      const side = Math.min(pic.width, pic.height);
      const ctx = ImageManipulator.manipulate(pic.uri)
        .crop({ originX: (pic.width - side) / 2, originY: (pic.height - side) / 2, width: side, height: side })
        .resize({ width: SIZE, height: SIZE });
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
      setShot(out.uri);
    } catch {
      setError('Fotoğraf çekilemedi. Tekrar dene.');
    }
    setBusy(false);
  }

  let body: React.ReactNode;
  if (!permission) {
    body = <ActivityIndicator color={colors.primary} style={styles.center} />;
  } else if (!permission.granted) {
    // İzin istenmeden önce nedeni açıklanır; kalıcı olarak reddedildiyse telefon ayarlarına yönlendirilir
    body = (
      <View style={styles.permission}>
        <Ionicons name="camera" size={48} color={colors.primary} />
        <Text style={styles.permTitle}>Kamera izni</Text>
        <Text style={styles.permText}>{CAMERA_REASON}</Text>
        {permission.canAskAgain ? (
          <PrimaryButton label="Kameraya izin ver" onPress={() => void requestPermission()} />
        ) : (
          <>
            <Text style={styles.permHint}>
              Kamera izni kapalı. Telefonun ayarlarından 41. Kat Sosyal için kamera iznini açabilirsin.
            </Text>
            <PrimaryButton label="Ayarları aç" onPress={() => void Linking.openSettings()} />
          </>
        )}
        <PrimaryButton label="Vazgeç" variant="ghost" onPress={onClose} />
      </View>
    );
  } else if (shot) {
    body = (
      <View style={styles.previewWrap}>
        <Image source={{ uri: shot }} style={styles.preview} contentFit="cover" />
        <View style={styles.row}>
          <PrimaryButton label="Tekrar çek" variant="ghost" onPress={() => setShot(null)} />
          <PrimaryButton label="Kullan" onPress={() => onDone(shot)} testID="photo-camera-use" />
        </View>
      </View>
    );
  } else {
    body = (
      <View style={styles.camWrap}>
        <View style={styles.frame}>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mirror={facing === 'front'}
            onCameraReady={() => setReady(true)}
            onMountError={() => setError('Kamera açılamadı.')}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.controls}>
          <View style={styles.side} />
          <Pressable
            onPress={() => void take()}
            disabled={busy || !ready}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf çek"
            testID="photo-camera-shutter"
            style={({ pressed }) => [styles.shutter, (pressed || busy) && styles.shutterPressed]}
          >
            {busy ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
          </Pressable>
          <Pressable
            onPress={() => {
              setReady(false);
              setFacing((f) => (f === 'front' ? 'back' : 'front'));
            }}
            accessibilityRole="button"
            accessibilityLabel={facing === 'front' ? 'Arka kameraya geç' : 'Ön kameraya geç'}
            hitSlop={10}
            style={({ pressed }) => [styles.side, styles.flip, pressed && styles.shutterPressed]}
          >
            <Ionicons name="camera-reverse" size={28} color={colors.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.root}>
        <View style={styles.head}>
          <Text style={styles.title}>Profil fotoğrafı çek</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>
        {body}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  center: { flex: 1 },
  permission: { flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: spacing.md, padding: spacing.xl },
  permTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  permText: { color: colors.text, fontSize: fontSizes.md, lineHeight: 23, textAlign: 'center' },
  permHint: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 19, textAlign: 'center' },
  camWrap: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.lg },
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: '#000000',
  },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  side: { width: 52, height: 52 },
  flip: { alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: colors.surface },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.6 },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary },
  previewWrap: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.lg },
  preview: { width: '100%', aspectRatio: 1, borderRadius: radii.lg },
  row: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
});
