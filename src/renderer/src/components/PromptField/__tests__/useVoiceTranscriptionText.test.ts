import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useVoiceTranscriptionText } from '../useVoiceTranscriptionText';

type Props = {
  text: string;
  isRecording: boolean;
  isProcessing: boolean;
  transcription: string;
  resetTranscription: () => void;
  setText: (value: string) => void;
};

const renderVoiceHook = (initialProps: Props) => renderHook((props: Props) => useVoiceTranscriptionText(props), { initialProps });

describe('useVoiceTranscriptionText', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('appends the transcription to the text captured when recording started', () => {
    const setText = vi.fn();
    const resetTranscription = vi.fn();

    const { rerender } = renderVoiceHook({
      text: 'existing',
      isRecording: false,
      isProcessing: false,
      transcription: '',
      resetTranscription,
      setText,
    });

    // Start recording: current text is captured as the prefix.
    rerender({ text: 'existing', isRecording: true, isProcessing: false, transcription: '', resetTranscription, setText });
    expect(setText).not.toHaveBeenCalled();

    // Transcription streams in while recording.
    rerender({ text: 'existing', isRecording: true, isProcessing: false, transcription: 'hello world', resetTranscription, setText });

    expect(setText).toHaveBeenCalledWith('existing hello world');
  });

  it('does not add a separator when there is no text before recording', () => {
    const setText = vi.fn();
    const resetTranscription = vi.fn();

    const { rerender } = renderVoiceHook({
      text: '',
      isRecording: false,
      isProcessing: false,
      transcription: '',
      resetTranscription,
      setText,
    });

    rerender({ text: '', isRecording: true, isProcessing: false, transcription: '', resetTranscription, setText });
    rerender({ text: '', isRecording: true, isProcessing: false, transcription: 'dictated', resetTranscription, setText });

    expect(setText).toHaveBeenCalledWith('dictated');
  });

  it('does not duplicate the separator when the captured text already ends with a space', () => {
    const setText = vi.fn();
    const resetTranscription = vi.fn();

    const { rerender } = renderVoiceHook({
      text: 'foo ',
      isRecording: false,
      isProcessing: false,
      transcription: '',
      resetTranscription,
      setText,
    });

    rerender({ text: 'foo ', isRecording: true, isProcessing: false, transcription: '', resetTranscription, setText });
    rerender({ text: 'foo ', isRecording: true, isProcessing: false, transcription: 'bar', resetTranscription, setText });

    expect(setText).toHaveBeenCalledWith('foo bar');
  });

  it('keeps appending to the text captured at the start while more transcription arrives', () => {
    const setText = vi.fn();
    const resetTranscription = vi.fn();

    const { rerender } = renderVoiceHook({
      text: 'base',
      isRecording: false,
      isProcessing: false,
      transcription: '',
      resetTranscription,
      setText,
    });

    rerender({ text: 'base', isRecording: true, isProcessing: false, transcription: '', resetTranscription, setText });
    rerender({ text: 'base', isRecording: true, isProcessing: false, transcription: 'one', resetTranscription, setText });
    // The editor text now reflects the combined value, but the start prefix stays "base".
    rerender({ text: 'base one', isRecording: true, isProcessing: false, transcription: 'one two', resetTranscription, setText });

    expect(setText).toHaveBeenLastCalledWith('base one two');
  });

  it('still applies the transcription while the recorder is processing the final chunk', () => {
    const setText = vi.fn();
    const resetTranscription = vi.fn();

    const { rerender } = renderVoiceHook({
      text: 'draft',
      isRecording: false,
      isProcessing: false,
      transcription: '',
      resetTranscription,
      setText,
    });

    rerender({ text: 'draft', isRecording: true, isProcessing: false, transcription: '', resetTranscription, setText });
    // Recording ended but processing is still finishing: the text keeps updating.
    rerender({ text: 'draft', isRecording: false, isProcessing: true, transcription: 'final', resetTranscription, setText });

    expect(setText).toHaveBeenCalledWith('draft final');
  });

  it('resets the recorder state when recording stops with a transcription present', () => {
    const setText = vi.fn();
    const resetTranscription = vi.fn();

    const { rerender } = renderVoiceHook({
      text: 'existing',
      isRecording: false,
      isProcessing: false,
      transcription: '',
      resetTranscription,
      setText,
    });

    rerender({ text: 'existing', isRecording: true, isProcessing: false, transcription: '', resetTranscription, setText });
    rerender({ text: 'existing', isRecording: true, isProcessing: false, transcription: 'hello', resetTranscription, setText });
    expect(resetTranscription).not.toHaveBeenCalled();

    // Stop recording with a transcription present.
    rerender({ text: 'existing hello', isRecording: false, isProcessing: false, transcription: 'hello', resetTranscription, setText });

    expect(resetTranscription).toHaveBeenCalledTimes(1);
  });

  it('does not reset when recording never produced a transcription', () => {
    const setText = vi.fn();
    const resetTranscription = vi.fn();

    const { rerender } = renderVoiceHook({
      text: 'existing',
      isRecording: false,
      isProcessing: false,
      transcription: '',
      resetTranscription,
      setText,
    });

    rerender({ text: 'existing', isRecording: true, isProcessing: false, transcription: '', resetTranscription, setText });
    rerender({ text: 'existing', isRecording: false, isProcessing: false, transcription: '', resetTranscription, setText });

    expect(resetTranscription).not.toHaveBeenCalled();
    expect(setText).not.toHaveBeenCalled();
  });
});
