import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentArchitecture,
  AttachmentItem,
  ExecutionMode,
  ForgeRecord,
  ForgeVersion,
  GroundingSource,
  LanguagePreference,
  McpConfig,
  MentorMessage,
  MentorSession,
  PromptEvaluation,
  PromptStyle,
  PromptTemplate,
  TargetDomain,
  ThinkingDepth,
  TokenOptimizationMode,
  TokenOptimizationResult,
  WorkspaceTab,
} from './types';
import {
  evaluateForgedPrompt,
  forgePromptStream,
  mentorChatStream,
  optimizePromptTokens,
} from './services/mentorClient';
import TopBar from './components/TopBar';
import SidebarHistory from './components/SidebarHistory';
import PromptForgeView from './components/PromptForgeView';
import MentorChatView from './components/MentorChatView';
import TalkModeView from './components/TalkModeView';
import TemplatesView from './components/TemplatesView';
import GuideView from './components/GuideView';

const STORAGE_FORGE_KEY = 'ang_forge_history_v1';
const STORAGE_CHAT_KEY = 'ang_mentor_sessions_v1';
const STORAGE_THEME_KEY = 'ang_theme_v1';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function summarizeTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Untitled Session';
  return cleaned.length > 52 ? `${cleaned.slice(0, 52)}...` : cleaned;
}

function buildVersionLabel(versionNumber: number, style: PromptStyle, refinementInstruction?: string): string {
  if (!refinementInstruction) {
    return versionNumber === 1 ? 'Initial Forge' : `Re-forged · ${style}`;
  }
  if (refinementInstruction.startsWith('Apply ALL')) {
    return 'Applied All Evaluation Fixes';
  }
  const clean = refinementInstruction.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `Refined: ${clean.slice(0, 48)}...` : `Refined: ${clean}`;
}

