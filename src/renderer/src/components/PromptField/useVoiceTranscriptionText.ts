import { useEffect, useRef, useState } from 'react';

type Params = {
  text: string;
  isRecording: boolean;
  isProcessing: boolean;
  transcription: string;
  resetTranscription: () => void;
  setText: (value: string) => void;
};

/**
 * Keeps the editor text in sync with the voice recorder transcription.
 *
 * When recording starts, the current text is captured so the transcription is
 * appended to it. When recording stops, the recorder state is reset. The live
 * `text` and `transcription` values are read through refs synced in dedicated
 * effects so the transition effect only depends on `isRecording`, avoiding
 * `react-hooks/exhaustive-deps` suppressions and spurious re-runs on keystrokes.
 */
export const useVoiceTranscriptionText = ({ text, isRecording, isProcessing, transcription, resetTranscription, setText }: Params): void => {
  const [textBeforeRecording, setTextBeforeRecording] = useState('');
  const textRef = useRef(text);
  const transcriptionRef = useRef(transcription);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    transcriptionRef.current = transcription;
  }, [transcription]);

  useEffect(() => {
    if (isRecording) {
      setTextBeforeRecording(textRef.current);
    } else if (transcriptionRef.current) {
      // When recording stops, keep the already-applied text and reset the
      // recorder state so the next session starts clean.
      resetTranscription();
      setTextBeforeRecording('');
    }
  }, [isRecording, resetTranscription]);

  useEffect(() => {
    if ((isRecording || isProcessing) && transcription) {
      const separator = textBeforeRecording && !textBeforeRecording.endsWith(' ') ? ' ' : '';
      setText(textBeforeRecording + separator + transcription);
    }
  }, [transcription, isRecording, isProcessing, textBeforeRecording, setText]);
};
