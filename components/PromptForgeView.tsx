import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  AgentArchitecture,
  AttachmentItem,
  ExecutionMode,
  ForgeVersion,
  GroundingSource,
  LanguagePreference,
  McpConfig,
  PromptEvaluation,
  PromptStyle,
  TargetDomain,
  TargetModelFamily,
  ThinkingDepth,
  TokenOptimizationMode,
  TokenOptimizationResult,
} from '../types';
import {
  AGENT_ARCHITECTURES,
  EXECUTION_MODES,
  LANGUAGE_PREFERENCES,
  MCP_SKILL_PRESETS,
  PROMPT_STYLES,
  QUICK_REFINEMENTS,
  TARGET_DOMAINS,
  TARGET_MODEL_FAMILIES,
  TOKEN_MODES,
} from '../constants';
import { estimateTokens, parseForgeMarkdown, synthesizeSpeech } from '../services/mentorClient';
import {
  buildForgeExportCsv,
  buildForgeExportJson,
  triggerFileDownload,
} from '../services/promptAnalytics';
import ContextToolkit from './ContextToolkit';
import MarkdownRenderer from './MarkdownRenderer';
import PromptTokenAnalytics from './PromptTokenAnalytics';
import VoiceMicButton from './VoiceMicButton';

interface PromptForgeViewProps {
  rawIdea: string;
  setRawIdea: (val: string) => void;
  targetDomain: TargetDomain;
  setTargetDomain: (val: TargetDomain) => void;
  style: PromptStyle;
  setStyle: (val: PromptStyle) => void;
  thinkingDepth: ThinkingDepth;
  setThinkingDepth: (val: ThinkingDepth) => void;
  executionMode: ExecutionMode;
  setExecutionMode: (val: ExecutionMode) => void;
  agentArchitecture: AgentArchitecture;
  setAgentArchitecture: (val: AgentArchitecture) => void;
  tokenMode: TokenOptimizationMode;
  setTokenMode: (val: TokenOptimizationMode) => void;
  languagePref: LanguagePreference;
  setLanguagePref: (val: LanguagePreference) => void;
  mcpConfig: McpConfig;
  setMcpConfig: React.Dispatch<React.SetStateAction<McpConfig>>;
  useWebSearch: boolean;
  setUseWebSearch: (val: boolean) => void;
  urls: string[];
  setUrls: React.Dispatch<React.SetStateAction<string[]>>;
  attachments: AttachmentItem[];
  setAttachments: React.Dispatch<React.SetStateAction<AttachmentItem[]>>;
  outputMarkdown: string;
  sources: GroundingSource[];
  isStreaming: boolean;
  error: string | null;
  evaluation: PromptEvaluation | null;
  isEvaluating: boolean;
  evaluationError: string | null;
  isOptimizing: boolean;
  optimizationResult: TokenOptimizationResult | null;
  optimizationError: string | null;
  versions: ForgeVersion[];
  activeVersionId: string | null;
  onRevertVersion: (version: ForgeVersion) => void;
  onEvaluate: (promptText: string) => void;
  onOptimizeTokens: (promptText: string, mode: 'balanced' | 'ultra_lean') => void;
  onForge: (refinementInstruction?: string, previousPrompt?: string) => void;
  onStop: () => void;
  onSendToMentor: (promptText: string, domain: TargetDomain) => void;
}

type OutputTab = 'master' | 'analytics' | 'diagnosis' | 'blueprint' | 'evaluate' | 'history' | 'all';

