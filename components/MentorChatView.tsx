import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  Square,
  Wand2,
} from 'lucide-react';
import { LanguagePreference, AttachmentItem, MentorMessage, TargetDomain, ThinkingDepth } from '../types';
import { LANGUAGE_PREFERENCES, TARGET_DOMAINS } from '../constants';
import ContextToolkit from './ContextToolkit';
import MarkdownRenderer from './MarkdownRenderer';
import VoiceMicButton from './VoiceMicButton';

interface MentorChatViewProps {
  messages: MentorMessage[];
  focusDomain: TargetDomain;
  setFocusDomain: (domain: TargetDomain) => void;
  languagePref: LanguagePreference;
  setLanguagePref: (lang: LanguagePreference) => void;
  thinkingDepth: ThinkingDepth;
  setThinkingDepth: (depth: ThinkingDepth) => void;
  useWebSearch: boolean;
  setUseWebSearch: (val: boolean) => void;
  urls: string[];
  setUrls: React.Dispatch<React.SetStateAction<string[]>>;
  attachments: AttachmentItem[];
  setAttachments: React.Dispatch<React.SetStateAction<AttachmentItem[]>>;
  isStreaming: boolean;
  error: string | null;
  onSendMessage: (text: string) => void;
  onStop: () => void;
  onConvertToForge: (text: string, domain: TargetDomain) => void;
}

const MentorChatView: React.FC<MentorChatViewProps> = ({
  messages,
  focusDomain,
  setFocusDomain,
  languagePref,
  setLanguagePref,
  thinkingDepth,
  setThinkingDepth,
  useWebSearch,
  setUseWebSearch,
  urls,
  setUrls,
  attachments,
  setAttachments,
  isStreaming,
  error,
  onSendMessage,
  onStop,
  onConvertToForge,
}) => {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Workspace Header Bar */}
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1420] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Full-Stack &amp; AI Problem-Solving Mentor
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Interactive root-cause debugging, architecture design, UX psychology, and AI workflow mentoring
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="mentor-lang" className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Language:
            </label>
            <select
              id="mentor-lang"
              value={languagePref}
              disabled={isStreaming}
              onChange={(e) => setLanguagePref(e.target.value as LanguagePreference)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LANGUAGE_PREFERENCES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="mentor-focus" className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Focus:
            </label>
            <select
              id="mentor-focus"
              value={focusDomain}
              disabled={isStreaming}
              onChange={(e) => setFocusDomain(e.target.value as TargetDomain)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TARGET_DOMAINS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Messages Timeline */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Ask anything—architecture, code bugs, UX, or AI strategy
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
                Attach your code files, error screenshots, or documentation URLs below. ANG reads everything, understands your real goal, and walks you straight to a working solution.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto pt-4 text-left">
                {[
                  'Review my React + Express architecture for bottlenecks and security gaps.',
                  'Help me fix a complex state & API race condition with clean TypeScript code.',
                  'Analyze why users abandon my onboarding flow and redesign the UX.',
                  'Turn my rough Roman Urdu project idea into a step-by-step full-stack roadmap.',
                ].map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => onSendMessage(starter)}
                    className="p-3.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-500 transition-colors text-left"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`rounded-xl border p-4 sm:p-5 ${
                    isUser
                      ? 'bg-slate-100/80 dark:bg-[#161E2E] border-slate-200 dark:border-slate-700 ml-0 sm:ml-10'
                      : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 mr-0 sm:mr-6'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {isUser ? 'You' : 'ANG Mentor'}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{msg.attachmentNames.join(', ')}</span>
                        </>
                      )}
                    </div>

                    {!isUser && msg.content && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onConvertToForge(msg.content, focusDomain)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 rounded hover:bg-blue-500/10 transition-colors"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>Forge Prompt</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isUser ? (
                    <p className="text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  ) : msg.content ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span>Reasoning and inspecting context...</span>
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                        Grounded Sources
                      </p>
                      <ul className="space-y-1">
                        {msg.sources.map((src) => (
                          <li key={src.uri} className="text-xs flex items-center gap-2">
                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                            <a
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                            >
                              {src.title || src.uri}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {error && (
            <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300 flex items-start gap-3" role="alert">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom Composer */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1420] px-4 sm:px-6 lg:px-8 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-3">
          <ContextToolkit
            attachments={attachments}
            setAttachments={setAttachments}
            urls={urls}
            setUrls={setUrls}
            useWebSearch={useWebSearch}
            setUseWebSearch={setUseWebSearch}
            thinkingDepth={thinkingDepth}
            setThinkingDepth={setThinkingDepth}
            disabled={isStreaming}
          />

          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={input}
              disabled={isStreaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask ANG Mentor anything (Urdu, Roman Urdu, or English)... Enter to send, Shift+Enter for new line"
              className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-40"
            />
            <VoiceMicButton
              disabled={isStreaming}
              label="Mic"
              onTranscript={(text) => setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors shrink-0"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed text-white transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default MentorChatView;