function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_THEME_KEY);
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('forge');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  // Persisted History
  const [forgeHistory, setForgeHistory] = useState<ForgeRecord[]>(() =>
    loadJson<ForgeRecord[]>(STORAGE_FORGE_KEY, [])
  );
  const [chatSessions, setChatSessions] = useState<MentorSession[]>(() =>
    loadJson<MentorSession[]>(STORAGE_CHAT_KEY, [])
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FORGE_KEY, JSON.stringify(forgeHistory.slice(0, 40)));
    } catch {
      // Ignore quota errors
    }
  }, [forgeHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(chatSessions.slice(0, 30)));
    } catch {
      // Ignore quota errors
    }
  }, [chatSessions]);

  // Forge State
  const [activeForgeId, setActiveForgeId] = useState<string | null>(null);
  const [rawIdea, setRawIdea] = useState('');
  const [targetDomain, setTargetDomain] = useState<TargetDomain>('fullstack');
  const [style, setStyle] = useState<PromptStyle>(PromptStyle.Engineering);
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>('high');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('standard');
  const [agentArchitecture, setAgentArchitecture] = useState<AgentArchitecture>('planner_executor');
  const [tokenMode, setTokenMode] = useState<TokenOptimizationMode>('standard');
  const [languagePref, setLanguagePref] = useState<LanguagePreference>('bilingual_urdu');
  const [mcpConfig, setMcpConfig] = useState<McpConfig>({
    targetModel: 'universal',
    skillUrls: [],
    mcpManifestSnippet: '',
  });
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [forgeOutput, setForgeOutput] = useState('');
  const [forgeSources, setForgeSources] = useState<GroundingSource[]>([]);
  const [isForgeStreaming, setIsForgeStreaming] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [forgeEvaluation, setForgeEvaluation] = useState<PromptEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<TokenOptimizationResult | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [forgeVersions, setForgeVersions] = useState<ForgeVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const forgeAbortRef = useRef<AbortController | null>(null);
  const evalAbortRef = useRef<AbortController | null>(null);
  const optAbortRef = useRef<AbortController | null>(null);

  // Mentor Chat State
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<MentorMessage[]>([]);
  const [mentorFocus, setMentorFocus] = useState<TargetDomain>('fullstack');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const handleStopForge = useCallback(() => {
    forgeAbortRef.current?.abort();
    forgeAbortRef.current = null;
    setIsForgeStreaming(false);
  }, []);

  const handleStopChat = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setIsChatStreaming(false);
  }, []);

  const handleForge = useCallback(
    async (refinementInstruction?: string, previousPrompt?: string) => {
      if (!rawIdea.trim()) {
        setForgeError('Please enter your rough idea, bug, or goal first.');
        return;
      }

      forgeAbortRef.current?.abort();
      evalAbortRef.current?.abort();
      optAbortRef.current?.abort();
      const controller = new AbortController();
      forgeAbortRef.current = controller;

      setIsForgeStreaming(true);
      setForgeError(null);
      setForgeOutput('');
      setForgeSources([]);
      setForgeEvaluation(null);
      setEvaluationError(null);
      setIsEvaluating(false);
      setOptimizationResult(null);
      setOptimizationError(null);
      setIsOptimizing(false);

      let accumulatedText = '';
      let collectedSources: GroundingSource[] = [];

      try {
        await forgePromptStream(
          {
            rawIdea,
            targetDomain,
            style,
            thinkingDepth,
            executionMode,
            agentArchitecture,
            tokenMode,
            languagePref,
            mcpConfig,
            useWebSearch,
            urls,
            attachments,
            refinementInstruction,
            previousPrompt,
          },
          {
            signal: controller.signal,
            onChunk: (chunkText) => {
              accumulatedText += chunkText;
              setForgeOutput(accumulatedText);
            },
            onSources: (sources) => {
              collectedSources = sources;
              setForgeSources(sources);
            },
          }
        );

        if (accumulatedText.trim()) {
          const recordId = activeForgeId || `forge-${Date.now()}`;
          const existingRecord = forgeHistory.find((r) => r.id === recordId);
          const baseVersions: ForgeVersion[] =
            forgeVersions.length > 0
              ? forgeVersions
              : existingRecord?.versions && existingRecord.versions.length > 0
              ? existingRecord.versions
              : existingRecord
              ? [
                  {
                    id: `ver-${existingRecord.createdAt}`,
                    versionNumber: 1,
                    createdAt: existingRecord.createdAt,
                    label: 'Initial Forge',
                    rawIdea: existingRecord.rawIdea,
                    targetDomain: existingRecord.targetDomain,
                    style: existingRecord.style,
                    thinkingDepth: existingRecord.thinkingDepth,
                    executionMode: existingRecord.executionMode,
                    tokenMode: existingRecord.tokenMode,
                    languagePref: existingRecord.languagePref,
                    outputMarkdown: existingRecord.outputMarkdown,
                    sources: existingRecord.sources || [],
                    evaluation: existingRecord.evaluation || null,
                  },
                ]
              : [];

          const nextVersionNumber =
            baseVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
          const newVersionId = `ver-${Date.now()}`;
          const newVersion: ForgeVersion = {
            id: newVersionId,
            versionNumber: nextVersionNumber,
            createdAt: Date.now(),
            label: buildVersionLabel(nextVersionNumber, style, refinementInstruction),
            rawIdea,
            targetDomain,
            style,
            thinkingDepth,
            executionMode,
            tokenMode,
            languagePref,
            outputMarkdown: accumulatedText,
            sources: collectedSources,
            evaluation: null,
          };

          const updatedVersions = [newVersion, ...baseVersions];

          const newRecord: ForgeRecord = {
            id: recordId,
            createdAt: existingRecord?.createdAt || Date.now(),
            title: summarizeTitle(rawIdea),
            rawIdea,
            targetDomain,
            style,
            thinkingDepth,
            executionMode,
            tokenMode,
            languagePref,
            useWebSearch,
            urls: [...urls],
            attachmentNames: attachments.map((a) => a.name),
            outputMarkdown: accumulatedText,
            sources: collectedSources,
            evaluation: null,
            versions: updatedVersions,
            activeVersionId: newVersionId,
          };

          setActiveForgeId(recordId);
          setForgeVersions(updatedVersions);
          setActiveVersionId(newVersionId);
          setForgeHistory((prev) => {
            const existingIdx = prev.findIndex((r) => r.id === recordId);
            if (existingIdx !== -1) {
              const copy = [...prev];
              copy[existingIdx] = { ...newRecord, pinned: prev[existingIdx].pinned };
              return copy;
            }
            return [newRecord, ...prev];
          });
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setForgeError(err?.message || 'Failed to generate prompt. Please check your configuration and try again.');
        }
      } finally {
        setIsForgeStreaming(false);
        forgeAbortRef.current = null;
      }
    },
    [
      rawIdea,
      targetDomain,
      style,
      thinkingDepth,
      executionMode,
      agentArchitecture,
      tokenMode,
      languagePref,
      mcpConfig,
      useWebSearch,
      urls,
      attachments,
      activeForgeId,
      forgeHistory,
      forgeVersions,
    ]
  );

  const handleEvaluatePrompt = useCallback(
    async (promptText: string) => {
      if (!promptText.trim() || isEvaluating) return;

      evalAbortRef.current?.abort();
      const controller = new AbortController();
      evalAbortRef.current = controller;

      setIsEvaluating(true);
      setEvaluationError(null);

      try {
        const result = await evaluateForgedPrompt(
          {
            masterPrompt: promptText,
            rawIdea,
            targetDomain,
            style,
          },
          controller.signal
        );
        setForgeEvaluation(result);

        if (activeVersionId) {
          setForgeVersions((prev) =>
            prev.map((v) => (v.id === activeVersionId ? { ...v, evaluation: result } : v))
          );
        }

        if (activeForgeId) {
          setForgeHistory((prev) =>
            prev.map((rec) => {
              if (rec.id !== activeForgeId) return rec;
              const updatedVers = rec.versions?.map((v) =>
                v.id === activeVersionId ? { ...v, evaluation: result } : v
              );
              return { ...rec, evaluation: result, versions: updatedVers };
            })
          );
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setEvaluationError(err?.message || 'Failed to evaluate prompt quality.');
        }
      } finally {
        setIsEvaluating(false);
        evalAbortRef.current = null;
      }
    },
    [isEvaluating, rawIdea, targetDomain, style, activeForgeId, activeVersionId]
  );

  const handleOptimizeTokens = useCallback(
    async (promptText: string, mode: 'balanced' | 'ultra_lean') => {
      if (!promptText.trim() || isOptimizing) return;

      optAbortRef.current?.abort();
      const controller = new AbortController();
      optAbortRef.current = controller;

      setIsOptimizing(true);
      setOptimizationError(null);

      try {
        const result = await optimizePromptTokens(
          {
            masterPrompt: promptText,
            mode,
            targetModel: executionMode === 'mcp' ? mcpConfig.targetModel : undefined,
          },
          controller.signal
        );

        const h3 = '### 3. Master AI-to-AI Prompt';
        const h4 = '### 4. Full-Stack Execution Blueprint';
        let updatedMarkdown = forgeOutput;
        const idx3 = forgeOutput.indexOf(h3);
        if (idx3 !== -1) {
          const idx4 = forgeOutput.indexOf(h4, idx3 + h3.length);
          const before = forgeOutput.slice(0, idx3 + h3.length);
          const after = idx4 !== -1 ? `\n\n${forgeOutput.slice(idx4)}` : '';
          updatedMarkdown = `${before}\n\n\`\`\`markdown\n${result.optimizedPrompt.trim()}\n\`\`\`${after}`;
        } else {
          updatedMarkdown = `${h3}\n\n\`\`\`markdown\n${result.optimizedPrompt.trim()}\n\`\`\``;
        }

        setForgeOutput(updatedMarkdown);
        setOptimizationResult(result);
        setTokenMode(mode);
        setForgeEvaluation(null);

        const nextVersionNumber =
          forgeVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
        const newVersionId = `ver-${Date.now()}`;
        const newVersion: ForgeVersion = {
          id: newVersionId,
          versionNumber: nextVersionNumber,
          createdAt: Date.now(),
          label: `Token Optimized (-${result.savedPercent}%)`,
          rawIdea,
          targetDomain,
          style,
          thinkingDepth,
          executionMode,
          tokenMode: mode,
          languagePref,
          outputMarkdown: updatedMarkdown,
          sources: forgeSources,
          evaluation: null,
        };

        const updatedVersions = [newVersion, ...forgeVersions];
        setForgeVersions(updatedVersions);
        setActiveVersionId(newVersionId);

        if (activeForgeId) {
          setForgeHistory((prev) =>
            prev.map((rec) =>
              rec.id === activeForgeId
                ? {
                    ...rec,
                    tokenMode: mode,
                    outputMarkdown: updatedMarkdown,
                    evaluation: null,
                    versions: updatedVersions,
                    activeVersionId: newVersionId,
                  }
                : rec
            )
          );
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setOptimizationError(err?.message || 'Failed to optimize tokens.');
        }
      } finally {
        setIsOptimizing(false);
        optAbortRef.current = null;
      }
    },
    [
      isOptimizing,
      executionMode,
      mcpConfig.targetModel,
      forgeOutput,
      forgeVersions,
      rawIdea,
      targetDomain,
      style,
      thinkingDepth,
      languagePref,
      forgeSources,
      activeForgeId,
    ]
  );

  const handleRevertVersion = useCallback(
    (version: ForgeVersion) => {
      handleStopForge();
      evalAbortRef.current?.abort();
      optAbortRef.current?.abort();
      setRawIdea(version.rawIdea);
      setTargetDomain(version.targetDomain);
      setStyle(version.style);
      setThinkingDepth(version.thinkingDepth);
      if (version.executionMode) setExecutionMode(version.executionMode);
      if (version.tokenMode) setTokenMode(version.tokenMode);
      if (version.languagePref) setLanguagePref(version.languagePref);
      setForgeOutput(version.outputMarkdown);
      setForgeSources(version.sources || []);
      setForgeEvaluation(version.evaluation || null);
      setForgeError(null);
      setEvaluationError(null);
      setOptimizationResult(null);
      setOptimizationError(null);
      setIsEvaluating(false);
      setIsOptimizing(false);
      setActiveVersionId(version.id);

      if (activeForgeId) {
        setForgeHistory((prev) =>
          prev.map((rec) =>
            rec.id === activeForgeId
              ? {
                  ...rec,
                  rawIdea: version.rawIdea,
                  targetDomain: version.targetDomain,
                  style: version.style,
                  thinkingDepth: version.thinkingDepth,
                  executionMode: version.executionMode ?? rec.executionMode,
                  tokenMode: version.tokenMode ?? rec.tokenMode,
                  languagePref: version.languagePref ?? rec.languagePref,
                  outputMarkdown: version.outputMarkdown,
                  sources: version.sources || [],
                  evaluation: version.evaluation || null,
                  activeVersionId: version.id,
                }
              : rec
          )
        );
      }
    },
    [activeForgeId, handleStopForge]
  );

  const handleSendChatMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isChatStreaming) return;

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const userMessage: MentorMessage = {
        id: `msg-u-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
        attachmentNames: attachments.map((a) => a.name),
        urls: [...urls],
      };

      const assistantId = `msg-a-${Date.now() + 1}`;
      const assistantPlaceholder: MentorMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      const nextMessages = [...chatMessages, userMessage];
      setChatMessages([...nextMessages, assistantPlaceholder]);
      setIsChatStreaming(true);
      setChatError(null);

      const sessionId = activeChatId || `chat-${Date.now()}`;
      if (!activeChatId) setActiveChatId(sessionId);

      const currentAttachments = [...attachments];
      const currentUrls = [...urls];
      setAttachments([]);
      setUrls([]);

      let accumulatedText = '';
      let collectedSources: GroundingSource[] = [];

      try {
        await mentorChatStream(
          {
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            thinkingDepth,
            useWebSearch,
            urls: currentUrls,
            attachments: currentAttachments,
            focusDomain: mentorFocus,
            languagePref,
          },
          {
            signal: controller.signal,
            onChunk: (chunkText) => {
              accumulatedText += chunkText;
              setChatMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: accumulatedText } : m))
              );
            },
            onSources: (sources) => {
              collectedSources = sources;
              setChatMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
              );
            },
          }
        );

        const finalizedMessages: MentorMessage[] = [
          ...nextMessages,
          {
            ...assistantPlaceholder,
            content: accumulatedText,
            sources: collectedSources,
          },
        ];

        setChatSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === sessionId);
          const firstUserText = finalizedMessages.find((m) => m.role === 'user')?.content || text;
          const updatedSession: MentorSession = {
            id: sessionId,
            createdAt: idx !== -1 ? prev[idx].createdAt : Date.now(),
            updatedAt: Date.now(),
            title: idx !== -1 ? prev[idx].title : summarizeTitle(firstUserText),
            focusDomain: mentorFocus,
            messages: finalizedMessages,
            pinned: idx !== -1 ? prev[idx].pinned : false,
          };
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = updatedSession;
            return copy;
          }
          return [updatedSession, ...prev];
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setChatError(err?.message || 'Failed to get response from AI Mentor.');
          setChatMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content.trim() !== ''));
        }
      } finally {
        setIsChatStreaming(false);
        chatAbortRef.current = null;
      }
    },
    [
      isChatStreaming,
      attachments,
      urls,
      chatMessages,
      activeChatId,
      thinkingDepth,
      useWebSearch,
      mentorFocus,
      languagePref,
    ]
  );

  const handleNewSession = () => {
    if (activeTab === 'mentor') {
      handleStopChat();
      setActiveChatId(null);
      setChatMessages([]);
      setChatError(null);
      setAttachments([]);
      setUrls([]);
    } else {
      handleStopForge();
      evalAbortRef.current?.abort();
      optAbortRef.current?.abort();
      setActiveForgeId(null);
      setRawIdea('');
      setForgeOutput('');
      setForgeSources([]);
      setForgeError(null);
      setForgeEvaluation(null);
      setEvaluationError(null);
      setOptimizationResult(null);
      setOptimizationError(null);
      setIsEvaluating(false);
      setIsOptimizing(false);
      setForgeVersions([]);
      setActiveVersionId(null);
      setAttachments([]);
      setUrls([]);
      setActiveTab('forge');
    }
  };

  const handleSelectForgeRecord = (record: ForgeRecord) => {
    handleStopForge();
    evalAbortRef.current?.abort();
    optAbortRef.current?.abort();
    const normalizedVersions: ForgeVersion[] =
      record.versions && record.versions.length > 0
        ? record.versions
        : [
            {
              id: `ver-${record.createdAt}`,
              versionNumber: 1,
              createdAt: record.createdAt,
              label: 'Initial Forge',
              rawIdea: record.rawIdea,
              targetDomain: record.targetDomain,
              style: record.style,
              thinkingDepth: record.thinkingDepth,
              executionMode: record.executionMode,
              tokenMode: record.tokenMode,
              languagePref: record.languagePref,
              outputMarkdown: record.outputMarkdown,
              sources: record.sources || [],
              evaluation: record.evaluation || null,
            },
          ];

    setActiveForgeId(record.id);
    setRawIdea(record.rawIdea);
    setTargetDomain(record.targetDomain);
    setStyle(record.style);
    setThinkingDepth(record.thinkingDepth);
    if (record.executionMode) setExecutionMode(record.executionMode);
    if (record.tokenMode) setTokenMode(record.tokenMode);
    if (record.languagePref) setLanguagePref(record.languagePref);
    setUseWebSearch(record.useWebSearch);
    setUrls(record.urls || []);
    setAttachments([]);
    setForgeOutput(record.outputMarkdown);
    setForgeSources(record.sources || []);
    setForgeError(null);
    setForgeEvaluation(record.evaluation || null);
    setEvaluationError(null);
    setOptimizationResult(null);
    setOptimizationError(null);
    setIsEvaluating(false);
    setIsOptimizing(false);
    setForgeVersions(normalizedVersions);
    setActiveVersionId(record.activeVersionId || normalizedVersions[0].id);
    setActiveTab('forge');
  };

  const handleSelectChatSession = (session: MentorSession) => {
    handleStopChat();
    setActiveChatId(session.id);
    setChatMessages(session.messages);
    setMentorFocus(session.focusDomain);
    setChatError(null);
    setActiveTab('mentor');
  };

  const handleLoadTemplate = (tpl: PromptTemplate) => {
    setAttachments([]);
    setUrls([]);
    setThinkingDepth(tpl.thinkingDepth);
    setUseWebSearch(tpl.useWebSearch);
    if (tpl.executionMode) setExecutionMode(tpl.executionMode);
    if (tpl.languagePref) setLanguagePref(tpl.languagePref);

    if (tpl.targetMode === 'forge') {
      setActiveForgeId(null);
      setTargetDomain(tpl.domain);
      setStyle(tpl.style);
      setRawIdea(tpl.rawIdea);
      setForgeOutput('');
      setForgeSources([]);
      setForgeError(null);
      setForgeEvaluation(null);
      setEvaluationError(null);
      setOptimizationResult(null);
      setOptimizationError(null);
      setForgeVersions([]);
      setActiveVersionId(null);
      setActiveTab('forge');
    } else {
      setActiveChatId(null);
      setMentorFocus(tpl.domain);
      setChatMessages([]);
      setChatError(null);
      setActiveTab('mentor');
      handleSendChatMessage(tpl.rawIdea);
    }
  };

  const handleSendToMentor = (promptText: string, domain: TargetDomain) => {
    setActiveChatId(null);
    setMentorFocus(domain);
    setChatMessages([]);
    setChatError(null);
    setActiveTab('mentor');
    handleSendChatMessage(
      `Here is the Master AI Prompt I forged. Help me execute, validate, or refine the toughest technical steps:\n\n${promptText}`
    );
  };

  const handleConvertToForge = (text: string, domain: TargetDomain) => {
    setActiveForgeId(null);
    setTargetDomain(domain);
    setRawIdea(`Turn this solution & technical discussion into a clean, reusable Master AI-to-AI Prompt:\n\n${text}`);
    setForgeOutput('');
    setForgeSources([]);
    setForgeError(null);
    setForgeEvaluation(null);
    setEvaluationError(null);
    setOptimizationResult(null);
    setOptimizationError(null);
    setForgeVersions([]);
    setActiveVersionId(null);
    setActiveTab('forge');
  };

  const handleForgeFromTranscript = (transcriptText: string) => {
    setActiveForgeId(null);
    setRawIdea(
      `Convert this voice mentor session into a clean, structured Master AI-to-AI Prompt and Execution Plan:\n\n${transcriptText}`
    );
    setForgeOutput('');
    setForgeSources([]);
    setForgeError(null);
    setForgeEvaluation(null);
    setEvaluationError(null);
    setOptimizationResult(null);
    setOptimizationError(null);
    setForgeVersions([]);
    setActiveVersionId(null);
    setActiveTab('forge');
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 overflow-hidden">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onNewSession={handleNewSession}
        onToggleSidebar={() => setIsSidebarOpenMobile((v) => !v)}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <SidebarHistory
          forgeHistory={forgeHistory}
          chatSessions={chatSessions}
          activeForgeId={activeForgeId}
          activeChatId={activeChatId}
          onSelectForge={handleSelectForgeRecord}
          onSelectChat={handleSelectChatSession}
          onDeleteForge={(id) => {
            setForgeHistory((prev) => prev.filter((r) => r.id !== id));
            if (activeForgeId === id) {
              setActiveForgeId(null);
            }
          }}
          onDeleteChat={(id) => {
            setChatSessions((prev) => prev.filter((s) => s.id !== id));
            if (activeChatId === id) {
              setActiveChatId(null);
              setChatMessages([]);
            }
          }}
          onTogglePinForge={(id) =>
            setForgeHistory((prev) => prev.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)))
          }
          onTogglePinChat={(id) =>
            setChatSessions((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)))
          }
          isDark={isDark}
          onToggleTheme={() => setIsDark((d) => !d)}
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeTab === 'forge' && (
            <PromptForgeView
              rawIdea={rawIdea}
              setRawIdea={setRawIdea}
              targetDomain={targetDomain}
              setTargetDomain={setTargetDomain}
              style={style}
              setStyle={setStyle}
              thinkingDepth={thinkingDepth}
              setThinkingDepth={setThinkingDepth}
              executionMode={executionMode}
              setExecutionMode={setExecutionMode}
              agentArchitecture={agentArchitecture}
              setAgentArchitecture={setAgentArchitecture}
              tokenMode={tokenMode}
              setTokenMode={setTokenMode}
              languagePref={languagePref}
              setLanguagePref={setLanguagePref}
              mcpConfig={mcpConfig}
              setMcpConfig={setMcpConfig}
              useWebSearch={useWebSearch}
              setUseWebSearch={setUseWebSearch}
              urls={urls}
              setUrls={setUrls}
              attachments={attachments}
              setAttachments={setAttachments}
              outputMarkdown={forgeOutput}
              sources={forgeSources}
              isStreaming={isForgeStreaming}
              error={forgeError}
              evaluation={forgeEvaluation}
              isEvaluating={isEvaluating}
              evaluationError={evaluationError}
              isOptimizing={isOptimizing}
              optimizationResult={optimizationResult}
              optimizationError={optimizationError}
              versions={forgeVersions}
              activeVersionId={activeVersionId}
              onRevertVersion={handleRevertVersion}
              onEvaluate={handleEvaluatePrompt}
              onOptimizeTokens={handleOptimizeTokens}
              onForge={handleForge}
              onStop={handleStopForge}
              onSendToMentor={handleSendToMentor}
            />
          )}

          {activeTab === 'mentor' && (
            <MentorChatView
              messages={chatMessages}
              focusDomain={mentorFocus}
              setFocusDomain={setMentorFocus}
              languagePref={languagePref}
              setLanguagePref={setLanguagePref}
              thinkingDepth={thinkingDepth}
              setThinkingDepth={setThinkingDepth}
              useWebSearch={useWebSearch}
              setUseWebSearch={setUseWebSearch}
              urls={urls}
              setUrls={setUrls}
              attachments={attachments}
              setAttachments={setAttachments}
              isStreaming={isChatStreaming}
              error={chatError}
              onSendMessage={handleSendChatMessage}
              onStop={handleStopChat}
              onConvertToForge={handleConvertToForge}
            />
          )}

          {activeTab === 'talk' && (
            <TalkModeView
              languagePref={languagePref}
              setLanguagePref={setLanguagePref}
              onForgeFromTranscript={handleForgeFromTranscript}
            />
          )}

          {activeTab === 'templates' && <TemplatesView onLoadTemplate={handleLoadTemplate} />}

          {activeTab === 'guide' && <GuideView onNavigate={setActiveTab} />}
        </main>
      </div>
    </div>
  );
}

export default App;
