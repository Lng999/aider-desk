import { useEffect, useRef } from 'react';

/**
 * Dispatches the editor text present at mount time into the CodeMirror view.
 *
 * The initial text is captured in a ref on the first render so the effect runs
 * only once and never re-dispatches when the live text changes afterwards. This
 * keeps the hook free of `react-hooks/exhaustive-deps` suppressions.
 */
export const useInitialEditorText = (text: string, dispatchEditorText: (value: string) => void): void => {
  const initialTextRef = useRef(text);

  useEffect(() => {
    const initialText = initialTextRef.current;
    if (!initialText) {
      return;
    }

    // we need to set the text when the component mounts and the text is not empty (e.g. Activity use case)
    const frame = requestAnimationFrame(() => {
      dispatchEditorText(initialText);
    });

    return () => cancelAnimationFrame(frame);
  }, [dispatchEditorText]);
};
