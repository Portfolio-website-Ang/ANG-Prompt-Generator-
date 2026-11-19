import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ID = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please check your Settings > Secrets panel.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getDecisionsAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please check your Settings > Secrets panel.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveThinkingLevel(depth?: string): ThinkingLevel {
  switch (depth) {
    case 'low':
      return ThinkingLevel.LOW;
    case 'xhigh':
      return ThinkingLevel.XHIGH;
    case 'high':
    default:
      return ThinkingLevel.HIGH;
  }
}

interface IncomingAttachment {
  name: string;
  mimeType: string;
  data: string;
  isText?: boolean;
}

interface IncomingSource {
  title: string;
  uri: string;
  sourceType: 'web' | 'url';
}

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function sanitizeUrls(urls: unknown, maxCount = 8): string[] {
  if (!Array.isArray(urls)) return [];
  const valid: string[] = [];
  for (const item of urls) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        if (!valid.includes(parsed.toString())) {
          valid.push(parsed.toString());
        }
      }
    } catch {
      // Ignore malformed URLs
    }
    if (valid.length >= maxCount) break;
  }
  return valid;
}

function buildContentParts(
  textPrompt: string,
  attachments: IncomingAttachment[] = [],
  urls: string[] = []
) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  const textFiles: string[] = [];
  for (const att of attachments.slice(0, 6)) {
    if (!att || !att.data) continue;
    if (att.isText || att.mimeType.startsWith('text/') || att.mimeType === 'application/json') {
      const snippet = att.data.length > 60000 ? `${att.data.slice(0, 60000)}\n...[truncated]` : att.data;
      textFiles.push(`--- Attached File: ${att.name} (${att.mimeType}) ---\n${snippet}`);
    } else {
      parts.push({
        inlineData: {
          mimeType: att.mimeType || 'application/octet-stream',
          data: att.data,
        },
      });
    }
  }

  let combinedText = textPrompt;
  if (urls.length > 0) {
    combinedText += `\n\nReference URLs to read and analyze:\n${urls.map((u) => `- ${u}`).join('\n')}`;
  }
  if (textFiles.length > 0) {
    combinedText += `\n\nAttached Context Files:\n${textFiles.join('\n\n')}`;
  }

  parts.push({ text: combinedText });
  return parts;
}

function extractGroundingSources(chunk: any): IncomingSource[] {
  const collected: IncomingSource[] = [];
  const candidate = chunk?.candidates?.[0];
  const groundingChunks = candidate?.groundingMetadata?.groundingChunks;
  if (Array.isArray(groundingChunks)) {
    for (const gc of groundingChunks) {
      if (gc?.web?.uri) {
        collected.push({
          title: gc.web.title || gc.web.uri,
          uri: gc.web.uri,
          sourceType: 'web',
        });
      }
    }
  }
  const urlMeta = candidate?.urlContextMetadata?.urlMetadata;
  if (Array.isArray(urlMeta)) {
    for (const um of urlMeta) {
      if (um?.retrievedUrl) {
        collected.push({
          title: um.retrievedUrl,
          uri: um.retrievedUrl,
          sourceType: 'url',
        });
      }
    }
  }
  return collected;
}

function mapGeminiError(err: any): { status: number; message: string } {
  const raw = err?.message || String(err || 'Unknown server error');
  const status = Number(err?.status || err?.code) || 500;
  if (raw.includes('API_KEY_INVALID') || status === 400 && raw.toLowerCase().includes('api key')) {
    return { status: 400, message: 'Invalid Gemini API key. Please check your Settings > Secrets panel.' };
  }
  if (raw.includes('PERMISSION_DENIED') || status === 403) {
    return { status: 403, message: 'Permission denied by Gemini API. Please verify your key in Settings > Secrets.' };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || status === 429) {
    return { status: 429, message: 'Rate limit or quota reached. Please wait a moment and try again.' };
  }
  if (raw.includes('NOT_FOUND') || status === 404) {
    return { status: 404, message: `Model ${MODEL_ID} was not found or is unavailable.` };
  }
  return { status: status >= 400 && status < 600 ? status : 500, message: raw };
}

