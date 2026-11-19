import {
  AgentArchitecture,
  ExecutionMode,
  LanguagePreference,
  PromptStyle,
  PromptTemplate,
  TargetDomain,
  TargetModelFamily,
  ThinkingDepth,
  TokenOptimizationMode,
} from './types';

export const PROMPT_STYLES: {
  label: string;
  value: PromptStyle;
  description: string;
}[] = [
  {
    label: 'Engineering Spec',
    value: PromptStyle.Engineering,
    description: 'Architecture-grade prompt with roles, interfaces, edge cases, and acceptance criteria.',
  },
  {
    label: 'Executive Direct',
    value: PromptStyle.Executive,
    description: 'Zero-fluff, high-signal instructions optimized for fast, accurate AI execution.',
  },
  {
    label: 'Detailed & Rich',
    value: PromptStyle.Detailed,
    description: 'Deep contextual framing, behavioral nuances, sensory/domain depth, and examples.',
  },
  {
    label: 'Cinematic Visual',
    value: PromptStyle.Cinematic,
    description: 'Camera angles, lighting physics, lens framing, and mood for visual or video AI.',
  },
  {
    label: 'Minimalist Sharp',
    value: PromptStyle.Minimalist,
    description: 'Distilled core constraints only—maximum clarity in minimum tokens.',
  },
  {
    label: 'Mentor Diagnostic',
    value: PromptStyle.Socratic,
    description: 'Step-by-step reasoning, root-cause decomposition, and guided verification.',
  },
];

export const TARGET_DOMAINS: {
  value: TargetDomain;
  label: string;
  hint: string;
}[] = [
  {
    value: 'general',
    label: 'All-Around AI Work',
    hint: 'Auto-fix rough words into crystal-clear AI-to-AI instructions for any task.',
  },
  {
    value: 'fullstack',
    label: 'Full-Stack Engineering',
    hint: 'End-to-end frontend, backend API, database schema, state, and deployment prompts.',
  },
  {
    value: 'frontend_ux',
    label: 'Frontend & UX Psychology',
    hint: 'Ergonomics, user behavior, accessibility, layout rhythm, and interactive UI flows.',
  },
  {
    value: 'backend_api',
    label: 'Backend, APIs & Auth',
    hint: 'Express/Node routes, data validation, error resilience, concurrency, and security.',
  },
  {
    value: 'agent_system',
    label: 'AI Agent & System Prompt',
    hint: 'Tool-use orchestration, guardrails, persona calibration, and deterministic outputs.',
  },
  {
    value: 'image_visual',
    label: 'Image Generation AI',
    hint: 'Subject, lighting, composition, material textures, aspect ratio, and style controls.',
  },
  {
    value: 'video_motion',
    label: 'Video & Motion AI',
    hint: 'Temporal pacing, camera movement, transitions, audio cues, and shot continuity.',
  },
  {
    value: 'research',
    label: 'Research & Deep Synthesis',
    hint: 'Web-grounded verification, comparative trade-offs, and evidence-backed briefs.',
  },
];

export const THINKING_DEPTHS: {
  value: ThinkingDepth;
  label: string;
  detail: string;
}[] = [
  { value: 'low', label: 'Fast', detail: 'Low latency' },
  { value: 'high', label: 'Balanced', detail: 'Deep reasoning' },
  { value: 'xhigh', label: 'Architect', detail: 'Max XHigh depth' },
];

export const EXECUTION_MODES: {
  value: ExecutionMode;
  label: string;
  detail: string;
}[] = [
  {
    value: 'standard',
    label: 'Prompt Forge',
    detail: 'Auto-fix rough ideas into precision AI-to-AI prompts',
  },
  {
    value: 'agent',
    label: 'Agent Mode',
    detail: 'Autonomous multi-step agent loop, tool policy, memory & handoff',
  },
  {
    value: 'mcp',
    label: 'MCP & Open-Source',
    detail: 'Connect open-source skills, MCP server links & open models via URL',
  },
];

export const TOKEN_MODES: {
  value: TokenOptimizationMode;
  label: string;
  detail: string;
}[] = [
  { value: 'standard', label: 'Full Detail', detail: 'Complete rich prompt' },
  { value: 'balanced', label: 'Trimmed (-30%)', detail: 'Removes filler words' },
  { value: 'ultra_lean', label: 'Ultra-Lean (-55%)', detail: 'Dense high-signal spec' },
];

