import {
  AgentArchitecture,
  AttachmentItem,
  ExecutionMode,
  GroundingSource,
  LanguagePreference,
  McpConfig,
  ParsedForgeSections,
  PromptEvaluation,
  PromptStyle,
  TargetDomain,
  ThinkingDepth,
  TokenOptimizationMode,
  TokenOptimizationResult,
} from '../types';

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export interface ForgeRequestPayload {
  rawIdea: string;
  targetDomain: TargetDomain;
  style: PromptStyle;
  thinkingDepth: ThinkingDepth;
  executionMode?: ExecutionMode;
  agentArchitecture?: AgentArchitecture;
  tokenMode?: TokenOptimizationMode;
  languagePref?: LanguagePreference;
  mcpConfig?: McpConfig;
  useWebSearch: boolean;
  urls: string[];
  attachments: AttachmentItem[];
  refinementInstruction?: string;
  previousPrompt?: string;
}

export interface MentorChatPayload {
  messages: { role: 'user' | 'assistant'; content: string }[];
  thinkingDepth: ThinkingDepth;
  useWebSearch: boolean;
  urls: string[];
  attachments: AttachmentItem[];
  focusDomain: TargetDomain;
  languagePref?: LanguagePreference;
}

async function consumeSseStream(
  response: Response,
  onChunk: (text: string) => void,
  onSources: (sources: GroundingSource[]) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `Server responded with status ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Streaming response body is unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;

      let event: any;
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      if (event.type === 'chunk' && typeof event.text === 'string') {
        onChunk(event.text);
      } else if (event.type === 'sources' && Array.isArray(event.sources)) {
        onSources(event.sources);
      } else if (event.type === 'error') {
        throw new Error(event.message || 'An error occurred while communicating with the AI Mentor.');
      } else if (event.type === 'done') {
        return;
      }
    }
  }
}

export async function forgePromptStream(
  payload: ForgeRequestPayload,
  callbacks: {
    onChunk: (text: string) => void;
    onSources: (sources: GroundingSource[]) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  const response = await fetch('/api/mentor/forge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: callbacks.signal,
  });

  await consumeSseStream(response, callbacks.onChunk, callbacks.onSources, callbacks.signal);
}

export async function mentorChatStream(
  payload: MentorChatPayload,
  callbacks: {
    onChunk: (text: string) => void;
    onSources: (sources: GroundingSource[]) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  const response = await fetch('/api/mentor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: callbacks.signal,
  });

  await consumeSseStream(response, callbacks.onChunk, callbacks.onSources, callbacks.signal);
}

export interface EvaluatePromptPayload {
  masterPrompt: string;
  rawIdea?: string;
  targetDomain: TargetDomain;
  style: PromptStyle;
}

export async function evaluateForgedPrompt(
  payload: EvaluatePromptPayload,
  signal?: AbortSignal
): Promise<PromptEvaluation> {
  const response = await fetch('/api/mentor/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Evaluation failed with status ${response.status}`);
  }
  return data as PromptEvaluation;
}

export async function optimizePromptTokens(
  payload: { masterPrompt: string; mode: 'balanced' | 'ultra_lean'; targetModel?: string },
  signal?: AbortSignal
): Promise<TokenOptimizationResult> {
  const response = await fetch('/api/mentor/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Optimization failed with status ${response.status}`);
  }
  return data as TokenOptimizationResult;
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const response = await fetch('/api/audio/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Transcription failed with status ${response.status}`);
  }
  return String(data?.text || '');
}

export async function synthesizeSpeech(payload: {
  text: string;
  voiceName?: string;
  style?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const response = await fetch('/api/audio/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Speech synthesis failed with status ${response.status}`);
  }
  return {
    audioBase64: String(data.audioBase64),
    mimeType: String(data.mimeType || 'audio/wav'),
  };
}

export function parseForgeMarkdown(markdown: string): ParsedForgeSections {
  const extractSection = (startHeading: string, nextHeadings: string[]): string => {
    const startIdx = markdown.indexOf(startHeading);
    if (startIdx === -1) return '';
    const contentStart = startIdx + startHeading.length;
    let endIdx = markdown.length;
    for (const next of nextHeadings) {
      const idx = markdown.indexOf(next, contentStart);
      if (idx !== -1 && idx < endIdx) {
        endIdx = idx;
      }
    }
    return markdown.slice(contentStart, endIdx).trim();
  };

  const h1 = '### 1. Behavioral & Intent Diagnosis';
  const h2 = '### 2. Clarified Goal (ANG Fixed Words)';
  const h3 = '### 3. Master AI-to-AI Prompt';
  const h4 = '### 4. Full-Stack Execution Blueprint';
  const h5 = '### 5. Verification & Edge-Case Guardrails';

  const diagnosis = extractSection(h1, [h2, h3, h4, h5]);
  const clarifiedGoal = extractSection(h2, [h3, h4, h5]);
  const masterSectionRaw = extractSection(h3, [h4, h5]);
  const blueprint = extractSection(h4, [h5]);
  const guardrails = extractSection(h5, []);

  // Unwrap fenced markdown/prompt block from Section 3 if present
  let masterPrompt = masterSectionRaw;
  const fenceMatch = masterSectionRaw.match(/^```(?:markdown|md|prompt|text)?\s*\n([\s\S]*?)\n```$/i);
  if (fenceMatch) {
    masterPrompt = fenceMatch[1].trim();
  } else {
    // Handle partial streaming fence cleanly
    const partialFence = masterSectionRaw.match(/^```(?:markdown|md|prompt|text)?\s*\n([\s\S]*)$/i);
    if (partialFence) {
      masterPrompt = partialFence[1].replace(/\n```$/, '').trim();
    }
  }

  return {
    diagnosis,
    clarifiedGoal,
    masterPrompt,
    blueprint,
    guardrails,
    raw: markdown,
  };
}