const ANG_FORGE_SYSTEM_INSTRUCTION = `You are ANG — an elite Principal Full-Stack Architect (Frontend + Backend), AI Systems Engineer, and Human Behavioral & UX Strategist.

Core Operating Identity:
1. Solution-First, Never Say "No": You never hit passive dead-ends or refuse constructive help. If a user's request is vague, incomplete, messy, or challenging, you diagnose the root intent, resolve ambiguities intelligently, and always deliver a workable, ethical, production-grade path forward.
2. Behavioral, Psychological & Physical Ergonomics Insight: You read *between the lines* of how the user writes (including English, Roman Urdu, Urdu, shorthand, or frustrated notes). You infer their true goal, skill level, cognitive friction, user psychology, and physical/UI ergonomics (e.g., thumb reach, scan hierarchy, decision fatigue, emotional trust).
3. Tool & Context Mastery: Carefully inspect every attached screenshot, image, PDF, source code file, reference URL, and live web search result provided. Ground your prompt and technical blueprint strictly in what you read—never guess when evidence is attached.
4. ANG Word-Fixer ("AI-to-AI Talk"): Transform the user's rough words into an unambiguous, precision-engineered "Master AI-to-AI Prompt" that any frontier AI model or coding assistant can execute immediately with extraordinary accuracy.

Mandatory Output Structure (Use these EXACT Markdown H3 headings in order):

### 1. Behavioral & Intent Diagnosis
Analyze what the user is truly trying to achieve, their implicit constraints, UX/human psychology dynamics, and any hidden bottlenecks you spotted in their prompt, files, or URLs.

### 2. Clarified Goal (ANG Fixed Words)
Rewrite the user's rough idea into clear, confident, unambiguous requirements so the user sees their own thoughts elevated.

### 3. Master AI-to-AI Prompt
Provide ONLY the copy-ready, standalone Master Prompt inside a single fenced \`\`\`markdown code block (so it is immediately copyable as one clean artifact). Make it complete with Role, Context, Technical/Creative Constraints, Step-by-Step Execution Directives, and Verification Criteria tailored to the requested Target Domain and Prompt Style.

### 4. Full-Stack Execution Blueprint
Provide a concrete, actionable implementation or problem-solving guide (frontend, backend, data flow, APIs, or creative workflow) that directly empowers the user to execute right now.

### 5. Verification & Edge-Case Guardrails
List the top 3-5 real-world failure modes, security/accessibility checks, or verification tests to guarantee success.`;

const ANG_MENTOR_SYSTEM_INSTRUCTION = `You are ANG Mentor — a Principal Full-Stack Software Engineer (React, TypeScript, Node/Express, Databases, Auth, Cloud), AI Prompt Architect, and Behavioral UX Specialist.

Your Mentoring Standard:
- Always solve, never stonewall: Give direct, working solutions, concrete architectural options, and root-cause reasoning. If something is ambiguous, state your smart assumption and give the complete solution immediately.
- Read the user deeply: Understand English, Roman Urdu, Urdu, or mixed technical shorthand seamlessly. Match their practical goal while elevating engineering quality.
- Inspect every clue: Read attached code files, error screenshots, PDFs, reference URLs, and live web search results thoroughly before answering.
- Full-Stack & UX Fluency: Connect backend reliability (validation, error codes, streaming, security) with frontend ergonomics and human psychology (latency perception, clear states, cognitive simplicity).
- Practical Output: Use clean Markdown headings, concrete TypeScript/code snippets when helpful, and end complex debugging answers with a quick verification checklist.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: MODEL_ID });
  });

  app.post('/api/mentor/forge', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const {
        rawIdea,
        targetDomain = 'general',
        style = 'Engineering Spec',
        thinkingDepth = 'high',
        executionMode = 'standard',
        agentArchitecture = 'planner_executor',
        tokenMode = 'standard',
        languagePref = 'english',
        mcpConfig,
        useWebSearch = false,
        urls: rawUrls = [],
        attachments = [],
        refinementInstruction,
        previousPrompt,
      } = req.body || {};

      if (!rawIdea || typeof rawIdea !== 'string' || !rawIdea.trim()) {
        sendEvent({ type: 'error', message: 'Please enter an idea, problem, or rough notes to forge.' });
        res.end();
        return;
      }

      const ai = getAiClient();
      const mcpSkillUrls = Array.isArray(mcpConfig?.skillUrls) ? mcpConfig.skillUrls : [];
      const urls = sanitizeUrls([...(Array.isArray(rawUrls) ? rawUrls : []), ...mcpSkillUrls], 8);
      const tools: Array<Record<string, unknown>> = [];
      if (useWebSearch) tools.push({ googleSearch: {} });
      if (urls.length > 0) tools.push({ urlContext: {} });

      const modeDirectives: string[] = [];

      if (executionMode === 'agent') {
        modeDirectives.push(
          `EXECUTION MODE: AGENT MODE (${agentArchitecture}).
