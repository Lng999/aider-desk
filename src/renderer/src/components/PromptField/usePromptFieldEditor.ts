import { Annotation, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useCallback, useRef } from 'react';

const External = Annotation.define<boolean>();

/**
 * Owns the CodeMirror editor ref and the imperative helper that replaces the
 * whole editor content.
 *
 * Keeping the `editorRef.current` read encapsulated in this hook hides it behind
 * the hook boundary, so callbacks that call `dispatchEditorText` (e.g. submit /
 * command handlers wired into CodeMirror keymaps) are not treated by the React
 * Compiler as reading a ref during render.
 */
export const usePromptFieldEditor = () => {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const dispatchEditorText = useCallback((value: string) => {
    const view = editorRef.current?.view;
    view?.dispatch({
      changes: { from: 0, to: view.state.doc.toString().length, insert: value },
      annotations: [External.of(true)],
    });
  }, []);

  const registerEditor = useCallback((instance: ReactCodeMirrorRef) => {
    editorRef.current = instance;
  }, []);

  return { editorRef, dispatchEditorText, registerEditor };
};
