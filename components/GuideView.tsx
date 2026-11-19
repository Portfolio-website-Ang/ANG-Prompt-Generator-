import React from 'react';
import { ArrowRight } from 'lucide-react';
import { WorkspaceTab } from '../types';

interface GuideViewProps {
  onNavigate: (tab: WorkspaceTab) => void;
}

const CAPABILITIES = [
  {
    index: '01',
    title: 'ANG Auto-Fix & Easy Urdu / English Accessibility',
    body: 'Type or speak in Urdu, Roman Urdu, or rough English. Switch between Urdu + English (Easy), Pure اردو, or English—ANG explains everything clearly while forging crisp AI-to-AI prompts.',
  },
  {
    index: '02',
    title: 'Real-Time Talk Mode (Live Voice AI Mentor)',
    body: 'Click Talk Mode in the top bar for live two-way voice conversation. Speak naturally in Urdu or English, interrupt anytime, and turn the voice session transcript into a forged Master Prompt in one click.',
  },
  {
    index: '03',
    title: 'Token Optimization Engine & D3.js Token Analytics',
    body: 'Inspect section-by-section token distribution and 5-axis structural complexity with interactive D3.js Treemap, Donut, Bar, and Radar charts. Compress heavy prompts in 1 click without losing logic.',
  },
  {
    index: '04',
    title: 'Autonomous Agent Mode',
    body: 'Switch Execution Mode to Agent Mode to engineer production agent prompts with Tool Policies, Planner + Executor or Multi-Agent Orchestration, Memory Contracts, Loop Guards, and Recovery Rules.',
  },
  {
    index: '05',
    title: 'MCP Mode & Open-Source Skills / Models by Link',
    body: 'Paste links to GitHub MCP servers, SKILL.md files, HuggingFace model cards, or Ollama libraries. ANG reads them live via URL Context and tailors prompts for Llama, Qwen, DeepSeek, Gemma, Gemini, or Claude.',
  },
  {
    index: '06',
    title: 'Quality Evaluation, Version History & Audio Playback',
    body: 'Audit Clarity, Specificity, and Context scores with 1-click fixes, listen to prompts read aloud, and browse or revert any previous prompt iteration cleanly in History.',
  },
];

const GuideView: React.FC<GuideViewProps> = ({ onNavigate }) => {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              How ANG Prompt Studio Works
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Built as a full-stack AI Mentor and Prompt Engineering Workbench—turning raw human ideas into verified AI execution.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('forge')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <span>Open Prompt Forge</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CAPABILITIES.map((cap) => (
            <div
              key={cap.index}
              className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2.5"
            >
              <p className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                {cap.index}.
              </p>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {cap.title}
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {cap.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GuideView;