Engineer the Master AI-to-AI Prompt specifically as an autonomous AI Agent specification. Explicitly define:
- Agent Role & Autonomy Boundaries
- Planning & Reflection Loop (step decomposition before action)
- Tool-Calling Policy (read-before-write, argument validation, retry/backoff)
- Memory, Context & State Tracking
- Loop Guards, Escalation Triggers & Structured Handoff Contract`
        );
      } else if (executionMode === 'mcp') {
        const targetModel = mcpConfig?.targetModel || 'universal';
        const manifestSnippet = typeof mcpConfig?.mcpManifestSnippet === 'string' ? mcpConfig.mcpManifestSnippet.trim() : '';
        modeDirectives.push(
          `EXECUTION MODE: MCP & OPEN-SOURCE SKILLS MODE.
Target LLM Family: ${targetModel}.
Read every linked Open-Source Skill / MCP Server / Model URL provided via urlContext carefully.
- Tailor the Master AI-to-AI Prompt syntax and tool-use directives specifically for ${targetModel} (including open-source model best practices if targeting Llama, Qwen, DeepSeek, Gemma, or Mistral).
- Include explicit MCP Tool / Resource / Skill invocation rules in the Master Prompt.
- In Section 4 (Full-Stack Execution Blueprint), include a ready-to-use \`mcpServers\` JSON configuration block and skill wiring guide.${
            manifestSnippet ? `\n\nUser-provided MCP Config / Skill Snippet:\n\`\`\`json\n${manifestSnippet}\n\`\`\`` : ''
          }`
        );
      }

      if (tokenMode === 'balanced') {
        modeDirectives.push(
          `TOKEN OPTIMIZATION: BALANCED TRIM.
Keep Section 3 (Master AI-to-AI Prompt) crisp and ~30% leaner by removing filler prose, redundant adjectives, and repeated instructions while keeping 100% of constraints and verification criteria.`
        );
      } else if (tokenMode === 'ultra_lean') {
        modeDirectives.push(
          `TOKEN OPTIMIZATION: ULTRA-LEAN HIGH-SIGNAL.
Compress Section 3 (Master AI-to-AI Prompt) into ultra-dense, zero-fluff, high-signal technical directives (~50% fewer tokens). Use compact structured bullets, crisp imperative verbs, and explicit I/O contracts with zero conversational padding.`
        );
      }

      if (languagePref === 'bilingual_urdu') {
        modeDirectives.push(
          `LANGUAGE & ACCESSIBILITY: EASY URDU + ENGLISH BILINGUAL.
Write Sections 1, 2, 4, and 5 in super easy, warm Roman Urdu + simple English (so an Urdu-speaking user immediately understands every step without technical overwhelm). Keep Section 3 (Master AI-to-AI Prompt) in crisp, universal professional English so any AI model executes it at peak accuracy.`
        );
      } else if (languagePref === 'urdu') {
        modeDirectives.push(
          `LANGUAGE & ACCESSIBILITY: PURE URDU (اردو).
