export enum PromptStyle {
  Engineering = 'Engineering Spec',
  Executive = 'Executive & Direct',
  Detailed = 'Detailed & Evocative',
  Cinematic = 'Cinematic & Visual',
  Minimalist = 'Minimalist Sharp',
  Socratic = 'Mentor & Diagnostic',
}

export type TargetDomain =
  | 'general'
  | 'fullstack'
  | 'frontend_ux'
  | 'backend_api'
  | 'agent_system'
  | 'image_visual'
  | 'video_motion'
  | 'research';

export type ThinkingDepth = 'low' | 'high' | 'xhigh';

export type WorkspaceTab = 'forge' | 'mentor' | 'talk' | 'templates' | 'guide';

export type ExecutionMode = 'standard' | 'agent' | 'mcp';

export type TokenOptimizationMode = 'standard' | 'balanced' | 'ultra_lean';

export type LanguagePreference = 'english' | 'bilingual_urdu' | 'urdu';

export type AgentArchitecture =
  | 'single'
  | 'planner_executor'
  | 'multi_agent'
  | 'coding_agent';

export type TargetModelFamily =
  | 'universal'
  | 'gemini'
  | 'claude'
  | 'gpt'
  | 'llama'
  | 'qwen'
  | 'deepseek'
  | 'gemma'
  | 'mistral';

export interface McpConfig {
  targetModel: TargetModelFamily;
  skillUrls: string[];
  mcpManifestSnippet: string;
}

export interface AttachmentItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64 for binary/images/pdf, or raw utf-8 text for code/text files
  isText: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
  sourceType: 'web' | 'url';
}

export interface ParsedForgeSections {
  diagnosis: string;
  clarifiedGoal: string;
  masterPrompt: string;
  blueprint: string;
  guardrails: string;
  raw: string;
}

export interface PromptCriterionScore {
  key: 'clarity' | 'specificity' | 'context';
  label: string;
  score: number; // 0 to 100
  band: string;
  rubricLevel: string;
  confidence: number;
  diagnosis: string;
}

export interface PromptImprovement {
  id: string;
  criterion: 'Clarity' | 'Specificity' | 'Context';
  impact: 'High' | 'Medium';
  title: string;
  issue: string;
  recommendation: string;
  applyDirective: string;
}

export interface PromptEvaluation {
  evaluatedAt: number;
  overallScore: number;
  portableAcrossLlms: boolean;
  portabilityConfidence: number;
  summaryVerdict: string;
  crossLlmNotes: string;
  criteria: PromptCriterionScore[];
  improvements: PromptImprovement[];
}

export interface TokenOptimizationResult {
  optimizedPrompt: string;
  beforeTokens: number;
  afterTokens: number;
  savedPercent: number;
  techniquesApplied: string[];
}

export interface ForgeVersion {
  id: string;
  versionNumber: number;
  createdAt: number;
  label: string;
  rawIdea: string;
  targetDomain: TargetDomain;
  style: PromptStyle;
  thinkingDepth: ThinkingDepth;
  executionMode?: ExecutionMode;
  tokenMode?: TokenOptimizationMode;
  languagePref?: LanguagePreference;
  outputMarkdown: string;
  sources: GroundingSource[];
  evaluation?: PromptEvaluation | null;
}

export interface ForgeRecord {
  id: string;
  createdAt: number;
  title: string;
  rawIdea: string;
  targetDomain: TargetDomain;
  style: PromptStyle;
  thinkingDepth: ThinkingDepth;
  executionMode?: ExecutionMode;
  tokenMode?: TokenOptimizationMode;
  languagePref?: LanguagePreference;
  useWebSearch: boolean;
  urls: string[];
  attachmentNames: string[];
  outputMarkdown: string;
  sources: GroundingSource[];
  evaluation?: PromptEvaluation | null;
  versions?: ForgeVersion[];
  activeVersionId?: string;
  pinned?: boolean;
}

export interface MentorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachmentNames?: string[];
  urls?: string[];
  sources?: GroundingSource[];
}

export interface MentorSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  focusDomain: TargetDomain;
  messages: MentorMessage[];
  pinned?: boolean;
}

export interface PromptTemplate {
  id: string;
  title: string;
  domain: TargetDomain;
  style: PromptStyle;
  thinkingDepth: ThinkingDepth;
  useWebSearch: boolean;
  executionMode?: ExecutionMode;
  languagePref?: LanguagePreference;
  summary: string;
  rawIdea: string;
  targetMode: 'forge' | 'mentor';
}

export interface TalkTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface PromptSectionMetric {
  id: string;
  name: string;
  tokens: number;
  words: number;
  chars: number;
  sharePercent: number;
  complexityScore: number;
  constraintCount: number;
  codeBlockCount: number;
  listItemCount: number;
  preview: string;
  fullText: string;
}

export interface ComplexityAxisMetric {
  key:
    | 'constraintDensity'
    | 'structuralDepth'
    | 'technicalSpecificity'
    | 'lexicalDiversity'
    | 'directiveDensity';
  label: string;
  value: number;
  detail: string;
}

export interface PromptAnalyticsReport {
  scope: 'master' | 'full';
  totalTokens: number;
  totalWords: number;
  totalLines: number;
  avgSentenceWords: number;
  codeBlockCount: number;
  constraintCount: number;
  complexityIndex: number;
  complexityLabel: 'Lean' | 'Balanced' | 'Dense Spec' | 'Deep Multi-Constraint';
  topConsumer: PromptSectionMetric | null;
  sections: PromptSectionMetric[];
  axes: ComplexityAxisMetric[];
}
