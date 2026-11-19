import React from 'react';
import { Menu, Plus } from 'lucide-react';
import { WorkspaceTab } from '../types';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onNewSession: () => void;
  onToggleSidebar: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'forge', label: 'Prompt Forge' },
  { id: 'mentor', label: 'Mentor Chat' },
  { id: 'talk', label: 'Talk Mode' },
  { id: 'templates', label: 'Templates' },
  { id: 'guide', label: 'Capabilities' },
];

const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onNewSession,
  onToggleSidebar,
}) => {
  return (
    <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1420] px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Single-line Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle workspace history"
          className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('forge')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          ANG Studio
        </button>
      </div>

      {/* Zone 2: 4 single-line navigation links */}
      <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'border-blue-600 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0E1420]"
        >
          <Plus className="w-4 h-4" />
          <span>New Session</span>
        </button>
      </div>
    </header>
  );
};

export default TopBar;