Write Sections 1, 2, 4, and 5 in clear, natural, easy-to-read Urdu script (اردو) so any Urdu speaker can easily understand and work with it. In Section 3 (Master AI-to-AI Prompt), craft a clear, high-performing prompt (in English with Urdu explanation or Urdu/English as best fits the target AI) so the user gets effortless results.`
        );
      }

      let userRequest = `Target Domain: ${targetDomain}
Desired Prompt Style: ${style}
${modeDirectives.length > 0 ? `\nActive Studio Directives:\n${modeDirectives.join('\n\n')}\n` : ''}
User's Raw Input / Rough Words:
"""
${rawIdea.trim()}
"""`;

      if (refinementInstruction && previousPrompt) {
        userRequest += `\n\nPrevious Master AI-to-AI Prompt:\n"""\n${previousPrompt}\n"""\n\nRefinement Directive to Apply:\n${refinementInstruction}\n\nRe-synthesize all 5 sections with this refinement applied cleanly.`;
      }

      const contents = [
        {
          role: 'user',
          parts: buildContentParts(userRequest, attachments, urls),
        },
      ];

      const stream = await ai.models.generateContentStream({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: ANG_FORGE_SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: resolveThinkingLevel(thinkingDepth),
          },
          ...(tools.length > 0 ? { tools } : {}),
        },
      });

      const seenUris = new Set<string>();
      const collectedSources: IncomingSource[] = [];

      for await (const chunk of stream) {
        if (closed) break;
        const text = chunk.text;
        if (text) {
          sendEvent({ type: 'chunk', text });
        }
        const sources = extractGroundingSources(chunk);
        for (const s of sources) {
          if (!seenUris.has(s.uri)) {
            seenUris.add(s.uri);
            collectedSources.push(s);
          }
        }
      }

      if (collectedSources.length > 0) {
        sendEvent({ type: 'sources', sources: collectedSources });
      }
      sendEvent({ type: 'done' });
      res.end();
    } catch (err: any) {
      const mapped = mapGeminiError(err);
      console.error('Forge error:', err);
      sendEvent({ type: 'error', message: mapped.message, status: mapped.status });
      res.end();
    }
  });

  app.post('/api/mentor/chat', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const {
        messages = [],
        thinkingDepth = 'high',
        useWebSearch = false,
        urls: rawUrls = [],
        attachments = [],
        focusDomain = 'fullstack',
        languagePref = 'english',
      } = req.body || {};

      if (!Array.isArray(messages) || messages.length === 0) {
        sendEvent({ type: 'error', message: 'Please enter a message for the AI Mentor.' });
        res.end();
        return;
      }

      const ai = getAiClient();
      const urls = sanitizeUrls(rawUrls);
      const tools: Array<Record<string, unknown>> = [];
      if (useWebSearch) tools.push({ googleSearch: {} });
      if (urls.length > 0) tools.push({ urlContext: {} });

      const langNote =
        languagePref === 'urdu'
          ? 'Respond primarily in clear, easy-to-read Urdu (اردو script) while keeping technical identifiers, file paths, and code snippets in clean English.'
          : languagePref === 'bilingual_urdu'
          ? 'Explain concepts in friendly, easy-to-understand Roman Urdu + Urdu mixed with clear English technical terms so any user can follow effortlessly.'
          : '';

      const formattedContents = messages.map((m: any, idx: number) => {
        const isLast = idx === messages.length - 1;
        const role = m.role === 'assistant' ? 'model' : 'user';
        const text = typeof m.content === 'string' ? m.content : '';
        if (isLast && role === 'user') {
          const prefixed = `[Mentor Focus Domain: ${focusDomain}]${langNote ? `\n[Language Preference: ${langNote}]` : ''}\n${text}`;
          return {
            role,
            parts: buildContentParts(prefixed, attachments, urls),
          };
        }
        return {
          role,
          parts: [{ text }],
        };
      });

      const stream = await ai.models.generateContentStream({
        model: MODEL_ID,
        contents: formattedContents,
        config: {
          systemInstruction: ANG_MENTOR_SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: resolveThinkingLevel(thinkingDepth),
          },
          ...(tools.length > 0 ? { tools } : {}),
        },
      });

      const seenUris = new Set<string>();
      const collectedSources: IncomingSource[] = [];

      for await (const chunk of stream) {
        if (closed) break;
        const text = chunk.text;
        if (text) {
          sendEvent({ type: 'chunk', text });
        }
        const sources = extractGroundingSources(chunk);
        for (const s of sources) {
          if (!seenUris.has(s.uri)) {
            seenUris.add(s.uri);
            collectedSources.push(s);
          }
        }
      }

      if (collectedSources.length > 0) {
        sendEvent({ type: 'sources', sources: collectedSources });
      }
      sendEvent({ type: 'done' });
      res.end();
    } catch (err: any) {
      const mapped = mapGeminiError(err);
      console.error('Mentor chat error:', err);
      sendEvent({ type: 'error', message: mapped.message, status: mapped.status });
      res.end();
    }
  });

  app.post('/api/mentor/evaluate', async (req, res) => {
    try {
      const {
        masterPrompt,
        rawIdea = '',
        targetDomain = 'general',
        style = 'Engineering Spec',
      } = req.body || {};

      if (!masterPrompt || typeof masterPrompt !== 'string' || !masterPrompt.trim()) {
        res.status(400).json({ error: 'No forged prompt provided to evaluate.' });
        return;
      }

      const CLARITY_RUBRIC = [
        'Vague or contradictory phrasing that obscures the requested task.',
        'Understandable overall intent, but key verbs or instructions remain ambiguous.',
        'Clear main request with minor ambiguities in structure or tone.',
        'Well-structured, direct instructions that leave little room for misinterpretation.',
        'Crystal-clear, logically ordered, unambiguous instructions ready for any LLM.',
      ];

      const SPECIFICITY_RUBRIC = [
        'Generic high-level wish with no constraints, format, or acceptance criteria.',
        'Mentions a topic or goal, but lacks concrete output format or boundaries.',
        'Includes some constraints or steps, though edge cases and output schema remain open.',
        'Detailed constraints, explicit output structure, and concrete role/task boundaries.',
        'Precision-engineered directives with exact I/O contracts, constraints, edge cases, and verification criteria.',
      ];

      const CONTEXT_RUBRIC = [
        'Zero background, audience, environment, or domain framing provided.',
        'Minimal context; the receiving LLM must guess the user, stack, or end goal.',
        'Basic domain framing is present, but environment constraints or rationale are thin.',
        'Strong contextual framing covering user intent, domain/stack, and key assumptions.',
        'Complete, self-contained context explaining the why, target audience, stack/constraints, and failure boundaries.',
      ];

      const evaluationInput = [
        `Target Domain: ${targetDomain}`,
        `Desired Style: ${style}`,
        rawIdea ? `Original User Idea:\n${String(rawIdea).trim()}` : '',
        `Forged Prompt to Evaluate:\n${masterPrompt.trim()}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const decisionsAi = getDecisionsAiClient();
      const ai = getAiClient();

      const [decisionResult, critiqueResult] = await Promise.all([
        decisionsAi.decisions.create({
          model: 'gemini-decision-1',
          input: evaluationInput,
          questions: {
            clarity: {
              type: 'score',
              instructions:
                'Rate the Clarity of the Forged Prompt: how unambiguous, readable, and logically structured are its instructions for another LLM?',
              criteria: CLARITY_RUBRIC,
            },
            specificity: {
              type: 'score',
              instructions:
                'Rate the Specificity of the Forged Prompt: does it define concrete output formats, technical/creative constraints, edge cases, and measurable criteria?',
              criteria: SPECIFICITY_RUBRIC,
            },
            context: {
              type: 'score',
              instructions:
                'Rate the Context completeness of the Forged Prompt: does it provide enough background, role, target environment, and intent so an LLM does not have to guess?',
              criteria: CONTEXT_RUBRIC,
            },
            llm_portability: {
              type: 'noul',
              instructions:
                'Is this Forged Prompt self-contained and effective enough to paste directly into another LLM without extra human clarification?',
              criteria: {
                true_description:
                  'Another LLM can execute the prompt accurately on the first attempt.',
                false_description:
                  'Missing critical framing, constraints, or instructions that would cause guesswork.',
              },
            },
          },
        }),
        ai.models.generateContent({
          model: MODEL_ID,
          contents: evaluationInput,
          config: {
            systemInstruction: `You are an elite AI Prompt Auditor and Principal Full-Stack Architect.
Evaluate the provided Forged Prompt against three strict quality criteria:
1. Clarity (unambiguous phrasing, logical flow, zero conflicting directives)
2. Specificity (concrete constraints, output schema/format, edge cases, verification criteria)
3. Context (role, target environment/stack, audience, why it matters, implicit intent captured from Original User Idea)

Provide sharp, honest, specific diagnostics for each criterion and 3 to 5 concrete, high-impact improvements that will make this prompt dramatically more effective across other LLMs (GPT, Claude, Gemini, and coding agents). Every improvement must include an exact 'applyDirective' that can be passed back to rewrite/upgrade the prompt.`,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summaryVerdict: {
                  type: Type.STRING,
                  description: 'A concise 1-2 sentence executive verdict on the prompt effectiveness.',
                },
                crossLlmNotes: {
                  type: Type.STRING,
                  description:
                    'Practical guidance on how this prompt behaves across different LLMs (reasoning models, coding agents, general chat models).',
                },
                clarityDiagnosis: {
                  type: Type.STRING,
                  description: 'Specific diagnosis of clarity strengths and remaining ambiguities.',
                },
                specificityDiagnosis: {
                  type: Type.STRING,
                  description: 'Specific diagnosis of specificity, constraints, and output format precision.',
                },
                contextDiagnosis: {
                  type: Type.STRING,
                  description: 'Specific diagnosis of context completeness and alignment with the user idea.',
                },
                improvements: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      criterion: {
                        type: Type.STRING,
                        description: 'Must be one of: Clarity, Specificity, Context',
                      },
                      impact: {
                        type: Type.STRING,
                        description: 'Must be one of: High, Medium',
                      },
                      title: {
                        type: Type.STRING,
                        description: 'Short action title (max 8 words).',
                      },
                      issue: {
                        type: Type.STRING,
                        description: 'Exact weakness or gap spotted in the current forged prompt.',
                      },
                      recommendation: {
                        type: Type.STRING,
                        description: 'Concrete wording, section, or constraint to add or adjust.',
                      },
                      applyDirective: {
                        type: Type.STRING,
                        description:
                          'Self-contained rewrite instruction that applies this exact improvement to the Master AI-to-AI Prompt.',
                      },
                    },
                    required: [
                      'criterion',
                      'impact',
                      'title',
                      'issue',
                      'recommendation',
                      'applyDirective',
                    ],
                  },
                },
              },
              required: [
                'summaryVerdict',
                'crossLlmNotes',
                'clarityDiagnosis',
                'specificityDiagnosis',
                'contextDiagnosis',
                'improvements',
              ],
            },
          },
        }),
      ]);

      const extractScore = (
        key: 'clarity' | 'specificity' | 'context',
        label: string,
        rubric: string[],
        diagnosis: string
      ) => {
        const ans = decisionResult.answers?.[key];
        if (!ans || ans.type !== 'score') {
          throw new Error(`Calibrated scoring answer missing for criterion: ${key}`);
        }
        const normalized = ans.score / (rubric.length - 1);
        const score = Math.round(normalized * 100);
        const topIdx = Object.entries(ans.probabilities).sort(([, a], [, b]) => b - a)[0]?.[0];
        const rubricLevel = topIdx && ans.legend?.[topIdx] ? ans.legend[topIdx] : rubric[Math.round(ans.score)] || '';
        const band = score >= 82 ? 'Strong' : score >= 64 ? 'Solid' : score >= 45 ? 'Fair' : 'Needs Work';
        return {
          key,
          label,
          score,
          band,
          rubricLevel,
          confidence: Number(ans.confidence.toFixed(2)),
          diagnosis,
        };
      };

      const portabilityAns = decisionResult.answers?.llm_portability;
      if (!portabilityAns || portabilityAns.type !== 'noul') {
        throw new Error('Calibrated portability check missing from Decisions API response.');
      }

      const rawJson = (critiqueResult.text ?? '{}').trim();
      const critique = JSON.parse(rawJson);

      const criteria = [
        extractScore('clarity', 'Clarity', CLARITY_RUBRIC, critique.clarityDiagnosis || ''),
        extractScore('specificity', 'Specificity', SPECIFICITY_RUBRIC, critique.specificityDiagnosis || ''),
        extractScore('context', 'Context', CONTEXT_RUBRIC, critique.contextDiagnosis || ''),
      ];

      const overallScore = Math.round(
        criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length
      );

      const improvements = Array.isArray(critique.improvements)
        ? critique.improvements.slice(0, 5).map((imp: any, idx: number) => ({
            id: `imp-${Date.now()}-${idx}`,
            criterion:
              imp.criterion === 'Clarity' || imp.criterion === 'Specificity' || imp.criterion === 'Context'
                ? imp.criterion
                : 'Specificity',
            impact: imp.impact === 'High' ? 'High' : 'Medium',
            title: String(imp.title || 'Refine prompt structure'),
            issue: String(imp.issue || ''),
            recommendation: String(imp.recommendation || ''),
            applyDirective: String(imp.applyDirective || imp.recommendation || ''),
          }))
        : [];

      res.json({
        evaluatedAt: Date.now(),
        overallScore,
        portableAcrossLlms: portabilityAns.noul >= 0.5,
        portabilityConfidence: Number(portabilityAns.confidence.toFixed(2)),
        summaryVerdict: String(critique.summaryVerdict || ''),
        crossLlmNotes: String(critique.crossLlmNotes || ''),
        criteria,
        improvements,
      });
    } catch (err: any) {
      const mapped = mapGeminiError(err);
      console.error('Prompt evaluate error:', err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/mentor/optimize', async (req, res) => {
    try {
      const {
        masterPrompt,
        mode = 'balanced',
        targetModel = 'universal',
      } = req.body || {};

      if (!masterPrompt || typeof masterPrompt !== 'string' || !masterPrompt.trim()) {
        res.status(400).json({ error: 'No prompt provided to optimize.' });
        return;
      }

      const beforeTokens = estimateTokens(masterPrompt);
      const ai = getAiClient();

      const compressionGoal =
        mode === 'ultra_lean'
          ? 'Compress aggressively by 45-60% into ultra-dense, zero-fluff symbolic/bullet specifications while preserving 100% of functional requirements, schemas, and guardrails.'
          : 'Compress cleanly by 25-35% by stripping filler prose, merging duplicate rules, and tightening phrasing while keeping readability and 100% of constraints.';

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Target LLM Family: ${targetModel}
Optimization Mode: ${mode}
Goal: ${compressionGoal}

Prompt to Optimize:
"""
${masterPrompt.trim()}
"""`,
        config: {
          systemInstruction:
            'You are an expert Prompt Token Compression Engineer. Optimize prompts for maximum instruction fidelity in minimum tokens without losing schemas, constraints, or edge cases.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              optimizedPrompt: {
                type: Type.STRING,
                description: 'The compressed, token-optimized prompt preserving all core requirements.',
              },
              techniquesApplied: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Short list of 2 to 4 concrete token-optimization techniques used.',
              },
            },
            required: ['optimizedPrompt', 'techniquesApplied'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const optimizedPrompt = String(parsed.optimizedPrompt || masterPrompt).trim();
      const afterTokens = estimateTokens(optimizedPrompt);
      const savedPercent =
        beforeTokens > 0 ? Math.max(0, Math.round(((beforeTokens - afterTokens) / beforeTokens) * 100)) : 0;

      res.json({
        optimizedPrompt,
        beforeTokens,
        afterTokens,
        savedPercent,
        techniquesApplied: Array.isArray(parsed.techniquesApplied)
          ? parsed.techniquesApplied.map(String).slice(0, 5)
          : ['Removed redundant phrasing'],
      });
    } catch (err: any) {
      const mapped = mapGeminiError(err);
      console.error('Token optimize error:', err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/audio/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body || {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Audio data is required for transcription.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: 'Transcribe this spoken audio cleanly and accurately. Preserve English, Urdu, or Roman Urdu words naturally. Return only the transcribed text with no preamble.',
            },
          ],
        },
      });

      res.json({ text: (response.text ?? '').trim() });
    } catch (err: any) {
      const mapped = mapGeminiError(err);
      console.error('Transcribe error:', err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/audio/tts', async (req, res) => {
    try {
      const { text, voiceName = 'Kore', style = 'Clear, warm, helpful technical mentor' } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const clipped = text.trim().slice(0, 2800);
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: clipped,
                speechMetadata: { style },
              } as any,
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No audio returned by speech model.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (err: any) {
      const mapped = mapGeminiError(err);
      console.error('TTS error:', err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (reqUrl.pathname === '/live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch {
      // Let other listeners handle non-live upgrades
    }
  });

  wss.on('connection', async (clientWs, request) => {
    let liveSession: any = null;
    try {
      const reqUrl = new URL(request.url || '/live', `http://${request.headers.host || 'localhost'}`);
      const voiceName = reqUrl.searchParams.get('voice') || 'Zephyr';
      const lang = reqUrl.searchParams.get('lang') || 'bilingual_urdu';
      const focus = reqUrl.searchParams.get('focus') || 'prompt_mentor';

      const langInstruction =
        lang === 'urdu'
          ? 'Speak primarily in clear, friendly, easy Urdu (with simple English technical terms where natural). Help Urdu-speaking users design prompts or solve software problems effortlessly.'
          : lang === 'english'
          ? 'Speak in crisp, warm, natural English like a senior full-stack and AI mentor.'
          : 'Understand both Urdu, Roman Urdu, and English effortlessly. Respond in easy, friendly bilingual Urdu/English (matching whichever language the user speaks) so anyone can understand and craft world-class AI prompts.';

      const focusInstruction =
        focus === 'agent_mcp'
          ? 'Specialize in autonomous AI Agents, MCP (Model Context Protocol) tool servers, and open-source LLM workflows.'
          : focus === 'fullstack'
          ? 'Specialize in full-stack frontend/backend engineering, debugging, UX psychology, and architecture.'
          : 'Specialize in turning rough spoken ideas into structured, high-precision AI prompts—clarifying ambiguous thoughts and suggesting missing details.';

      const ai = getAiClient();
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: `You are ANG Talk Mentor — an approachable, brilliant full-stack & AI prompt engineering partner.
${langInstruction}
${focusInstruction}
Keep spoken replies concise, warm, encouraging, and practical—never refuse constructive help, always guide the user step by step.`,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: any) => {
            console.error('Live API session error:', err);
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: err?.message || 'Live voice session encountered an error.',
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });

      clientWs.on('message', (rawData) => {
        if (!liveSession) return;
        try {
          const msg = JSON.parse(rawData.toString());
          if (msg.audio && typeof msg.audio === 'string') {
            liveSession.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (msg.text && typeof msg.text === 'string') {
            liveSession.sendRealtimeInput({ text: msg.text });
          }
        } catch (err) {
          console.error('Invalid WS message from client:', err);
        }
      });

      clientWs.on('close', () => {
        try {
          liveSession?.close?.();
        } catch {
          // Ignore close errors
        }
      });
    } catch (err: any) {
      const mapped = mapGeminiError(err);
      console.error('Live WS connection failed:', err);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ error: mapped.message }));
        clientWs.close();
      }
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ANG Prompt Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
