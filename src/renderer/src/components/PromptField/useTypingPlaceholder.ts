import { Compartment } from '@codemirror/state';
import { placeholder as cmPlaceholder, type EditorView } from '@codemirror/view';
import { useEffect, useMemo, useRef } from 'react';

const TYPING_INTERVAL_MS = 18;
const HOLD_MS = 5000;
const NEXT_PLACEHOLDER_DELAY_MS = 250;

type Args = {
  editorRef: { current: { view?: EditorView } | null };
  placeholders: string[];
  staticPlaceholder: string | null;
  enabled: boolean;
  hasText: boolean;
};

export const useTypingPlaceholder = ({ editorRef, placeholders, staticPlaceholder, enabled, hasText }: Args) => {
  const compartment = useMemo(() => new Compartment(), []);
  const placeholderExtension = useMemo(() => compartment.of(cmPlaceholder('')), [compartment]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIndexRef = useRef(0);
  const charCountRef = useRef(0);

  const isStatic = Boolean(staticPlaceholder);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const applyPlaceholder = (text: string) => {
      const view = editorRef.current?.view;
      view?.dispatch({ effects: compartment.reconfigure(text ? cmPlaceholder(text) : []) });
    };

    const pickNextIndex = (currentIndex: number) => {
      if (placeholders.length <= 1) {
        return 0;
      }
      const next = Math.floor(Math.random() * placeholders.length);
      return next === currentIndex ? (next + 1) % placeholders.length : next;
    };

    const tick = () => {
      timerRef.current = null;
      if (isStatic || placeholders.length === 0) {
        return;
      }
      const target = placeholders[currentIndexRef.current] ?? '';
      if (charCountRef.current < target.length) {
        charCountRef.current += 1;
        applyPlaceholder(target.slice(0, charCountRef.current));
        timerRef.current = setTimeout(tick, TYPING_INTERVAL_MS);
      } else {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          applyPlaceholder('');
          currentIndexRef.current = pickNextIndex(currentIndexRef.current);
          charCountRef.current = 0;
          timerRef.current = setTimeout(tick, NEXT_PLACEHOLDER_DELAY_MS);
        }, HOLD_MS);
      }
    };

    const startTyping = () => {
      currentIndexRef.current = pickNextIndex(currentIndexRef.current);
      charCountRef.current = 0;
      tick();
    };

    const stopTyping = (showFullText: boolean) => {
      clearTimer();
      if (showFullText) {
        applyPlaceholder(staticPlaceholder ?? placeholders[currentIndexRef.current] ?? '');
      }
    };

    const handleVisibilityChange = () => {
      if (isStatic || !enabled || hasText) {
        return;
      }
      if (document.hidden) {
        stopTyping(true);
      } else {
        startTyping();
      }
    };

    if (isStatic) {
      clearTimer();
      applyPlaceholder(staticPlaceholder ?? '');
    } else if (!enabled || hasText || document.hidden) {
      stopTyping(!hasText);
    } else {
      startTyping();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [compartment, editorRef, enabled, hasText, isStatic, placeholders, staticPlaceholder]);

  return { placeholderExtension };
};