export const LANGUAGE_PREFERENCES: {
  value: LanguagePreference;
  label: string;
  hint: string;
}[] = [
  {
    value: 'bilingual_urdu',
    label: 'Urdu + English (Easy)',
    hint: 'Aasaan Urdu/Roman Urdu mein samjhao + English Master AI Prompt do',
  },
  {
    value: 'urdu',
    label: 'اردو (Pure Urdu)',
    hint: 'Mukammal Urdu wazahat aur prompt guidance',
  },
  {
    value: 'english',
    label: 'English',
    hint: 'Standard technical English across all sections',
  },
];

export const AGENT_ARCHITECTURES: {
  value: AgentArchitecture;
  label: string;
  hint: string;
}[] = [
  {
    value: 'single',
    label: 'Single Tool-Using Agent',
    hint: 'Focused ReAct loop with clear tool boundaries and verification.',
  },
  {
    value: 'planner_executor',
    label: 'Planner + Executor',
    hint: 'Separates upfront step decomposition from tool execution & review.',
  },
  {
    value: 'multi_agent',
    label: 'Multi-Agent Orchestrator',
    hint: 'Supervisor coordinating specialized sub-agents with explicit handoffs.',
  },
  {
    value: 'coding_agent',
    label: 'Autonomous Coding Agent',
    hint: 'Read-first inspection, surgical edits, build/lint loop, and rollback safety.',
  },
];

export const TARGET_MODEL_FAMILIES: {
  value: TargetModelFamily;
  label: string;
  openSource: boolean;
}[] = [
  { value: 'universal', label: 'Universal (Any LLM)', openSource: false },
  { value: 'llama', label: 'Meta Llama 3 / 4 (Open Source)', openSource: true },
  { value: 'qwen', label: 'Qwen 2.5 / 3 Coder (Open Source)', openSource: true },
  { value: 'deepseek', label: 'DeepSeek R1 / V3 (Open Source)', openSource: true },
  { value: 'gemma', label: 'Google Gemma 3 (Open Source)', openSource: true },
  { value: 'mistral', label: 'Mistral / Mixtral (Open Source)', openSource: true },
  { value: 'gemini', label: 'Google Gemini 3 / 4', openSource: false },
  { value: 'claude', label: 'Anthropic Claude', openSource: false },
  { value: 'gpt', label: 'OpenAI GPT / o-series', openSource: false },
];

export const MCP_SKILL_PRESETS: {
  id: string;
  label: string;
  url: string;
  description: string;
}[] = [
  {
    id: 'mcp-spec',
    label: 'MCP Protocol Spec',
    url: 'https://modelcontextprotocol.io/introduction',
    description: 'Official Model Context Protocol architecture, tools, resources & prompts.',
  },
  {
    id: 'mcp-servers',
    label: 'MCP Open-Source Servers',
    url: 'https://github.com/modelcontextprotocol/servers',
    description: 'Reference open-source MCP servers (Filesystem, Git, Postgres, Fetch, Memory).',
  },
  {
    id: 'huggingface-models',
    label: 'HuggingFace Open Models',
    url: 'https://huggingface.co/models',
    description: 'Open-weights model cards, chat templates & tokenizer guidelines.',
  },
  {
    id: 'ollama-library',
    label: 'Ollama Local Models',
    url: 'https://ollama.com/library',
    description: 'Run open-source Llama, Qwen, DeepSeek & Gemma locally via Ollama.',
  },
];

export const LIVE_VOICE_OPTIONS: {
  value: 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
  label: string;
  tone: string;
}[] = [
  { value: 'Zephyr', label: 'Zephyr', tone: 'Calm & clear mentor' },
  { value: 'Kore', label: 'Kore', tone: 'Warm & articulate' },
  { value: 'Puck', label: 'Puck', tone: 'Energetic & quick' },
  { value: 'Charon', label: 'Charon', tone: 'Deep & steady architect' },
  { value: 'Fenrir', label: 'Fenrir', tone: 'Direct & crisp' },
];

