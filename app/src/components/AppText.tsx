// GEÇİCİ (yazı düzenleme modu): react-native'in Text bileşeninin yerine geçer. Düzenleme modu kapalıyken ve düzeltme
// yokken Text'in birebir aynısıdır. Uygulamadaki sabit bir yazı (uiStrings.generated) için:
//   * moderatör düzeltme yaptıysa düzeltilmiş hali gösterilir (herkeste),
//   * düzenleme modu açıksa (yalnızca moderatör) altı noktalı çizilir ve uzun basınca düzenleme penceresi açılır.
// Kaldırırken: dosyalardaki `import { Text } from '@/components/AppText'` satırları yeniden react-native'e çevrilir.

import { forwardRef, useSyncExternalStore, type ReactNode } from 'react';
import { Text as RNText, type TextInstance, type TextProps } from 'react-native';

import { getTextEditState, openTextEditor, subscribeTextEdit } from '@/lib/textEdit';
import { UI_STRINGS } from '@/lib/uiStrings.generated';

/** Yalnızca düz yazıdan oluşan içerik (iç içe Text ya da sayı varsa düzenlenmez) */
function plainString(children: ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.length > 0 && children.every((c) => typeof c === 'string')) {
    return (children as string[]).join('');
  }
  return null;
}

export type Text = TextInstance;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- tür ve bileşen aynı adı taşır (react-native Text gibi)
export const Text = forwardRef<TextInstance, TextProps>(function AppText(props, ref) {
  const st = useSyncExternalStore(subscribeTextEdit, getTextEditState, getTextEditState);
  if (!st.editing && st.overrides.size === 0) return <RNText ref={ref} {...props} />;
  const src = plainString(props.children);
  if (src === null || !UI_STRINGS.has(src)) return <RNText ref={ref} {...props} />;
  const shown = st.overrides.get(src) ?? src;
  if (!st.editing) {
    return (
      <RNText ref={ref} {...props}>
        {shown}
      </RNText>
    );
  }
  return (
    <RNText
      ref={ref}
      {...props}
      onLongPress={() => openTextEditor(src)}
      style={[props.style, EDIT_STYLE]}
    >
      {shown}
    </RNText>
  );
});

const EDIT_STYLE = {
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: '#E8A400',
} as const;
