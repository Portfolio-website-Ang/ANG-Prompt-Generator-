import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { PROMPT_TEMPLATES, TARGET_DOMAINS } from '../constants';
import { PromptTemplate, TargetDomain } from '../types';

interface TemplatesViewProps {
  onLoadTemplate: (template: PromptTemplate) => void;
}

const TemplatesView: React.FC<TemplatesViewProps> = ({ onLoadTemplate }) => {
  const [domainFilter, setDomainFilter] = useState<'all' | TargetDomain>('all');

  const filtered = useMemo(() => {
    if (domainFilter === 'all') return PROMPT_TEMPLATES;
    return PROMPT_TEMPLATES.filter((t) => t.domain === domainFilter);
  }, [domainFilter]);

  const getDomainLabel = (domain: TargetDomain) =>
    TARGET_DOMAINS.find((d) => d.value === domain)?.label || domain;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Prompt &amp; Mentoring Templates
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Ready-to-run starting blueprints for Roman Urdu translation into engineering specs, UX psychology audits, root-cause debugging, and AI agent design.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDomainFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              domainFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All Workflows
          </button>
          {TARGET_DOMAINS.filter((d) => PROMPT_TEMPLATES.some((t) => t.domain === d.value)).map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDomainFilter(d.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                domainFilter === d.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span>{getDomainLabel(tpl.domain)}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{tpl.targetMode === 'forge' ? 'Prompt Forge' : 'Mentor Chat'}</span>
                </p>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white leading-snug">
                  {tpl.title}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {tpl.summary}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onLoadTemplate(tpl)}
                className="inline-flex items-center justify-between w-full px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 text-white transition-colors"
              >
                <span>Load into {tpl.targetMode === 'forge' ? 'Prompt Forge' : 'Mentor Chat'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TemplatesView;
