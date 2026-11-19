import React, { useMemo, useState } from 'react';
import { Moon, Pin, Search, Sun, Trash2, X } from 'lucide-react';
import { ForgeRecord, MentorSession, WorkspaceTab } from '../types';

interface SidebarHistoryProps {
  forgeHistory: ForgeRecord[];
  chatSessions: MentorSession[];
  activeForgeId: string | null;
  activeChatId: string | null;
  onSelectForge: (record: ForgeRecord) => void;
  onSelectChat: (session: MentorSession) => void;
  onDeleteForge: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onTogglePinForge: (id: string) => void;
  onTogglePinChat: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
}

type HistoryFilter = 'all' | 'forge' | 'chat';

function formatShortTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const SidebarHistory: React.FC<SidebarHistoryProps> = ({
  forgeHistory,
  chatSessions,
  activeForgeId,
  activeChatId,
  onSelectForge,
  onSelectChat,
  onDeleteForge,
  onDeleteChat,
  onTogglePinForge,
  onTogglePinChat,
  isDark,
  onToggleTheme,
  isOpenMobile,
  onCloseMobile,
  activeTab,
  onSelectTab,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const combinedItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list: Array<
      | { kind: 'forge'; item: ForgeRecord; sortTime: number }
      | { kind: 'chat'; item: MentorSession; sortTime: number }
    > = [];

    if (filter === 'all' || filter === 'forge') {
      for (const rec of forgeHistory) {
        if (
          !normalized ||
          rec.title.toLowerCase().includes(normalized) ||
          rec.rawIdea.toLowerCase().includes(normalized)
        ) {
          list.push({ kind: 'forge', item: rec, sortTime: rec.createdAt });
        }
      }
    }

    if (filter === 'all' || filter === 'chat') {
      for (const sess of chatSessions) {
        const lastMsg = sess.messages[sess.messages.length - 1]?.content || '';
        if (
          !normalized ||
          sess.title.toLowerCase().includes(normalized) ||
          lastMsg.toLowerCase().includes(normalized)
        ) {
          list.push({ kind: 'chat', item: sess, sortTime: sess.updatedAt });
        }
      }
    }

    return list.sort((a, b) => {
      const pinA = a.item.pinned ? 1 : 0;
      const pinB = b.item.pinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return b.sortTime - a.sortTime;
    });
  }, [forgeHistory, chatSessions, query, filter]);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0E1420] border-r border-slate-200 dark:border-slate-800 w-[268px] shrink-0">
      {/* Mobile Nav Switcher */}
      <div className="md:hidden p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <span className="font-display font-semibold text-sm text-slate-900 dark:text-white">Workspace</span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="md:hidden grid grid-cols-2 gap-1.5 p-3 border-b border-slate-200 dark:border-slate-800">
        {(['forge', 'mentor', 'talk', 'templates', 'guide'] as WorkspaceTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              onSelectTab(tab);
              onCloseMobile();
            }}
            className={`px-3 py-2 text-xs font-medium rounded-md capitalize whitespace-nowrap ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {tab === 'forge'
              ? 'Prompt Forge'
              : tab === 'mentor'
              ? 'Mentor Chat'
              : tab === 'talk'
              ? 'Talk Mode'
              : tab === 'templates'
              ? 'Templates'
              : 'Capabilities'}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="p-3 space-y-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved work..."
            aria-label="Search saved prompts and chats"
            className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-[#0B0F17] rounded-md">
          {([
            { id: 'all', label: 'All' },
            { id: 'forge', label: 'Prompts' },
            { id: 'chat', label: 'Chats' },
          ] as { id: HistoryFilter; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {combinedItems.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {query ? 'No matching sessions' : 'No saved sessions yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Forged prompts and mentor conversations are saved here automatically.
            </p>
          </div>
        ) : (
          combinedItems.map((entry) => {
            const isForge = entry.kind === 'forge';
            const isActive = isForge
              ? activeTab === 'forge' && activeForgeId === entry.item.id
              : activeTab === 'mentor' && activeChatId === entry.item.id;

            return (
              <div
                key={`${entry.kind}-${entry.item.id}`}
                className={`group rounded-md border transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-[#161E2E] border-blue-500/40'
                    : 'border-transparent hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 p-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isForge) {
                        onSelectForge(entry.item);
                      } else {
                        onSelectChat(entry.item);
                      }
                      onCloseMobile();
                    }}
                    className="flex-1 text-left min-w-0 focus-visible:outline-none"
                  >
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {entry.item.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                      <span>{isForge ? 'Prompt' : 'Mentor'}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{formatShortTime(entry.sortTime)}</span>
                      {entry.item.pinned ? (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="text-blue-600 dark:text-blue-400">Pinned</span>
                        </>
                      ) : null}
                    </p>
                  </button>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={() => (isForge ? onTogglePinForge(entry.item.id) : onTogglePinChat(entry.item.id))}
                      aria-label={entry.item.pinned ? 'Unpin session' : 'Pin session'}
                      className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
                        entry.item.pinned ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => (isForge ? onDeleteForge(entry.item.id) : onDeleteChat(entry.item.id))}
                      aria-label="Delete session"
                      className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Theme Switcher */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {forgeHistory.length + chatSessions.length} saved
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-full shrink-0">{sidebarContent}</aside>
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};

export default SidebarHistory;