const PromptForgeView: React.FC<PromptForgeViewProps> = ({
  rawIdea,
  setRawIdea,
  targetDomain,
  setTargetDomain,
  style,
  setStyle,
  thinkingDepth,
  setThinkingDepth,
  executionMode,
  setExecutionMode,
  agentArchitecture,
  setAgentArchitecture,
  tokenMode,
  setTokenMode,
  languagePref,
  setLanguagePref,
  mcpConfig,
  setMcpConfig,
  useWebSearch,
  setUseWebSearch,
  urls,
  setUrls,
  attachments,
  setAttachments,
  outputMarkdown,
  sources,
  isStreaming,
  error,
  evaluation,
  isEvaluating,
  evaluationError,
  isOptimizing,
  optimizationResult,
  optimizationError,
  versions,
  activeVersionId,
  onRevertVersion,
  onEvaluate,
  onOptimizeTokens,
  onForge,
  onStop,
  onSendToMentor,
}) => {
  const [outputTab, setOutputTab] = useState<OutputTab>('master');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [mcpUrlInput, setMcpUrlInput] = useState('');
  const [mcpUrlError, setMcpUrlError] = useState<string | null>(null);
  const [showMcpJson, setShowMcpJson] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportedFormat, setExportedFormat] = useState<'md' | 'json' | 'csv' | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const parsed = useMemo(() => parseForgeMarkdown(outputMarkdown), [outputMarkdown]);
  const copyTarget = parsed.masterPrompt || outputMarkdown;

  const inputTokens = useMemo(() => estimateTokens(rawIdea), [rawIdea]);

  const wordCount = useMemo(() => {
    const text = copyTarget.trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  }, [copyTarget]);

  const outputTokens = useMemo(() => estimateTokens(copyTarget), [copyTarget]);

  const selectedDomainInfo = useMemo(
    () => TARGET_DOMAINS.find((d) => d.value === targetDomain) || TARGET_DOMAINS[0],
    [targetDomain]
  );

  const selectedModeInfo = useMemo(
    () => EXECUTION_MODES.find((m) => m.value === executionMode) || EXECUTION_MODES[0],
    [executionMode]
  );

  const selectedLanguageInfo = useMemo(
    () => LANGUAGE_PREFERENCES.find((l) => l.value === languagePref) || LANGUAGE_PREFERENCES[0],
    [languagePref]
  );

  const selectedAgentArchInfo = useMemo(
    () => AGENT_ARCHITECTURES.find((a) => a.value === agentArchitecture) || AGENT_ARCHITECTURES[0],
    [agentArchitecture]
  );

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [exportMenuOpen]);

  const handleToggleSpeak = async () => {
    if (isSpeaking) {
      stopAudioPlayback();
      return;
    }
    const textToRead = copyTarget.trim() || parsed.clarifiedGoal.trim();
    if (!textToRead || isLoadingAudio) return;

    setIsLoadingAudio(true);
    setTtsError(null);
    try {
      const clipped = textToRead.slice(0, 2600);
      const { audioBase64, mimeType } = await synthesizeSpeech({
        text: clipped,
        voiceName: 'Kore',
      });
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopAudioPlayback();
      audio.onerror = () => {
        stopAudioPlayback();
        setTtsError('Audio playback failed.');
      };
      setIsSpeaking(true);
      await audio.play();
    } catch (err: any) {
      stopAudioPlayback();
      setTtsError(err?.message || 'Unable to generate audio.');
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleAddMcpUrl = (rawUrl?: string) => {
    const candidate = (rawUrl ?? mcpUrlInput).trim();
    if (!candidate) return;
    try {
      const parsedUrl = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        setMcpUrlError('Enter a valid http/https skill or model URL.');
        return;
      }
      const normalized = parsedUrl.toString();
      if (mcpConfig.skillUrls.includes(normalized)) {
        setMcpUrlError('Link already added.');
        return;
      }
      if (mcpConfig.skillUrls.length >= 6) {
        setMcpUrlError('Maximum 6 skill/MCP links per prompt.');
        return;
      }
      setMcpConfig((prev) => ({
        ...prev,
        skillUrls: [...prev.skillUrls, normalized],
      }));
      if (!rawUrl) setMcpUrlInput('');
      setMcpUrlError(null);
    } catch {
      setMcpUrlError('Enter a valid URL (e.g. https://github.com/...).');
    }
  };

  const handleRemoveMcpUrl = (urlToRemove: string) => {
    setMcpConfig((prev) => ({
      ...prev,
      skillUrls: prev.skillUrls.filter((u) => u !== urlToRemove),
    }));
  };

  const handleCopyPrompt = () => {
    if (!copyTarget) return;
    navigator.clipboard.writeText(copyTarget);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1800);
  };

  const markExported = (fmt: 'md' | 'json' | 'csv') => {
    setExportMenuOpen(false);
    setExportedFormat(fmt);
    setTimeout(() => setExportedFormat((curr) => (curr === fmt ? null : curr)), 2000);
  };

  const handleExportMarkdown = () => {
    if (!outputMarkdown) return;
    triggerFileDownload(outputMarkdown, `ang-prompt-${Date.now()}.md`, 'text/markdown;charset=utf-8');
    markExported('md');
  };

  const handleExportJson = () => {
    if (!outputMarkdown) return;
    const json = buildForgeExportJson({
      rawIdea,
      targetDomain,
      style,
      thinkingDepth,
      executionMode,
      tokenMode,
      languagePref,
      outputMarkdown,
      parsed,
      sources,
      evaluation,
      optimizationResult,
    });
    triggerFileDownload(json, `ang-prompt-analytics-${Date.now()}.json`, 'application/json;charset=utf-8');
    markExported('json');
  };

  const handleExportCsv = () => {
    if (!outputMarkdown) return;
    const csv = buildForgeExportCsv({
      rawIdea,
      targetDomain,
      style,
      thinkingDepth,
      executionMode,
      tokenMode,
      languagePref,
      outputMarkdown,
      parsed,
      sources,
      evaluation,
      optimizationResult,
    });
    triggerFileDownload(csv, `ang-prompt-metrics-${Date.now()}.csv`, 'text/csv;charset=utf-8');
    markExported('csv');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && rawIdea.trim() && !isStreaming) {
      e.preventDefault();
      onForge();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Heading */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              ANG Prompt Forge &amp; AI Mentor
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Drop rough thoughts in English or Roman Urdu, attach code, screenshots, or URLs. ANG diagnoses intent, fixes your words for AI-to-AI precision, and builds a full-stack execution plan.
            </p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
            <span>Model: gemini-4-hydrogen</span>
            <span aria-hidden="true"> · </span>
            <span>Ctrl+Enter to forge</span>
          </div>
        </div>

        {/* Main 2-Column Workbench */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Input & Facilitation Tools */}
          <section className="xl:col-span-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            {/* Execution Mode Switcher */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Execution Mode
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-slate-800">
                {EXECUTION_MODES.map((m) => {
                  const active = executionMode === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={isStreaming}
                      onClick={() => setExecutionMode(m.value)}
                      className={`px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap truncate ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {selectedModeInfo.detail}
              </p>
            </div>

            {/* Language & Ease Selector */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Language &amp; Ease (Urdu / English)
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {LANGUAGE_PREFERENCES.map((lang) => {
                  const active = languagePref === lang.value;
                  return (
                    <button
                      key={lang.value}
                      type="button"
                      disabled={isStreaming}
                      onClick={() => setLanguagePref(lang.value)}
                      className={`px-2.5 py-2 text-xs font-medium rounded-md border transition-colors truncate ${
                        active
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {selectedLanguageInfo.hint}
              </p>
            </div>

            {/* Conditional Agent Mode Controls */}
            {executionMode === 'agent' && (
              <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="agent-arch-select"
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Agent Architecture Pattern
                  </label>
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    Autonomous Spec
                  </span>
                </div>
                <select
                  id="agent-arch-select"
                  value={agentArchitecture}
                  disabled={isStreaming}
                  onChange={(e) => setAgentArchitecture(e.target.value as AgentArchitecture)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {AGENT_ARCHITECTURES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {selectedAgentArchInfo.hint}
                </p>
              </div>
            )}

            {/* Conditional MCP & Open-Source Skills/Models Connector */}
            {executionMode === 'mcp' && (
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0E1420] space-y-3">
                <div>
                  <label
                    htmlFor="mcp-model-family"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                  >
                    Target Open-Source or LLM Family
                  </label>
                  <select
                    id="mcp-model-family"
                    value={mcpConfig.targetModel}
                    disabled={isStreaming}
                    onChange={(e) =>
                      setMcpConfig((prev) => ({
                        ...prev,
                        targetModel: e.target.value as TargetModelFamily,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TARGET_MODEL_FAMILIES.map((fam) => (
                      <option key={fam.value} value={fam.value}>
                        {fam.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Open-Source Skill / MCP URLs */}
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Open-Source Skills / MCP Server / Model Links
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      value={mcpUrlInput}
                      disabled={isStreaming}
                      onChange={(e) => setMcpUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddMcpUrl();
                        }
                      }}
                      placeholder="Paste SKILL.md, GitHub MCP repo, or HuggingFace URL..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={isStreaming || !mcpUrlInput.trim()}
                      onClick={() => handleAddMcpUrl()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                  {mcpUrlError && <p className="text-xs text-red-500">{mcpUrlError}</p>}

                  {/* 1-Click Open-Source Presets */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {MCP_SKILL_PRESETS.map((preset) => {
                      const alreadyAdded = mcpConfig.skillUrls.includes(preset.url);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          disabled={isStreaming || alreadyAdded}
                          title={preset.description}
                          onClick={() => handleAddMcpUrl(preset.url)}
                          className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                            alreadyAdded
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:border-blue-500'
                          }`}
                        >
                          {alreadyAdded ? `✓ ${preset.label}` : `+ ${preset.label}`}
                        </button>
                      );
                    })}
                  </div>

                  {mcpConfig.skillUrls.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {mcpConfig.skillUrls.map((u) => (
                        <li
                          key={u}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-md"
                        >
                          <span className="inline-flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-300">
                            <Link2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="truncate font-mono">{u}</span>
                          </span>
                          <button
                            type="button"
                            disabled={isStreaming}
                            onClick={() => handleRemoveMcpUrl(u)}
                            aria-label={`Remove ${u}`}
                            className="text-slate-400 hover:text-red-500 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Optional mcpServers JSON Config */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowMcpJson((v) => !v)}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showMcpJson ? 'Hide optional mcpServers JSON' : '+ Paste optional mcpServers JSON (advanced)'}
                  </button>
                  {showMcpJson && (
                    <textarea
                      rows={3}
                      value={mcpConfig.mcpManifestSnippet}
                      disabled={isStreaming}
                      onChange={(e) =>
                        setMcpConfig((prev) => ({
                          ...prev,
                          mcpManifestSnippet: e.target.value,
                        }))
                      }
                      placeholder='{"mcpServers": {"filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]}}}'
                      className="mt-2 w-full px-2.5 py-2 text-xs font-mono bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Domain Selector */}
            <div>
              <label
                htmlFor="target-domain"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Target AI Domain
              </label>
              <select
                id="target-domain"
                value={targetDomain}
                disabled={isStreaming}
                onChange={(e) => setTargetDomain(e.target.value as TargetDomain)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TARGET_DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {selectedDomainInfo.hint}
              </p>
            </div>

            {/* Raw Input + Voice Mic + Token Counter */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="raw-idea"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Your Raw Idea, Bug, or Rough Words
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    ~{inputTokens} tok
                  </span>
                  <VoiceMicButton
                    disabled={isStreaming}
                    label="Speak"
                    onTranscript={(text) =>
                      setRawIdea(rawIdea.trim() ? `${rawIdea.trim()}\n${text}` : text)
                    }
                  />
                  {rawIdea && (
                    <button
                      type="button"
                      disabled={isStreaming}
                      onClick={() => setRawIdea('')}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>
              <textarea
                id="raw-idea"
                rows={5}
                value={rawIdea}
                disabled={isStreaming}
                onChange={(e) => setRawIdea(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write or speak naturally in Urdu, Roman Urdu, or English — e.g. 'Mujhe React + Express app ke liye fast auth aur MCP agent prompt banana hai...'"
                className="w-full px-3.5 py-3 text-sm leading-relaxed bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[130px]"
              />
            </div>

            {/* Token Optimization Mode */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Token Optimization Level
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {TOKEN_MODES.map((tm) => {
                  const active = tokenMode === tm.value;
                  return (
                    <button
                      key={tm.value}
                      type="button"
                      disabled={isStreaming}
                      title={tm.detail}
                      onClick={() => setTokenMode(tm.value)}
                      className={`px-2.5 py-2 text-xs font-medium rounded-md border transition-colors truncate ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt Style Selector */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Prompt Output Style
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROMPT_STYLES.map((s) => {
                  const active = style === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={isStreaming}
                      onClick={() => setStyle(s.value)}
                      title={s.description}
                      className={`px-3 py-2 text-xs font-medium rounded-md border text-left transition-colors truncate ${
                        active
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Multi-Tool Facilitation Bar */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
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
            </div>

            {/* Primary CTA */}
            <div className="pt-1 flex items-center gap-3">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop Generation</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOutputTab('master');
                    onForge();
                  }}
                  disabled={!rawIdea.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <span>
                    {executionMode === 'agent'
                      ? 'Forge Autonomous Agent Prompt'
                      : executionMode === 'mcp'
                      ? 'Forge MCP & Open-Source Prompt'
                      : 'Forge AI Prompt & Solution'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </section>

          {/* Right Column: Live Output Workbench */}
          <section className="xl:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[540px]">
            {/* Output Toolbar */}
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-slate-800">
                {([
                  { id: 'master', label: 'Master Prompt' },
                  { id: 'analytics', label: 'Tokens & D3' },
                  { id: 'evaluate', label: evaluation ? `Evaluate (${evaluation.overallScore})` : 'Evaluate' },
                  { id: 'diagnosis', label: 'Intent & Psychology' },
                  { id: 'blueprint', label: 'Full-Stack Plan' },
                  { id: 'all', label: 'Full Report' },
                ] as { id: OutputTab; label: string }[]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOutputTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                      outputTab === tab.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {outputMarkdown && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums hidden sm:inline">
                    {wordCount} words · ~{outputTokens} tokens
                  </span>
                  <button
                    type="button"
                    disabled={isStreaming || isOptimizing}
                    onClick={() => {
                      setOutputTab('master');
                      onOptimizeTokens(copyTarget, tokenMode === 'ultra_lean' ? 'ultra_lean' : 'balanced');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isOptimizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Scissors className="w-3.5 h-3.5" />
                    )}
                    <span>{isOptimizing ? 'Optimizing...' : 'Optimize Tokens'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isStreaming || isLoadingAudio}
                    onClick={handleToggleSpeak}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap disabled:opacity-50 ${
                      isSpeaking
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {isLoadingAudio ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isSpeaking ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isLoadingAudio ? 'Audio...' : isSpeaking ? 'Stop Audio' : 'Listen'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={() => setOutputTab((prev) => (prev === 'history' ? 'master' : 'history'))}
                    aria-pressed={outputTab === 'history'}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap tabular-nums disabled:opacity-50 ${
                      outputTab === 'history'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History{versions.length > 0 ? ` (${versions.length})` : ''}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isStreaming || isEvaluating}
                    onClick={() => {
                      setOutputTab('evaluate');
                      onEvaluate(copyTarget);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isEvaluating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>{isEvaluating ? 'Evaluating...' : 'Evaluate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                  >
                    {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPrompt ? 'Copied Prompt' : 'Copy Prompt'}</span>
                  </button>
                  <div ref={exportMenuRef} className="relative">
                    <button
                      type="button"
                      disabled={isStreaming}
                      aria-haspopup="menu"
                      aria-expanded={exportMenuOpen}
                      onClick={() => setExportMenuOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {exportedFormat ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {exportedFormat ? `Exported ${exportedFormat.toUpperCase()}` : 'Export'}
                      </span>
                      <ChevronDown className="w-3 h-3 opacity-70" />
                    </button>

                    {exportMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 mt-1.5 w-52 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-lg py-1 z-30"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleExportJson}
                          className="w-full px-3 py-2 text-left text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                        >
                          <span className="font-medium">JSON (Output + Metrics)</span>
                          <span className="font-mono text-[11px] text-slate-400">.json</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleExportCsv}
                          className="w-full px-3 py-2 text-left text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                        >
                          <span className="font-medium">CSV (Token Metrics)</span>
                          <span className="font-mono text-[11px] text-slate-400">.csv</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleExportMarkdown}
                          className="w-full px-3 py-2 text-left text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800"
                        >
                          <span className="font-medium">Markdown Report</span>
                          <span className="font-mono text-[11px] text-slate-400">.md</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSendToMentor(copyTarget, targetDomain)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors whitespace-nowrap"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Open in Mentor</span>
                  </button>
                </div>
              )}
            </div>

            {/* Output Body */}
            <div className="flex-1 p-5 sm:p-6 overflow-y-auto">
              {error ? (
                <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300 flex items-start gap-3" role="alert">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Request Failed</p>
                    <p className="text-sm leading-relaxed">{error}</p>
                  </div>
                </div>
              ) : !outputMarkdown && isStreaming ? (
                <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-blue-400" />
                  <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                    Analyzing user intent, context tools, and architecture...
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Synthesizing Master AI-to-AI Prompt and Full-Stack Execution Plan
                  </p>
                </div>
              ) : !outputMarkdown ? (
                <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center px-4">
                  <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    Ready to fix your words and engineer the solution
                  </p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                    Describe what you want to build, debug, or ask AI—even in rough notes or Roman Urdu. Attach screenshots, code, or URLs so ANG reads everything first.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {isStreaming && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Streaming response...</span>
                    </div>
                  )}

                  {outputTab === 'master' && (
                    <div className="space-y-5">
                      {ttsError && (
                        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-600 dark:text-red-400">
                          {ttsError}
                        </div>
                      )}

                      {optimizationError && (
                        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-600 dark:text-red-400">
                          Token optimization failed: {optimizationError}
                        </div>
                      )}

                      {optimizationResult && (
                        <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                              Token Optimized: {optimizationResult.beforeTokens} → {optimizationResult.afterTokens} tokens ({optimizationResult.savedPercent}% saved)
                            </p>
                            <button
                              type="button"
                              disabled={isStreaming || isOptimizing}
                              onClick={() => onOptimizeTokens(copyTarget, 'ultra_lean')}
                              className="px-2.5 py-1 text-xs font-medium rounded border border-emerald-500/40 bg-white dark:bg-[#0B0F17] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                            >
                              Compress Further (Ultra-Lean)
                            </button>
                          </div>
                          {optimizationResult.techniquesApplied.length > 0 && (
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Applied: {optimizationResult.techniquesApplied.join(' · ')}
                            </p>
                          )}
                        </div>
                      )}

                      {parsed.clarifiedGoal && (
                        <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
                          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                            Clarified Goal (ANG Fixed Words)
                          </h2>
                          <MarkdownRenderer content={parsed.clarifiedGoal} />
                        </div>
                      )}

                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Master AI-to-AI Prompt
                          </h2>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span>~{outputTokens} tokens</span>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => setOutputTab('analytics')}
                              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              View token breakdown
                            </button>
                          </div>
                        </div>
                        {parsed.masterPrompt ? (
                          <pre className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-[13.5px] leading-[1.65] font-mono text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
                            {parsed.masterPrompt}
                          </pre>
                        ) : (
                          <MarkdownRenderer content={outputMarkdown} />
                        )}
                      </div>
                    </div>
                  )}

                  {outputTab === 'analytics' && (
                    <PromptTokenAnalytics
                      parsed={parsed}
                      isStreaming={isStreaming}
                      isOptimizing={isOptimizing}
                      onOptimizeTokens={onOptimizeTokens}
                      onExportJson={handleExportJson}
                      onExportCsv={handleExportCsv}
                    />
                  )}

                  {outputTab === 'diagnosis' && (
                    <div className="space-y-5">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                          Behavioral &amp; Intent Diagnosis
                        </h2>
                        <MarkdownRenderer content={parsed.diagnosis || outputMarkdown} />
                      </div>
                      {parsed.clarifiedGoal && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                            Clarified Goal (ANG Fixed Words)
                          </h2>
                          <MarkdownRenderer content={parsed.clarifiedGoal} />
                        </div>
                      )}
                    </div>
                  )}

                  {outputTab === 'blueprint' && (
                    <div className="space-y-5">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                          Full-Stack Execution Blueprint
                        </h2>
                        <MarkdownRenderer content={parsed.blueprint || outputMarkdown} />
                      </div>
                      {parsed.guardrails && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                            Verification &amp; Edge-Case Guardrails
                          </h2>
                          <MarkdownRenderer content={parsed.guardrails} />
                        </div>
                      )}
                    </div>
                  )}

                  {outputTab === 'evaluate' && (
                    <div className="space-y-6">
                      {isEvaluating ? (
                        <div className="min-h-[300px] flex flex-col items-center justify-center text-center">
                          <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-blue-400" />
                          <p className="mt-3 text-sm font-medium text-slate-900 dark:text-white">
                            Scoring Clarity, Specificity, and Context...
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Running calibrated rubric assessment and generating targeted LLM improvements
                          </p>
                        </div>
                      ) : evaluationError ? (
                        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300 space-y-3" role="alert">
                          <div className="flex items-start gap-2.5">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold">Evaluation Failed</p>
                              <p className="text-sm mt-0.5">{evaluationError}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onEvaluate(copyTarget)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            Retry Evaluation
                          </button>
                        </div>
                      ) : !evaluation ? (
                        <div className="min-h-[280px] flex flex-col items-center justify-center text-center px-4">
                          <ShieldCheck className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                          <p className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                            Audit this forged prompt for Clarity, Specificity &amp; Context
                          </p>
                          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                            ANG evaluates how reliably other LLMs will follow this prompt on the first try and suggests concrete fixes you can apply in one click.
                          </p>
                          <button
                            type="button"
                            disabled={isStreaming}
                            onClick={() => onEvaluate(copyTarget)}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>Run Prompt Evaluation</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Overall Verdict & Actions */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  Overall Readiness: {evaluation.overallScore}/100
                                </span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    evaluation.portableAcrossLlms
                                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                      : 'text-amber-600 dark:text-amber-400 font-medium'
                                  }
                                >
                                  {evaluation.portableAcrossLlms
                                    ? 'Portable across LLMs'
                                    : 'Needs added framing'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>Confidence {Math.round(evaluation.portabilityConfidence * 100)}%</span>
                              </div>
                              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                                {evaluation.summaryVerdict}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={isStreaming || isEvaluating}
                              onClick={() => onEvaluate(copyTarget)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Re-evaluate</span>
                            </button>
                          </div>

                          {/* 3 Quality Criteria Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {evaluation.criteria.map((c) => {
                              const barColor =
                                c.score >= 82
                                  ? 'bg-emerald-600'
                                  : c.score >= 64
                                  ? 'bg-blue-600'
                                  : c.score >= 45
                                  ? 'bg-amber-600'
                                  : 'bg-red-600';
                              const bandColor =
                                c.score >= 82
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : c.score >= 64
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : c.score >= 45
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400';

                              return (
                                <div
                                  key={c.key}
                                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] space-y-2.5"
                                >
                                  <div className="flex items-baseline justify-between gap-2">
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                      {c.label}
                                    </h3>
                                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                                      {c.score}/100
                                    </span>
                                  </div>

                                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className={`h-full ${barColor} transition-all duration-300`}
                                      style={{ width: `${c.score}%` }}
                                    />
                                  </div>

                                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                    <span className={`font-semibold ${bandColor}`}>{c.band}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span>{Math.round(c.confidence * 100)}% confidence</span>
                                  </p>

                                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {c.diagnosis || c.rubricLevel}
                                  </p>
                                </div>
                              );
                            })}
                          </div>

                          {/* Cross-LLM Notes */}
                          {evaluation.crossLlmNotes && (
                            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0E1420] space-y-1">
                              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                Cross-LLM Execution Behavior
                              </h3>
                              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                {evaluation.crossLlmNotes}
                              </p>
                            </div>
                          )}

                          {/* Actionable Improvements */}
                          {evaluation.improvements.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                    Suggested Improvements ({evaluation.improvements.length})
                                  </h3>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Apply a targeted fix or upgrade all items into a stronger Master Prompt
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isStreaming}
                                    onClick={() =>
                                      onSendToMentor(
                                        `Review this prompt and its quality audit (Overall ${evaluation.overallScore}/100: ${evaluation.summaryVerdict}). Help me strengthen these areas:\n${evaluation.improvements
                                          .map((i, idx) => `${idx + 1}. [${i.criterion}] ${i.title}: ${i.recommendation}`)
                                          .join('\n')}\n\nPrompt:\n${copyTarget}`,
                                        targetDomain
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>Discuss Critique</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isStreaming}
                                    onClick={() => {
                                      const combinedDirective = evaluation.improvements
                                        .map(
                                          (imp, idx) =>
                                            `${idx + 1}. [${imp.criterion} - ${imp.impact} Impact] ${imp.applyDirective}`
                                        )
                                        .join('\n');
                                      setOutputTab('master');
                                      onForge(
                                        `Apply ALL of the following quality improvements to upgrade the Master AI-to-AI Prompt:\n${combinedDirective}`,
                                        copyTarget
                                      );
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Apply All Improvements</span>
                                  </button>
                                </div>
                              </div>

                              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-[#0B0F17]">
                                {evaluation.improvements.map((imp) => (
                                  <div
                                    key={imp.id}
                                    className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                                  >
                                    <div className="space-y-1.5 min-w-0">
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                          {imp.criterion}
                                        </span>
                                        <span aria-hidden="true"> · </span>
                                        <span
                                          className={
                                            imp.impact === 'High'
                                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                                              : 'text-slate-500 dark:text-slate-400'
                                          }
                                        >
                                          {imp.impact} Impact
                                        </span>
                                      </p>
                                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                                        {imp.title}
                                      </h4>
                                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                        <span className="font-medium text-slate-700 dark:text-slate-300">Gap: </span>
                                        {imp.issue}
                                      </p>
                                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                        <span className="font-medium text-slate-900 dark:text-white">Fix: </span>
                                        {imp.recommendation}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      disabled={isStreaming}
                                      onClick={() => {
                                        setOutputTab('master');
                                        onForge(imp.applyDirective, copyTarget);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111827] text-slate-800 dark:text-slate-200 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 self-start"
                                    >
                                      <span>Apply Fix</span>
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {outputTab === 'history' && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Prompt Iteration History
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {versions.length} {versions.length === 1 ? 'version' : 'versions'} saved for this prompt · Preview or revert to any snapshot
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOutputTab('master')}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                        >
                          Back to Master Prompt
                        </button>
                      </div>

                      {versions.length === 0 ? (
                        <div className="py-12 text-center">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            No iterations recorded yet
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Refine this prompt, apply evaluation fixes, or re-forge to compare versions here.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-[#0B0F17]">
                          {versions.map((ver) => {
                            const isCurrent = ver.id === activeVersionId;
                            const isPreviewing = previewVersionId === ver.id;
                            const parsedVer = parseForgeMarkdown(ver.outputMarkdown);
                            const verPromptText = parsedVer.masterPrompt || ver.outputMarkdown;
                            const verWords = verPromptText.trim()
                              ? verPromptText.trim().split(/\s+/).length
                              : 0;

                            return (
                              <div key={ver.id} className="p-4 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="space-y-1 min-w-0">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                        v{ver.versionNumber}
                                      </span>
                                      {isCurrent && (
                                        <>
                                          <span aria-hidden="true"> · </span>
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            Current
                                          </span>
                                        </>
                                      )}
                                      <span aria-hidden="true"> · </span>
                                      <span>
                                        {new Date(ver.createdAt).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                      <span aria-hidden="true"> · </span>
                                      <span>{ver.style}</span>
                                      <span aria-hidden="true"> · </span>
                                      <span>{verWords} words</span>
                                      {ver.evaluation && (
                                        <>
                                          <span aria-hidden="true"> · </span>
                                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                            Score {ver.evaluation.overallScore}/100
                                          </span>
                                        </>
                                      )}
                                    </p>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                      {ver.label}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewVersionId((curr) => (curr === ver.id ? null : ver.id))
                                      }
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111827] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>{isPreviewing ? 'Hide Preview' : 'Preview'}</span>
                                    </button>

                                    {isCurrent ? (
                                      <span className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        Active
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={isStreaming}
                                        onClick={() => {
                                          onRevertVersion(ver);
                                          setPreviewVersionId(null);
                                          setOutputTab('master');
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Revert</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isPreviewing && (
                                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                      Snapshot Preview (Master AI-to-AI Prompt)
                                    </p>
                                    <pre className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111827] text-xs leading-relaxed font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                                      {verPromptText}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {outputTab === 'all' && <MarkdownRenderer content={outputMarkdown} />}

                  {/* Grounding & URL Context Sources */}
                  {sources.length > 0 && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                      <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                        Verified Sources Read by Tools
                      </h3>
                      <ul className="space-y-1.5">
                        {sources.map((src) => (
                          <li key={src.uri} className="text-xs flex items-center gap-2">
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                            >
                              {src.title || src.uri}
                            </a>
                            <span className="text-slate-400 shrink-0">
                              · {src.sourceType === 'web' ? 'Web Search' : 'URL Context'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* One-Click Refinements Footer */}
            {outputMarkdown && !isStreaming && (
              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1420] rounded-b-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                    Refine prompt:
                  </span>
                  {QUICK_REFINEMENTS.map((ref) => (
                    <button
                      key={ref.id}
                      type="button"
                      onClick={() => {
                        setOutputTab('master');
                        onForge(ref.instruction, copyTarget);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
                    >
                      {ref.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default PromptForgeView;
