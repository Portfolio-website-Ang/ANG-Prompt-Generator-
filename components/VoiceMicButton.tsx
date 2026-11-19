import React, { useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { transcribeAudio } from '../services/mentorClient';

interface VoiceMicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
}

const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({
  onTranscript,
  disabled = false,
  label = 'Speak (Urdu / English)',
}) => {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        for (const track of stream.getTracks()) track.stop();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 100) return;

        setTranscribing(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Failed to encode audio.'));
            reader.onload = () => {
              const result = String(reader.result || '');
              resolve(result.includes(',') ? result.split(',')[1] : result);
            };
            reader.readAsDataURL(blob);
          });

          const text = await transcribeAudio(base64, mimeType);
          if (text) {
            onTranscript(text);
          }
        } catch (err: any) {
          setError(err?.message || 'Voice transcription failed.');
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err: any) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access denied.'
          : 'Unable to access microphone.'
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || transcribing}
        onClick={recording ? stopRecording : startRecording}
        title={recording ? 'Stop recording and transcribe' : label}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap disabled:opacity-50 ${
          recording
            ? 'border-red-600 bg-red-600 text-white'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {transcribing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : recording ? (
          <Square className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Mic className="w-3.5 h-3.5" />
        )}
        <span>{transcribing ? 'Transcribing...' : recording ? 'Stop Mic' : label}</span>
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};

export default VoiceMicButton;
