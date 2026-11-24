import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useInitialEditorText } from '../useInitialEditorText';

describe('useInitialEditorText', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('dispatches the initial text once on mount when it is not empty', () => {
    const dispatchEditorText = vi.fn();

    renderHook(() => useInitialEditorText('restored draft', dispatchEditorText));

    expect(dispatchEditorText).toHaveBeenCalledTimes(1);
    expect(dispatchEditorText).toHaveBeenCalledWith('restored draft');
  });

  it('does not dispatch when the initial text is empty', () => {
    const dispatchEditorText = vi.fn();

    renderHook(() => useInitialEditorText('', dispatchEditorText));

    expect(dispatchEditorText).not.toHaveBeenCalled();
  });

  it('captures only the mount-time text and does not re-dispatch when text changes', () => {
    const dispatchEditorText = vi.fn();

    const { rerender } = renderHook(({ text }) => useInitialEditorText(text, dispatchEditorText), {
      initialProps: { text: 'initial' },
    });

    expect(dispatchEditorText).toHaveBeenCalledTimes(1);
    expect(dispatchEditorText).toHaveBeenCalledWith('initial');

    rerender({ text: 'typed more' });
    rerender({ text: 'typed even more' });

    expect(dispatchEditorText).toHaveBeenCalledTimes(1);
    expect(dispatchEditorText).toHaveBeenCalledWith('initial');
  });

  it('cancels the pending animation frame on unmount', () => {
    const dispatchEditorText = vi.fn();

    const { unmount } = renderHook(() => useInitialEditorText('draft', dispatchEditorText));
    unmount();

    expect(cafSpy).toHaveBeenCalled();
  });
});
