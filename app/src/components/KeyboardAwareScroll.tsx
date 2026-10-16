import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import {
  Platform,
  ScrollView,
  TextInput,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';

import { onRevealRequest, scrollTargetFor, useKeyboardTop } from '@/lib/keyboard';

/**
 * `ScrollView` gibi kullanılır. Klavye açıkken (ya da başka bir yazı kutusuna geçilince) odaktaki kutu
 * klavyenin altında kalıyorsa içeriği kaydırıp kutuyu görünür yapar. Dışına `KeyboardLift` konursa
 * kaydırma alanı klavyenin üstünde biter, burası da kutuyu o alanın içinde görünür tutar.
 */
export const KeyboardAwareScroll = forwardRef<ScrollViewInstance, ScrollViewProps>(function KeyboardAwareScroll(
  { onScroll, onLayout, onContentSizeChange, children, ...rest },
  ref,
) {
  const scroll = useRef<ScrollViewInstance>(null);
  const content = useRef<ViewInstance>(null);
  useImperativeHandle(ref, () => scroll.current as ScrollViewInstance);

  const scrollY = useRef(0);
  const viewHeight = useRef(0);
  const contentHeight = useRef(0);
  const keyboardTop = useKeyboardTop();
  const keyboardTopRef = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    keyboardTopRef.current = keyboardTop;
  }, [keyboardTop]);

  const reveal = useCallback(() => {
    const top = keyboardTopRef.current;
    const view = scroll.current;
    const host = view?.getNativeScrollRef();
    const inner = content.current;
    if (Platform.OS === 'web' || top === null || !view || !host || !inner) return;
    const field = TextInput.State.currentlyFocusedInput();
    if (!field) return;
    host.measureInWindow((_x: number, viewTop: number, _w: number, height: number) => {
      // Kutu bu kaydırma alanının içinde değilse (başka bir pencerenin kutusu) ölçüm başarısız olur; dokunulmaz
      field.measureLayout(
        inner,
        (_fx, fieldTop, _fw, fieldHeight) => {
          const visible = Math.min(viewTop + height, top) - viewTop;
          const maxScroll = contentHeight.current - viewHeight.current;
          const next = scrollTargetFor(fieldTop, fieldHeight, scrollY.current, visible, maxScroll);
          if (Math.abs(next - scrollY.current) > 1) view.scrollTo({ y: next, animated: true });
        },
        () => {},
      );
    });
  }, []);

  const schedule = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(reveal, 80), setTimeout(reveal, 360)];
  }, [reveal]);

  // Klavye açılınca / değişince
  useEffect(() => {
    if (keyboardTop !== null) schedule();
  }, [keyboardTop, schedule]);
  // Klavye açıkken başka bir kutuya geçilince
  useEffect(() => onRevealRequest(schedule), [schedule]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      scrollEventThrottle={16}
      {...rest}
      ref={scroll}
      innerViewRef={content as RefObject<ViewInstance>}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      onLayout={(e: LayoutChangeEvent) => {
        viewHeight.current = e.nativeEvent.layout.height;
        onLayout?.(e);
      }}
      onContentSizeChange={(w, h) => {
        contentHeight.current = h;
        onContentSizeChange?.(w, h);
      }}
    >
      {children}
    </ScrollView>
  );
});
