import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Trash2,
  Wand2,
} from 'lucide-react';
import { LanguagePreference, TalkTranscriptEntry } from '../types';
import { LANGUAGE_PREFERENCES, LIVE_VOICE_OPTIONS } from '../constants';

interface TalkModeViewProps {
  languagePref: LanguagePreference;
  setLanguagePref: (lang: LanguagePreference) => void;
  onForgeFromTranscript: (transcriptText: string) => void;
}

type TalkFocus = 'prompt_mentor' | 'fullstack' | 'agent_mcp';
type ConnectionState = 'idle' | 'connecting' | 'live' | 'error';

function floatTo16BitPcmBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

const TalkModeView: React.FC<TalkModeViewProps> = ({
  languagePref,
  setLanguagePref,
  onForgeFromTranscript,
}) => {
  const [voice, setVoice] = useState<'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir'>('Zephyr');
  const [focus, setFocus] = useState<TalkFocus>('prompt_mentor');
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [transcript, setTranscript] = useState<TalkTranscriptEntry[]>([]);
  const [textNote, setTextNote] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isMutedRef = useRef<boolean>(false);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const stopPlaybackQueue = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  const cleanupCall = useCallback(() => {
    stopPlaybackQueue();
    try {
      processorRef.current?.disconnect();
    } catch {
      // Ignore
    }
    processorRef.current = null;

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
    setMicLevel(0);
  }, [stopPlaybackQueue]);

  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  const appendTranscriptDelta = useCallback((role: 'user' | 'assistant', delta: string) => {
    if (!delta) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${delta}`,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          text: delta,
          timestamp: Date.now(),
        },
      ];
    });
  }, []);

  const playPcmChunk = useCallback((base64: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const samples = base64PcmToFloat32(base64);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(nextStartTimeRef.current, ctx.currentTime);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  }, []);

  const handleStartCall = async () => {
    if (status === 'connecting' || status === 'live') return;
    setErrorMsg(null);
    setStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/live?voice=${encodeURIComponent(
        voice
      )}&lang=${encodeURIComponent(languagePref)}&focus=${encodeURIComponent(focus)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.ready) {
            setStatus('live');
          }
          if (msg.audio) {
            playPcmChunk(msg.audio);
          }
          if (msg.inputTranscript) {
            appendTranscriptDelta('user', msg.inputTranscript);
          }
          if (msg.outputTranscript) {
            appendTranscriptDelta('assistant', msg.outputTranscript);
          }
          if (msg.interrupted) {
            stopPlaybackQueue();
          }
          if (msg.error) {
            setErrorMsg(String(msg.error));
            setStatus('error');
            cleanupCall();
          }
          if (msg.closed) {
            setStatus('idle');
            cleanupCall();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMsg('Live voice WebSocket connection failed. Please try again.');
        setStatus('error');
        cleanupCall();
      };

      ws.onclose = () => {
        setStatus((curr) => (curr === 'error' ? 'error' : 'idle'));
        cleanupCall();
      };

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      const silentGain = inputCtx.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(inputCtx.destination);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const channelData = e.inputBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < channelData.length; i++) {
          sumSq += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSq / channelData.length);
        setMicLevel(isMutedRef.current ? 0 : Math.min(100, Math.round(rms * 350)));

        if (isMutedRef.current) return;
        const activeWs = wsRef.current;
        if (activeWs && activeWs.readyState === WebSocket.OPEN) {
          const base64 = floatTo16BitPcmBase64(channelData);
          activeWs.send(JSON.stringify({ audio: base64 }));
        }
      };
    } catch (err: any) {
      setErrorMsg(
        err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow mic access in your browser to use Talk Mode.'
          : err?.message || 'Could not start Live Voice session.'
      );
      setStatus('error');
      cleanupCall();
    }
  };

  const handleEndCall = () => {
    cleanupCall();
    setStatus('idle');
  };

  const handleSendTextNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textNote.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: trimmed }));
    appendTranscriptDelta('user', trimmed);
    setTextNote('');
  };

  const handleBuildPromptFromTalk = () => {
    if (transcript.length === 0) return;
    const formatted = transcript
      .map((t) => `${t.role === 'user' ? 'User' : 'ANG Mentor'}: ${t.text.trim()}`)
      .join('\n');
    onForgeFromTranscript(
      `Turn this live voice conversation into a precision Master AI-to-AI Prompt and Execution Plan:\n\n${formatted}`
    );
  };

  const isCallActive = status === 'live' || status === 'connecting';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Heading */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              ANG Talk Mode — Live Voice Mentor
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Speak naturally in Urdu, Roman Urdu, or English. Talk through your idea or coding bug in real time, then convert the conversation directly into a Master AI Prompt.
            </p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
            <span>Model: gemini-3.8-live</span>
            <span aria-hidden="true"> · </span>
            <span>16kHz In / 24kHz Out</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Control Panel */}
          <section className="lg:col-span-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            {/* Language Setting */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Spoken Language Preference
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {LANGUAGE_PREFERENCES.map((lp) => (
                  <button
                    key={lp.value}
                    type="button"
                    disabled={isCallActive}
                    onClick={() => setLanguagePref(lp.value)}
                    className={`px-3.5 py-2.5 text-left rounded-lg border transition-colors disabled:opacity-60 ${
                      languagePref === lp.value
                        ? 'border-blue-600 bg-blue-600/10 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <p className="text-xs font-semibold">{lp.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{lp.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Focus Mode */}
            <div>
              <label
                htmlFor="talk-focus"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Conversation Focus
              </label>
              <select
                id="talk-focus"
                value={focus}
                disabled={isCallActive}
                onChange={(e) => setFocus(e.target.value as TalkFocus)}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="prompt_mentor">AI Prompt &amp; Idea Coach</option>
                <option value="fullstack">Full-Stack &amp; Code Problem Solver</option>
                <option value="agent_mcp">Agent &amp; MCP Systems Architect</option>
              </select>
            </div>

            {/* Voice Selection */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Mentor Voice Persona
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LIVE_VOICE_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    disabled={isCallActive}
                    onClick={() => setVoice(v.value)}
                    title={v.tone}
                    className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors disabled:opacity-60 ${
                      voice === v.value
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mic Level Meter & Call Controls */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>
                    {status === 'live'
                      ? isMuted
                        ? 'Microphone muted'
                        : 'Live voice active — speak naturally'
                      : status === 'connecting'
                      ? 'Connecting voice session...'
                      : 'Ready for live voice conversation'}
                  </span>
                  <span>{status === 'live' ? `${micLevel}%` : 'Idle'}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-100"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {!isCallActive ? (
                  <button
                    type="button"
                    onClick={handleStartCall}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Start Voice Call</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsMuted((m) => !m)}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg border transition-colors ${
                        isMuted
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleEndCall}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                    >
                      {status === 'connecting' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <PhoneOff className="w-4 h-4" />
                      )}
                      <span>{status === 'connecting' ? 'Cancel' : 'End Call'}</span>
                    </button>
                  </>
                )}
              </div>

              {errorMsg && (
                <div
                  className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300 flex items-start gap-2 text-xs"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          </section>

          {/* Right Transcript & Prompt Forge Bridge */}
          <section className="lg:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[520px]">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Live Voice Transcript
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {transcript.length} turns recorded
                </p>
              </div>

              <div className="flex items-center gap-2">
                {transcript.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setTranscript([])}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBuildPromptFromTalk}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Turn Talk into Forged Prompt</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3 max-h-[420px]">
              {transcript.length === 0 ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-4">
                  <Mic className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  <p className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                    Press Start Voice Call and just talk naturally
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                    Aap Urdu, Roman Urdu, ya English mein apna idea bol sakte hain. ANG aapki baat sun kar samjhega, sawal poochega, aur phir ek click mein aapka Master AI Prompt bana dega.
                  </p>
                </div>
              ) : (
                transcript.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-3.5 rounded-lg border text-sm leading-relaxed ${
                      entry.role === 'user'
                        ? 'bg-slate-100/80 dark:bg-[#161E2E] border-slate-200 dark:border-slate-700 ml-6'
                        : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 mr-6'
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 tabular-nums">
                      {entry.role === 'user' ? 'You' : 'ANG Mentor'}
                      <span aria-hidden="true"> · </span>
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap">{entry.text}</p>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Optional Mid-Call Text Note */}
            <form
              onSubmit={handleSendTextNote}
              className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1420] rounded-b-xl flex items-center gap-2"
            >
              <input
                type="text"
                value={textNote}
                disabled={status !== 'live'}
                onChange={(e) => setTextNote(e.target.value)}
                placeholder={
                  status === 'live'
                    ? 'Send a quick text note or URL during your voice call...'
                    : 'Start a voice call to send live text notes'
                }
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={status !== 'live' || !textNote.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TalkModeView;
