import React, { useRef, useState } from 'react';
import { FileCode, Globe, Link2, Paperclip, Plus, X } from 'lucide-react';
import { AttachmentItem, ThinkingDepth } from '../types';
import { THINKING_DEPTHS } from '../constants';

interface ContextToolkitProps {
  attachments: AttachmentItem[];
  setAttachments: React.Dispatch<React.SetStateAction<AttachmentItem[]>>;
  urls: string[];
  setUrls: React.Dispatch<React.SetStateAction<string[]>>;
  useWebSearch: boolean;
  setUseWebSearch: (val: boolean) => void;
  thinkingDepth: ThinkingDepth;
  setThinkingDepth: (depth: ThinkingDepth) => void;
  disabled?: boolean;
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rs', 'java', 'kt', 'swift', 'css', 'scss', 'html', 'xml',
  'yaml', 'yml', 'toml', 'sql', 'sh', 'env', 'csv', 'log',
]);

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/') || file.type === 'application/json') return true;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return TEXT_EXTENSIONS.has(ext);
}

function readFileAsAttachment(file: File): Promise<AttachmentItem> {
  return new Promise((resolve, reject) => {
    const textMode = isTextFile(file);
    const reader = new FileReader();

    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));

    if (textMode) {
      reader.onload = () => {
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          data: String(reader.result || ''),
          isText: true,
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          data: base64,
          isText: false,
        });
      };
      reader.readAsDataURL(file);
    }
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ContextToolkit: React.FC<ContextToolkitProps> = ({
  attachments,
  setAttachments,
  urls,
  setUrls,
  useWebSearch,
  setUseWebSearch,
  thinkingDepth,
  setThinkingDepth,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    setFileError(null);
    if (files.length === 0) return;

    const remaining = 6 - attachments.length;
    if (remaining <= 0) {
      setFileError('Maximum 6 files per request.');
      return;
    }

    const accepted = files.slice(0, remaining);
    const results: AttachmentItem[] = [];
    for (const file of accepted) {
      if (file.size > 10 * 1024 * 1024) {
        setFileError(`${file.name} exceeds 10 MB limit.`);
        continue;
      }
      try {
        const att = await readFileAsAttachment(file);
        results.push(att);
      } catch (err: any) {
        setFileError(err?.message || 'Failed to read file.');
      }
    }

    if (results.length > 0) {
      setAttachments((prev) => [...prev, ...results]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setFileError(null);
    let candidate = trimmed;
    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    try {
      const parsed = new URL(candidate);
      if (urls.length >= 5) {
        setFileError('Maximum 5 URLs per request.');
        return;
      }
      if (!urls.includes(parsed.toString())) {
        setUrls((prev) => [...prev, parsed.toString()]);
      }
      setUrlInput('');
      setShowUrlField(false);
    } catch {
      setFileError('Please enter a valid web URL (e.g., https://example.com).');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tool Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.css,.html,.sql,.yaml,.yml,.csv,.log"
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Attach File / Screenshot</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowUrlField((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
              showUrlField || urls.length > 0
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Read URL{urls.length > 0 ? ` (${urls.length})` : ''}</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => setUseWebSearch(!useWebSearch)}
            aria-pressed={useWebSearch}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
              useWebSearch
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web Search: {useWebSearch ? 'On' : 'Off'}</span>
          </button>
        </div>

        {/* Thinking Depth Segmented Control */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Reasoning:</span>
          <div className="inline-flex items-center p-0.5 rounded-md bg-slate-200/80 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
            {THINKING_DEPTHS.map((d) => (
              <button
                key={d.value}
                type="button"
                disabled={disabled}
                onClick={() => setThinkingDepth(d.value)}
                title={d.detail}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  thinkingDepth === d.value
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add URL Row */}
      {showUrlField && (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddUrl();
              }
            }}
            placeholder="Paste docs, GitHub repo, or webpage URL to inspect..."
            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleAddUrl}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-slate-900 dark:bg-slate-700 text-white rounded-md hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add URL</span>
          </button>
        </div>
      )}

      {fileError && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {fileError}
        </p>
      )}

      {/* Attached Context List (Unboxed hairline items, no pill clutter) */}
      {(attachments.length > 0 || urls.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs text-slate-700 dark:text-slate-300"
            >
              <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="max-w-[160px] truncate font-medium">{att.name}</span>
              <span className="text-slate-400 tabular-nums">{formatBytes(att.size)}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== att.id))}
                aria-label={`Remove ${att.name}`}
                className="text-slate-400 hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {urls.map((u) => (
            <div
              key={u}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs text-slate-700 dark:text-slate-300"
            >
              <Link2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="max-w-[200px] truncate">{u}</span>
              <button
                type="button"
                onClick={() => setUrls((prev) => prev.filter((item) => item !== u))}
                aria-label={`Remove ${u}`}
                className="text-slate-400 hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContextToolkit;
