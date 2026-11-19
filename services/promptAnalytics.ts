import {
  ComplexityAxisMetric,
  ExecutionMode,
  GroundingSource,
  LanguagePreference,
  ParsedForgeSections,
  PromptAnalyticsReport,
  PromptEvaluation,
  PromptSectionMetric,
  PromptStyle,
  TargetDomain,
  ThinkingDepth,
  TokenOptimizationMode,
  TokenOptimizationResult,
} from '../types';

const CONSTRAINT_REGEX =
  /\b(must|never|always|strictly|only|ensure|require|required|mandatory|prohibit|prohibited|forbidden|avoid|do not|don't|cannot|can't|shall|enforce|verify|validate)\b/gi;

const CONDITIONAL_DIRECTIVE_REGEX =
  /\b(if|when|unless|otherwise|fallback|instead|before|after|return|output|format|use|include|exclude|check|handle|prevent|reject)\b/gi;

const CODE_FENCE_REGEX = /```[\s\S]*?```/g;

function estimateRawTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function computeSectionStats(id: string, name: string, body: string): Omit<PromptSectionMetric, 'sharePercent'> {
  const fullText = body.trim();
  const tokens = estimateRawTokens(fullText);
  const wordsArr = fullText ? fullText.split(/\s+/).filter(Boolean) : [];
  const words = wordsArr.length;
  const chars = fullText.length;

  const constraintCount = countMatches(fullText, CONSTRAINT_REGEX);
  const codeBlockCount = countMatches(fullText, CODE_FENCE_REGEX);
  const inlineCodeCount = countMatches(fullText, /`[^`\n]+`/g);
  const listItemCount = countMatches(fullText, /^(?:\s*(?:[-*+]|\d+\.)\s+)/gm);

  // Deterministic section complexity (0-100) based on constraints, code/schemas, nesting & sentence density
  const constraintSignal = words > 0 ? Math.min(35, (constraintCount / words) * 450) : 0;
  const structuralSignal = Math.min(30, listItemCount * 3 + codeBlockCount * 12);
  const techSignal = Math.min(25, inlineCodeCount * 2.5 + countMatches(fullText, /[{}[\]]/g) * 0.8);
  const lengthSignal = Math.min(10, words / 30);
  const complexityScore = Math.min(
    100,
    Math.max(5, Math.round(constraintSignal + structuralSignal + techSignal + lengthSignal))
  );

  const singleLine = fullText.replace(/\s+/g, ' ').trim();
  const preview = singleLine.length > 150 ? `${singleLine.slice(0, 150)}...` : singleLine;

  return {
    id,
    name: name.trim() || 'Untitled Section',
    tokens,
    words,
    chars,
    complexityScore,
    constraintCount,
    codeBlockCount,
    listItemCount,
    preview,
    fullText,
  };
}

function splitMarkdownSections(text: string): { name: string; content: string }[] {
  const lines = text.split('\n');
  const sections: { name: string; contentLines: string[] }[] = [];
  let inCodeFence = false;
  let currentName = 'Preamble & Core Framing';
  let currentLines: string[] = [];

  const headingRegex = /^(#{1,4})\s+(.+?)\s*$/;
  const labelColonRegex = /^([A-Z][A-Za-z0-9\s/&+-]{2,36}):\s*$/;
  const boldHeadingRegex = /^\*\*([A-Za-z0-9\s/&+-]{2,42}):?\*\*\s*$/;
  const bracketHeadingRegex = /^\[([A-Za-z0-9\s_/-]{2,36})\]\s*$/;
  const xmlOpenRegex = /^<([a-zA-Z][a-zA-Z0-9_-]{1,32})>\s*$/;

  const flush = () => {
    const joined = currentLines.join('\n').trim();
    if (joined) {
      sections.push({ name: currentName, contentLines: currentLines });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      currentLines.push(line);
      continue;
    }

    if (!inCodeFence) {
      const hMatch = trimmed.match(headingRegex);
      const cMatch = trimmed.match(labelColonRegex);
      const bMatch = trimmed.match(boldHeadingRegex);
      const brMatch = trimmed.match(bracketHeadingRegex);
      const xmlMatch = trimmed.match(xmlOpenRegex);

      const detectedTitle =
        hMatch?.[2] ||
        cMatch?.[1] ||
        bMatch?.[1] ||
        brMatch?.[1] ||
        (xmlMatch ? xmlMatch[1].replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null);

      if (detectedTitle) {
        flush();
        currentName = detectedTitle.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
        currentLines = [];
        continue;
      }
    }

    currentLines.push(line);
  }
  flush();

  // If the prompt has no explicit section markers at all, segment into coherent paragraph blocks
  if (sections.length <= 1) {
    const rawTrimmed = text.trim();
    if (!rawTrimmed) return [];
    const blocks = rawTrimmed
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    if (blocks.length > 1) {
      return blocks.map((block, idx) => {
        const firstLine = block.split('\n')[0].replace(/^[#*\-\d.\s]+/, '').trim();
        const shortLabel =
          firstLine.length > 32
            ? `${firstLine.slice(0, 32)}...`
            : firstLine || `Block ${idx + 1}`;
        return {
          name: idx === 0 ? `Core Directive · ${shortLabel}` : `${idx + 1}. ${shortLabel}`,
          content: block,
        };
      });
    }
  }

  return sections.map((s) => ({
    name: s.name,
    content: s.contentLines.join('\n').trim(),
  }));
}

function buildComplexityAxes(fullText: string): {
  axes: ComplexityAxisMetric[];
  avgSentenceWords: number;
  codeBlockCount: number;
  constraintCount: number;
  totalLines: number;
  totalWords: number;
} {
  const trimmed = fullText.trim();
  const totalLines = trimmed ? trimmed.split('\n').length : 0;
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const totalWords = words.length;

  const sentences = trimmed
    ? trimmed
        .split(/[.!?;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.split(/\s+/).length >= 3)
    : [];
  const avgSentenceWords =
    sentences.length > 0
      ? Math.round(
          (sentences.reduce((acc, s) => acc + s.split(/\s+/).filter(Boolean).length, 0) /
            sentences.length) *
            10
        ) / 10
      : totalWords;

  const constraintCount = countMatches(trimmed, CONSTRAINT_REGEX);
  const codeBlockCount = countMatches(trimmed, CODE_FENCE_REGEX);
  const inlineCodeCount = countMatches(trimmed, /`[^`\n]+`/g);
  const listCount = countMatches(trimmed, /^(?:\s*(?:[-*+]|\d+\.)\s+)/gm);
  const headingCount = countMatches(trimmed, /^#{1,4}\s+/gm);
  const xmlTagCount = countMatches(trimmed, /<\/?[a-zA-Z][a-zA-Z0-9_-]{1,24}>/g);
  const conditionalCount = countMatches(trimmed, CONDITIONAL_DIRECTIVE_REGEX);
  const techMarkers =
    inlineCodeCount +
    codeBlockCount * 4 +
    countMatches(trimmed, /\b[a-z]+(?:[A-Z][a-zA-Z0-9]+|_[a-zA-Z0-9_]+)\b/g) +
    countMatches(trimmed, /(?:https?:\/\/|\/api\/|\.[a-z]{2,4}\b)/gi);

  // 1. Constraint Density (constraints per 100 words)
  const constraintRate = totalWords > 0 ? (constraintCount / totalWords) * 100 : 0;
  const constraintDensity = Math.min(100, Math.round(constraintRate * 14));

  // 2. Structural Depth (headings + nested lists + delimiters + code blocks)
  const structuralRaw = headingCount * 7 + listCount * 2.5 + xmlTagCount * 3 + codeBlockCount * 10;
  const structuralDepth = Math.min(100, Math.round(structuralRaw));

  // 3. Technical Specificity (code/API/identifier markers per 100 words)
  const techRate = totalWords > 0 ? (techMarkers / totalWords) * 100 : 0;
  const technicalSpecificity = Math.min(100, Math.round(techRate * 5.2));

  // 4. Lexical Diversity (Guiraud's Root TTR normalized so both short & long prompts compare fairly)
  const normalizedWords = words
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 1);
  const uniqueWords = new Set(normalizedWords).size;
  const rootTtr =
    normalizedWords.length > 0 ? uniqueWords / Math.sqrt(normalizedWords.length) : 0;
  const lexicalDiversity = Math.min(100, Math.max(10, Math.round((rootTtr / 11) * 100)));

  // 5. Directive Density (actionable directives + branching logic per 100 words)
  const directiveRate = totalWords > 0 ? (conditionalCount / totalWords) * 100 : 0;
  const directiveDensity = Math.min(100, Math.round(directiveRate * 10));

  const axes: ComplexityAxisMetric[] = [
    {
      key: 'constraintDensity',
      label: 'Constraint Rigor',
      value: constraintDensity,
      detail: `${constraintCount} explicit rules (${constraintRate.toFixed(1)} per 100 words)`,
    },
    {
      key: 'structuralDepth',
      label: 'Structural Depth',
      value: structuralDepth,
      detail: `${headingCount} headings · ${listCount} list items · ${codeBlockCount} code blocks`,
    },
    {
      key: 'technicalSpecificity',
      label: 'Tech Specificity',
      value: technicalSpecificity,
      detail: `${techMarkers} code, API & identifier tokens`,
    },
    {
      key: 'lexicalDiversity',
      label: 'Lexical Richness',
      value: lexicalDiversity,
      detail: `${uniqueWords} unique terms across ${normalizedWords.length} tokens`,
    },
    {
      key: 'directiveDensity',
      label: 'Directive Logic',
      value: directiveDensity,
      detail: `${conditionalCount} branching & action directives`,
    },
  ];

  return {
    axes,
    avgSentenceWords,
    codeBlockCount,
    constraintCount,
    totalLines,
    totalWords,
  };
}