export const QUICK_REFINEMENTS: {
  id: string;
  label: string;
  instruction: string;
}[] = [
  {
    id: 'sharpen',
    label: 'Sharpen Technical Rigor',
    instruction:
      'Make the Master AI-to-AI Prompt significantly more technically rigorous: add explicit input/output contracts, edge cases, failure recovery, and measurable acceptance criteria.',
  },
  {
    id: 'concise',
    label: 'Compress to High-Signal',
    instruction:
      'Keep the exact intent and constraints, but compress the Master AI-to-AI Prompt by 40% into ultra-clean, high-signal directives without losing precision.',
  },
  {
    id: 'system_prompt',
    label: 'Convert to System Prompt',
    instruction:
      'Convert the Master AI-to-AI Prompt into a production-ready System Instruction block with Role, Behavioral Rules, Tool Policy, Refusal Avoidance (always solve constructively), and Output Schema.',
  },
  {
    id: 'ux_psych',
    label: 'Add User Psychology & UX',
    instruction:
      'Enhance the prompt and blueprint with explicit human behavioral psychology, cognitive load reduction, physical ergonomics, and intuitive error-recovery UX.',
  },
  {
    id: 'roman_urdu_bridge',
    label: 'Urdu + English Easy Mode',
    instruction:
      'Keep the Master AI-to-AI Prompt in crisp professional English for AI models, and explain the Behavioral Diagnosis, Clarified Goal, Execution Blueprint, and Guardrails in simple Urdu / Roman Urdu so anyone can understand immediately.',
  },
];

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'roman-urdu-fullstack',
    title: 'Roman Urdu Rough Idea -> Production Full-Stack Spec',
    domain: 'fullstack',
    style: PromptStyle.Engineering,
    thinkingDepth: 'xhigh',
    useWebSearch: false,
    executionMode: 'standard',
    languagePref: 'bilingual_urdu',
    targetMode: 'forge',
    summary: 'Turns casual Urdu/Roman Urdu thoughts into a clear Urdu explanation + Pro English AI prompt.',
    rawIdea:
      'Bhai mujhe ek SaaS dashboard banana hai jahan team apny daily tasks or client invoices track kry, dark mode clean ho, backend API fast ho aur koi error aye to user ko clear guide mily, iska AI ko dene wala best prompt aur full-stack plan bana do.',
  },
  {
    id: 'agent-autonomous-coder',
    title: 'Autonomous Coding & Tool-Using AI Agent Prompt',
    domain: 'agent_system',
    style: PromptStyle.Engineering,
    thinkingDepth: 'xhigh',
    useWebSearch: false,
    executionMode: 'agent',
    languagePref: 'english',
    targetMode: 'forge',
    summary: 'Creates a Planner + Executor agent prompt with tool policies, memory & verification loops.',
    rawIdea:
      'Build an autonomous full-stack engineering agent that inspects project files before editing, runs build and typechecks after every change, never hallucinates file paths, and recovers gracefully when a tool returns an error.',
  },
  {
    id: 'mcp-open-source-connector',
    title: 'MCP Server & Open-Source Model Skill Integrator',
    domain: 'backend_api',
    style: PromptStyle.Executive,
    thinkingDepth: 'high',
    useWebSearch: false,
    executionMode: 'mcp',
    languagePref: 'english',
    targetMode: 'forge',
    summary: 'Reads MCP docs/open-source skill links and generates mcp.json + Qwen/Llama-ready system prompt.',
    rawIdea:
      'Integrate an open-source Filesystem and Postgres MCP server with a local Qwen 3 Coder / Llama model so the assistant can inspect schemas safely in read-only mode and generate migration scripts.',
  },
  {
    id: 'ux-behavior-audit',
    title: 'UX Psychology & Conversion Friction Audit',
    domain: 'frontend_ux',
    style: PromptStyle.Socratic,
    thinkingDepth: 'high',
    useWebSearch: false,
    executionMode: 'standard',
    languagePref: 'english',
    targetMode: 'forge',
    summary: 'Diagnoses why users drop off on mobile/desktop and crafts a redesign prompt.',
    rawIdea:
      'Users land on our signup and checkout page, look around for 10 seconds, and leave without clicking submit. Analyze human cognitive load, thumb reachability, visual trust signals, and write a prompt to redesign the flow.',
  },
  {
    id: 'debug-root-cause',
    title: 'Root-Cause Full-Stack Bug Solver',
    domain: 'backend_api',
    style: PromptStyle.Engineering,
    thinkingDepth: 'xhigh',
    useWebSearch: true,
    targetMode: 'mentor',
    summary: 'Interactive mentor session for tracing race conditions, CORS, auth, or SSE streaming bugs.',
    rawIdea:
      'My Express + React app intermittently drops SSE streams behind a proxy and returns 502 on large payloads. Walk me through root causes, exact fixes for server.ts and client fetch, and verification tests.',
  },
  {
    id: 'urdu-easy-business-prompt',
    title: 'Aasaan Urdu Business & Marketing AI Prompt',
    domain: 'general',
    style: PromptStyle.Detailed,
    thinkingDepth: 'high',
    useWebSearch: false,
    executionMode: 'standard',
    languagePref: 'urdu',
    targetMode: 'forge',
    summary: 'Urdu bolne walay users ke liye aasaan Urdu mein mukammal AI prompt aur roadmap.',
    rawIdea:
      'Mujhe apne local clothing aur online store ke liye WhatsApp aur Instagram par customers se baat karne aur daily posts likhne ke liye ek smart AI prompt chahiye jo simple Urdu aur English dono mein reply kare.',
  },
];
