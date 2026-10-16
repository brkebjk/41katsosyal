import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dimensions, Platform, View, type StyleProp, type ViewStyle, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { liftFor, useKeyboardHeight, useKeyboardTop } from '@/lib/keyboard';

type Props = {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Açılan bir pencerenin (Modal) içindeyse: Android'de pencere koordinatı kaydığı için ek hesap yapılır */
  inModal?: boolean;
};

/**
 * Klavye açılınca içeriği klavyenin üstünde kalacak kadar yukarı iter (altına boşluk koyar).
 * `KeyboardAvoidingView` yerine kullanılır: o, "pageSheet" gibi ekranın tamamını kaplamayan pencerelerde
 * ve alt menülü ekranlarda eksik boşluk bırakıp yazı kutusunu klavyenin altında bırakabiliyordu.
 * Burada kutunun ekrandaki gerçek alt kenarı ölçülür; yalnızca klavyenin altına giren kadar boşluk eklenir.
 */
/** Android'de yazı kutusu ile klavye (öneri şeridi) arasında bırakılan küçük boşluk (dp) */
const EXTRA_GAP = 6;

export function KeyboardLift({ style, children, inModal = false }: Props) {
  const keyboardTop = useKeyboardTop();
  const ref = useRef<ViewInstance>(null);
  const [bottom, setBottom] = useState<number | null>(null);

  // Klavye açılınca kutunun ekrandaki alt kenarı ölçülür. Klavye ve ekran aynı anda değişebildiği için
  // iki kez ölçülür (hemen ve animasyon bittikten sonra).
  useEffect(() => {
    if (keyboardTop === null) return;
    const measure = () => ref.current?.measureInWindow((_x, y, _w, h) => setBottom(y + h));
    const timers = [setTimeout(measure, 30), setTimeout(measure, 320)];
    return () => timers.forEach(clearTimeout);
  }, [keyboardTop]);

  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  // 1) Ekran koordinatıyla: alanın alt kenarı klavyenin üst kenarını ne kadar geçiyor
  const byScreen = bottom === null ? 0 : liftFor(bottom, keyboardTop);
  // 2) Android: React Native klavye yüksekliğini alttaki gezinme çubuğu (geri/ana ekran tuşları) DÜŞÜLMÜŞ olarak bildirir.
  //    Klavyenin üstündeki öneri şeridi de bu yüzden hesaba girmiyordu. Açılan pencereler (Modal) ekranın tamamını
  //    kapladığı için (statusBarTranslucent + navigationBarTranslucent) klavyenin gerçek üst kenarı:
  //    ekran yüksekliği − (klavye + gezinme çubuğu). Biraz pay bırakılır. İki hesabın büyüğü kullanılır.
  const byHeight =
    inModal && Platform.OS === 'android' && bottom !== null && keyboardTop !== null && keyboardHeight > 0
      ? Math.max(0, Math.round(bottom - (Dimensions.get('screen').height - keyboardHeight - insets.bottom) + EXTRA_GAP))
      : 0;
  const lift = Math.max(byScreen, byHeight);
  return (
    <View ref={ref} collapsable={false} style={[style, lift > 0 && { paddingBottom: lift }]}>
      {children}
    </View>
  );
}