export function analyzePromptMetrics(
  parsed: ParsedForgeSections,
  scope: 'master' | 'full'
): PromptAnalyticsReport {
  let rawBuckets: { name: string; content: string }[] = [];
  let sourceText = '';

  if (scope === 'full') {
    const namedParts: { name: string; content: string }[] = [
      { name: 'Behavioral & Intent Diagnosis', content: parsed.diagnosis },
      { name: 'Clarified Goal (ANG Fixed)', content: parsed.clarifiedGoal },
      { name: 'Master AI-to-AI Prompt', content: parsed.masterPrompt },
      { name: 'Full-Stack Execution Blueprint', content: parsed.blueprint },
      { name: 'Verification & Guardrails', content: parsed.guardrails },
    ].filter((p) => p.content && p.content.trim().length > 0);

    if (namedParts.length > 0) {
      rawBuckets = namedParts;
      sourceText = namedParts.map((p) => p.content).join('\n\n');
    } else {
      sourceText = parsed.raw;
      rawBuckets = splitMarkdownSections(parsed.raw);
    }
  } else {
    sourceText = parsed.masterPrompt || parsed.raw;
    rawBuckets = splitMarkdownSections(sourceText);
  }

  const interim = rawBuckets
    .map((bucket, idx) => computeSectionStats(`sec-${idx}`, bucket.name, bucket.content))
    .filter((s) => s.tokens > 0);

  const totalTokens = interim.reduce((sum, s) => sum + s.tokens, 0);

  const sections: PromptSectionMetric[] = interim
    .map((s) => ({
      ...s,
      sharePercent: totalTokens > 0 ? Math.round((s.tokens / totalTokens) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const topConsumer = sections.length > 0 ? sections[0] : null;
  const { axes, avgSentenceWords, codeBlockCount, constraintCount, totalLines, totalWords } =
    buildComplexityAxes(sourceText);

  const complexityIndex =
    axes.length > 0
      ? Math.round(axes.reduce((sum, a) => sum + a.value, 0) / axes.length)
      : 0;

  const complexityLabel: PromptAnalyticsReport['complexityLabel'] =
    complexityIndex >= 72
      ? 'Deep Multi-Constraint'
      : complexityIndex >= 50
      ? 'Dense Spec'
      : complexityIndex >= 28
      ? 'Balanced'
      : 'Lean';

  return {
    scope,
    totalTokens,
    totalWords,
    totalLines,
    avgSentenceWords,
    codeBlockCount,
    constraintCount,
    complexityIndex,
    complexityLabel,
    topConsumer,
    sections,
    axes,
  };
}

export interface ForgeExportPayload {
  rawIdea: string;
  targetDomain: TargetDomain;
  style: PromptStyle;
  thinkingDepth: ThinkingDepth;
  executionMode: ExecutionMode;
  tokenMode: TokenOptimizationMode;
  languagePref: LanguagePreference;
  outputMarkdown: string;
  parsed: ParsedForgeSections;
  sources: GroundingSource[];
  evaluation: PromptEvaluation | null;
  optimizationResult: TokenOptimizationResult | null;
}

export function buildForgeExportJson(payload: ForgeExportPayload): string {
  const masterAnalytics = analyzePromptMetrics(payload.parsed, 'master');
  const fullAnalytics = analyzePromptMetrics(payload.parsed, 'full');

  const exportObject = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    configuration: {
      targetDomain: payload.targetDomain,
      style: payload.style,
      thinkingDepth: payload.thinkingDepth,
      executionMode: payload.executionMode,
      tokenMode: payload.tokenMode,
      languagePref: payload.languagePref,
    },
    input: {
      rawIdea: payload.rawIdea,
      estimatedTokens: estimateRawTokens(payload.rawIdea),
    },
    forgeOutput: {
      masterPrompt: payload.parsed.masterPrompt,
      clarifiedGoal: payload.parsed.clarifiedGoal,
      diagnosis: payload.parsed.diagnosis,
      blueprint: payload.parsed.blueprint,
      guardrails: payload.parsed.guardrails,
      fullMarkdown: payload.outputMarkdown,
    },
    tokenAnalytics: {
      masterPromptBreakdown: masterAnalytics,
      fullReportBreakdown: fullAnalytics,
    },
    evaluation: payload.evaluation,
    tokenOptimization: payload.optimizationResult,
    sources: payload.sources,
  };

  return JSON.stringify(exportObject, null, 2);
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildForgeExportCsv(payload: ForgeExportPayload): string {
  const masterReport = analyzePromptMetrics(payload.parsed, 'master');
  const fullReport = analyzePromptMetrics(payload.parsed, 'full');

  const headers = [
    'scope',
    'section_rank',
    'section_name',
    'estimated_tokens',
    'share_percent',
    'words',
    'chars',
    'section_complexity_score',
    'constraint_count',
    'code_block_count',
    'list_item_count',
    'scope_total_tokens',
    'overall_complexity_index',
    'complexity_grade',
    'axis_constraint_rigor',
    'axis_structural_depth',
    'axis_tech_specificity',
    'axis_lexical_richness',
    'axis_directive_logic',
    'target_domain',
    'prompt_style',
    'execution_mode',
    'token_mode',
    'language_pref',
    'evaluation_overall_score',
    'section_text',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  const appendReportRows = (scopeLabel: string, report: PromptAnalyticsReport) => {
    const axisLookup = new Map(report.axes.map((a) => [a.key, a.value]));
    report.sections.forEach((sec, index) => {
      const cells = [
        scopeLabel,
        index + 1,
        sec.name,
        sec.tokens,
        sec.sharePercent,
        sec.words,
        sec.chars,
        sec.complexityScore,
        sec.constraintCount,
        sec.codeBlockCount,
        sec.listItemCount,
        report.totalTokens,
        report.complexityIndex,
        report.complexityLabel,
        axisLookup.get('constraintDensity') ?? '',
        axisLookup.get('structuralDepth') ?? '',
        axisLookup.get('technicalSpecificity') ?? '',
        axisLookup.get('lexicalDiversity') ?? '',
        axisLookup.get('directiveDensity') ?? '',
        payload.targetDomain,
        payload.style,
        payload.executionMode,
        payload.tokenMode,
        payload.languagePref,
        payload.evaluation?.overallScore ?? '',
        sec.fullText,
      ];
      rows.push(cells.map(escapeCsvCell).join(','));
    });
  };

  appendReportRows('master_prompt', masterReport);
  appendReportRows('full_report', fullReport);

  return `\uFEFF${rows.join('\r\n')}`;
}

export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

