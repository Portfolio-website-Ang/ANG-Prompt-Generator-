import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Download, Scissors } from 'lucide-react';
import { ComplexityAxisMetric, ParsedForgeSections, PromptSectionMetric } from '../types';
import { analyzePromptMetrics } from '../services/promptAnalytics';

interface PromptTokenAnalyticsProps {
  parsed: ParsedForgeSections;
  isStreaming: boolean;
  isOptimizing: boolean;
  onOptimizeTokens: (promptText: string, mode: 'balanced' | 'ultra_lean') => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}

type DistributionChartKind = 'treemap' | 'donut';

const SECTION_PALETTE = [
  '#2563EB', // Blue
  '#0D9488', // Teal
  '#D97706', // Amber
  '#7C3AED', // Violet
  '#059669', // Emerald
  '#DC2626', // Crimson
  '#0284C7', // Sky
  '#4F46E5', // Indigo
];

interface TooltipState {
  x: number;
  y: number;
  title: string;
  line1: string;
  line2: string;
}

function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 440): number {
  const [width, setWidth] = useState<number>(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 120) setWidth(next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

const PromptTokenAnalytics: React.FC<PromptTokenAnalyticsProps> = ({
  parsed,
  isStreaming,
  isOptimizing,
  onOptimizeTokens,
  onExportJson,
  onExportCsv,
}) => {
  const [scope, setScope] = useState<'master' | 'full'>('master');
  const [chartKind, setChartKind] = useState<DistributionChartKind>('treemap');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [distTooltip, setDistTooltip] = useState<TooltipState | null>(null);
  const [radarTooltip, setRadarTooltip] = useState<TooltipState | null>(null);

  const isDark = useIsDarkTheme();

  const report = useMemo(() => analyzePromptMetrics(parsed, scope), [parsed, scope]);

  useEffect(() => {
    if (report.sections.length === 0) {
      setSelectedSectionId(null);
      return;
    }
    if (!selectedSectionId || !report.sections.some((s) => s.id === selectedSectionId)) {
      setSelectedSectionId(report.sections[0].id);
    }
  }, [report.sections, selectedSectionId]);

  const activeSection = useMemo(
    () =>
      report.sections.find((s) => s.id === selectedSectionId) ||
      report.sections[0] ||
      null,
    [report.sections, selectedSectionId]
  );

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    report.sections.forEach((sec, idx) => {
      map.set(sec.id, SECTION_PALETTE[idx % SECTION_PALETTE.length]);
    });
    return map;
  }, [report.sections]);

  // Containers & SVG Refs
  const distContainerRef = useRef<HTMLDivElement>(null);
  const distSvgRef = useRef<SVGSVGElement>(null);
  const barContainerRef = useRef<HTMLDivElement>(null);
  const barSvgRef = useRef<SVGSVGElement>(null);
  const radarContainerRef = useRef<HTMLDivElement>(null);
  const radarSvgRef = useRef<SVGSVGElement>(null);

  const distWidth = useContainerWidth(distContainerRef, 400);
  const barWidth = useContainerWidth(barContainerRef, 400);
  const radarWidth = useContainerWidth(radarContainerRef, 300);

  // 1. Render D3 Treemap or Donut Chart
  useEffect(() => {
    const svgEl = distSvgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const height = 276;
    const width = Math.max(240, distWidth);
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    if (report.sections.length === 0) return;

    const bgStroke = isDark ? '#0B0F17' : '#FFFFFF';
    const mutedText = isDark ? '#94A3B8' : '#64748B';
    const primaryText = isDark ? '#F8FAFC' : '#0F172A';

    if (chartKind === 'treemap') {
      type TreeNode = {
        name: string;
        value?: number;
        section?: PromptSectionMetric;
        children?: TreeNode[];
      };

      const rootData: TreeNode = {
        name: 'Prompt',
        children: report.sections.map((s) => ({
          name: s.name,
          value: Math.max(1, s.tokens),
          section: s,
        })),
      };

      const root = d3
        .hierarchy<TreeNode>(rootData)
        .sum((d) => d.value || 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      d3.treemap<TreeNode>().size([width, height]).paddingInner(3).paddingOuter(2)(root);

      const leaves = root.leaves() as d3.HierarchyRectangularNode<TreeNode>[];

      const nodes = svg
        .selectAll('g.treemap-node')
        .data(leaves)
        .join('g')
        .attr('class', 'treemap-node')
        .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
        .style('cursor', 'pointer')
        .on('mouseenter', function (_event, d) {
          const sec = d.data.section;
          if (!sec) return;
          setHoveredSectionId(sec.id);
          setDistTooltip({
            x: Math.min(width - 170, Math.max(8, (d.x0 + d.x1) / 2 - 80)),
            y: Math.max(8, d.y0 + 8),
            title: sec.name,
            line1: `~${sec.tokens} tokens (${sec.sharePercent}%)`,
            line2: `${sec.words} words · Complexity ${sec.complexityScore}/100`,
          });
        })
        .on('mouseleave', () => {
          setHoveredSectionId(null);
          setDistTooltip(null);
        })
        .on('click', (_event, d) => {
          if (d.data.section) setSelectedSectionId(d.data.section.id);
        });

      nodes
        .append('rect')
        .attr('width', (d) => Math.max(0, d.x1 - d.x0))
        .attr('height', (d) => Math.max(0, d.y1 - d.y0))
        .attr('rx', 6)
        .attr('fill', (d) => {
          const id = d.data.section?.id || '';
          return colorMap.get(id) || SECTION_PALETTE[0];
        })
        .attr('fill-opacity', (d) => {
          const id = d.data.section?.id;
          if (hoveredSectionId && hoveredSectionId !== id) return 0.45;
          if (selectedSectionId === id) return 0.96;
          return 0.82;
        })
        .attr('stroke', (d) =>
          d.data.section?.id === selectedSectionId ? primaryText : bgStroke
        )
        .attr('stroke-width', (d) => (d.data.section?.id === selectedSectionId ? 2 : 1));

      nodes.each(function (d) {
        const boxW = d.x1 - d.x0;
        const boxH = d.y1 - d.y0;
        const sec = d.data.section;
        if (!sec || boxW < 58 || boxH < 36) return;

        const g = d3.select(this);
        const maxChars = Math.max(6, Math.floor((boxW - 14) / 6.8));
        const label = sec.name.length > maxChars ? `${sec.name.slice(0, maxChars - 1)}…` : sec.name;

        g.append('text')
          .attr('x', 8)
          .attr('y', 18)
          .attr('fill', '#FFFFFF')
          .style('font-size', '11px')
          .style('font-weight', '600')
          .style('pointer-events', 'none')
          .text(label);

        if (boxH >= 52) {
          g.append('text')
            .attr('x', 8)
            .attr('y', 35)
            .attr('fill', 'rgba(255,255,255,0.88)')
            .style('font-family', 'var(--font-mono)')
            .style('font-size', '11px')
            .style('font-variant-numeric', 'tabular-nums')
            .style('pointer-events', 'none')
            .text(`${sec.tokens}t · ${sec.sharePercent}%`);
        }
      });
    } else {
      // D3 Donut Chart
      const radius = Math.min(width, height) / 2 - 14;
      const innerR = radius * 0.58;

      const g = svg
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

      const pie = d3
        .pie<PromptSectionMetric>()
        .value((d) => d.tokens)
        .sort(null)
        .padAngle(0.02);

      const arc = d3
        .arc<d3.PieArcDatum<PromptSectionMetric>>()
        .innerRadius(innerR)
        .outerRadius(radius)
        .cornerRadius(3);

      const hoverArc = d3
        .arc<d3.PieArcDatum<PromptSectionMetric>>()
        .innerRadius(innerR)
        .outerRadius(radius + 5)
        .cornerRadius(3);

      const arcs = g
        .selectAll('path.donut-slice')
        .data(pie(report.sections))
        .join('path')
        .attr('class', 'donut-slice')
        .attr('d', (d) =>
          d.data.id === selectedSectionId || d.data.id === hoveredSectionId ? hoverArc(d) : arc(d)
        )
        .attr('fill', (d) => colorMap.get(d.data.id) || SECTION_PALETTE[0])
        .attr('fill-opacity', (d) => {
          if (hoveredSectionId && hoveredSectionId !== d.data.id) return 0.45;
          return 0.9;
        })
        .attr('stroke', (d) => (d.data.id === selectedSectionId ? primaryText : bgStroke))
        .attr('stroke-width', (d) => (d.data.id === selectedSectionId ? 2 : 1))
        .style('cursor', 'pointer')
        .on('mouseenter', function (_event, d) {
          setHoveredSectionId(d.data.id);
          const [cx, cy] = arc.centroid(d);
          setDistTooltip({
            x: Math.min(width - 170, Math.max(8, width / 2 + cx - 80)),
            y: Math.max(8, height / 2 + cy - 28),
            title: d.data.name,
            line1: `~${d.data.tokens} tokens (${d.data.sharePercent}%)`,
            line2: `${d.data.words} words · Complexity ${d.data.complexityScore}/100`,
          });
        })
        .on('mouseleave', () => {
          setHoveredSectionId(null);
          setDistTooltip(null);
        })
        .on('click', (_event, d) => {
          setSelectedSectionId(d.data.id);
        });

      void arcs;

      // Center Label
      const centerTarget =
        report.sections.find((s) => s.id === (hoveredSectionId || selectedSectionId)) || null;

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.25em')
        .attr('fill', primaryText)
        .style('font-family', 'var(--font-mono)')
        .style('font-size', '20px')
        .style('font-weight', '600')
        .style('font-variant-numeric', 'tabular-nums')
        .text(centerTarget ? `~${centerTarget.tokens}` : `~${report.totalTokens}`);

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.1em')
        .attr('fill', mutedText)
        .style('font-size', '11px')
        .text(centerTarget ? `${centerTarget.sharePercent}% of prompt` : 'total tokens');
    }
  }, [report, chartKind, distWidth, isDark, selectedSectionId, hoveredSectionId, colorMap]);

  // 2. Render D3 Horizontal Token Ranking Bar Chart
  useEffect(() => {
    const svgEl = barSvgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const sections = report.sections.slice(0, 8);
    if (sections.length === 0) return;

    const width = Math.max(260, barWidth);
    const margin = { top: 8, right: 86, bottom: 26, left: 132 };
    const rowHeight = 32;
    const height = Math.max(150, sections.length * rowHeight + margin.top + margin.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const innerW = Math.max(80, width - margin.left - margin.right);
    const innerH = height - margin.top - margin.bottom;

    const gridColor = isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)';
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const primaryText = isDark ? '#F1F5F9' : '#0F172A';

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxTokens = d3.max<PromptSectionMetric, number>(sections, (d) => d.tokens) || 1;
    const x = d3.scaleLinear().domain([0, maxTokens * 1.08]).range([0, innerW]).nice();
    const y = d3
      .scaleBand<string>()
      .domain(sections.map((d) => d.id))
      .range([0, innerH])
      .padding(0.28);

    // X Gridlines
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(4)
          .tickSize(-innerH)
          .tickFormat(() => '')
      )
      .call((axisG) => axisG.select('.domain').remove())
      .call((axisG) => axisG.selectAll('.tick line').attr('stroke', gridColor));

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(4).tickSizeOuter(0))
      .call((axisG) => axisG.select('.domain').attr('stroke', gridColor))
      .call((axisG) =>
        axisG
          .selectAll('text')
          .attr('fill', axisColor)
          .style('font-family', 'var(--font-mono)')
          .style('font-size', '10px')
      );

    // Rows
    const rows = g
      .selectAll('g.bar-row')
      .data<PromptSectionMetric>(sections)
      .join('g')
      .attr('class', 'bar-row')
      .style('cursor', 'pointer')
      .on('mouseenter', (_e, d) => setHoveredSectionId(d.id))
      .on('mouseleave', () => setHoveredSectionId(null))
      .on('click', (_e, d) => setSelectedSectionId(d.id));

    // Background track
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.id) || 0)
      .attr('width', innerW)
      .attr('height', y.bandwidth())
      .attr('rx', 4)
      .attr('fill', isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)');

    // Value bar
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.id) || 0)
      .attr('width', (d) => Math.max(3, x(d.tokens)))
      .attr('height', y.bandwidth())
      .attr('rx', 4)
      .attr('fill', (d) => colorMap.get(d.id) || SECTION_PALETTE[0])
      .attr('fill-opacity', (d) => {
        if (hoveredSectionId && hoveredSectionId !== d.id) return 0.45;
        if (selectedSectionId === d.id) return 1;
        return 0.85;
      })
      .attr('stroke', (d) => (selectedSectionId === d.id ? primaryText : 'none'))
      .attr('stroke-width', 1.25);

    // Left Section Name Label
    rows
      .append('text')
      .attr('x', -8)
      .attr('y', (d) => (y(d.id) || 0) + y.bandwidth() / 2 + 3.5)
      .attr('text-anchor', 'end')
      .attr('fill', (d) => (selectedSectionId === d.id ? primaryText : axisColor))
      .style('font-size', '11px')
      .style('font-weight', (d) => (selectedSectionId === d.id ? '600' : '500'))
      .text((d) => (d.name.length > 18 ? `${d.name.slice(0, 17)}…` : d.name));

    // Right Numeric Metric Label
    rows
      .append('text')
      .attr('x', innerW + 8)
      .attr('y', (d) => (y(d.id) || 0) + y.bandwidth() / 2 + 3.5)
      .attr('fill', primaryText)
      .style('font-family', 'var(--font-mono)')
      .style('font-size', '11px')
      .style('font-variant-numeric', 'tabular-nums')
      .text((d) => `${d.tokens}t (${d.sharePercent}%)`);
  }, [report.sections, barWidth, isDark, selectedSectionId, hoveredSectionId, colorMap]);

  // 3. Render D3 Multi-Axis Complexity Radar Chart
  useEffect(() => {
    const svgEl = radarSvgRef.current;
    if (!svgEl || report.axes.length === 0) return;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = Math.max(240, radarWidth);
    const height = 248;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const cx = width / 2;
    const cy = height / 2 + 4;
    const radius = Math.min(width, height) / 2 - 44;
    const axes = report.axes;
    const angleSlice = (Math.PI * 2) / axes.length;

    const rScale = d3.scaleLinear().domain([0, 100]).range([0, radius]);
    const gridColor = isDark ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.12)';
    const labelColor = isDark ? '#CBD5E1' : '#334155';

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Concentric reference rings (25, 50, 75, 100)
    [25, 50, 75, 100].forEach((level) => {
      g.append('circle')
        .attr('r', rScale(level))
        .attr('fill', 'none')
        .attr('stroke', gridColor)
        .attr('stroke-dasharray', level === 100 ? 'none' : '2,3');

      g.append('text')
        .attr('x', 4)
        .attr('y', -rScale(level) + 3)
        .attr('fill', isDark ? '#64748B' : '#94A3B8')
        .style('font-family', 'var(--font-mono)')
        .style('font-size', '9px')
        .text(`${level}`);
    });

    // Axis Spokes & Labels
    axes.forEach((axis, i) => {
      const angle = i * angleSlice - Math.PI / 2;
      const x2 = Math.cos(angle) * radius;
      const y2 = Math.sin(angle) * radius;

      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', gridColor);

      const lx = Math.cos(angle) * (radius + 16);
      const ly = Math.sin(angle) * (radius + 14);
      const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';

      g.append('text')
        .attr('x', lx)
        .attr('y', ly + 3)
        .attr('text-anchor', anchor)
        .attr('fill', labelColor)
        .style('font-size', '10.5px')
        .style('font-weight', '500')
        .text(axis.label);
    });

    // Polygon Path using d3.lineRadial
    const radialLine = d3
      .lineRadial<ComplexityAxisMetric>()
      .angle((_, i) => i * angleSlice)
      .radius((d) => rScale(d.value))
      .curve(d3.curveLinearClosed);

    g.append('path')
      .datum(axes)
      .attr('d', radialLine)
      .attr('fill', 'rgba(37, 99, 235, 0.22)')
      .attr('stroke', '#3B82F6')
      .attr('stroke-width', 2);

    // Data Vertex Dots with Hover Tooltips
    g.selectAll('circle.radar-point')
      .data<ComplexityAxisMetric>(axes)
      .join('circle')
      .attr('class', 'radar-point')
      .attr('cx', (d, i) => Math.cos(i * angleSlice - Math.PI / 2) * rScale(d.value))
      .attr('cy', (d, i) => Math.sin(i * angleSlice - Math.PI / 2) * rScale(d.value))
      .attr('r', 4.5)
      .attr('fill', '#2563EB')
      .attr('stroke', isDark ? '#0B0F17' : '#FFFFFF')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', (_e, d) => {
        const idx = axes.indexOf(d);
        const angle = idx * angleSlice - Math.PI / 2;
        const px = cx + Math.cos(angle) * rScale(d.value);
        const py = cy + Math.sin(angle) * rScale(d.value);
        setRadarTooltip({
          x: Math.min(width - 170, Math.max(8, px - 80)),
          y: Math.max(8, py - 48),
          title: `${d.label}: ${d.value}/100`,
          line1: d.detail,
          line2: '',
        });
      })
      .on('mouseleave', () => setRadarTooltip(null));
  }, [report.axes, radarWidth, isDark]);

  if (report.sections.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        Generate or load a prompt to inspect its section-level token distribution and complexity profile.
      </div>
    );
  }

  const optimizeTargetText = parsed.masterPrompt || parsed.raw;

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setScope('master')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                scope === 'master'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Master Prompt Sections
            </button>
            <button
              type="button"
              onClick={() => setScope('full')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                scope === 'full'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Full ANG Report
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setChartKind('treemap')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                chartKind === 'treemap'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Treemap
            </button>
            <button
              type="button"
              onClick={() => setChartKind('donut')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                chartKind === 'donut'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Donut
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isStreaming}
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            disabled={isStreaming}
            onClick={onExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            disabled={isStreaming || isOptimizing || !optimizeTargetText.trim()}
            onClick={() => onOptimizeTokens(optimizeTargetText, 'balanced')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>{isOptimizing ? 'Optimizing...' : 'Compress Top Sections'}</span>
          </button>
        </div>
      </div>

      {/* Quantitative Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Estimated Token Budget</p>
          <p className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            ~{report.totalTokens.toLocaleString()} tok
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {report.totalWords.toLocaleString()} words · {((report.totalTokens / 8192) * 100).toFixed(1)}% of 8k ctx
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Highest Token Consumer</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {report.topConsumer ? report.topConsumer.name : '—'}
          </p>
          <p className="font-mono text-xs text-blue-600 dark:text-blue-400 tabular-nums">
            {report.topConsumer
              ? `~${report.topConsumer.tokens} tok (${report.topConsumer.sharePercent}%)`
              : 'No sections'}
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Structural Complexity</p>
          <p className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {report.complexityIndex}/100
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {report.complexityLabel}
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Density Signals</p>
          <p className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
            {report.constraintCount} rules
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {report.codeBlockCount} code blocks · avg {report.avgSentenceWords} w/sent
          </p>
        </div>
      </div>

      {/* D3 Token Distribution Row: Treemap/Donut + Ranked Horizontal Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Panel A: Treemap or Donut */}
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0B0F17] space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Token Distribution ({chartKind === 'treemap' ? 'Treemap' : 'Donut'})
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {report.sections.length} sections · Click to inspect
            </span>
          </div>
          <div ref={distContainerRef} className="relative w-full min-h-[276px]">
            <svg ref={distSvgRef} className="block w-full overflow-visible" />
            {distTooltip && (
              <div
                style={{ left: distTooltip.x, top: distTooltip.y }}
                className="pointer-events-none absolute z-10 w-44 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-2.5 py-2 shadow-sm text-xs"
              >
                <p className="font-semibold text-slate-900 dark:text-white truncate">
                  {distTooltip.title}
                </p>
                <p className="font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                  {distTooltip.line1}
                </p>
                <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {distTooltip.line2}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Panel B: Ranked Horizontal Bar Chart */}
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0B0F17] space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Section Consumption Ranking
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Sorted highest to lowest
            </span>
          </div>
          <div ref={barContainerRef} className="w-full min-h-[180px]">
            <svg ref={barSvgRef} className="block w-full overflow-visible" />
          </div>
        </div>
      </div>

      {/* D3 Complexity Radar & Quantitative Axis Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0B0F17]">
        <div className="lg:col-span-5 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Prompt Complexity Profile
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              5-axis structural audit across constraints, hierarchy, code specificity, vocabulary, and logic
            </p>
          </div>
          <div ref={radarContainerRef} className="relative w-full min-h-[248px]">
            <svg ref={radarSvgRef} className="block w-full overflow-visible" />
            {radarTooltip && (
              <div
                style={{ left: radarTooltip.x, top: radarTooltip.y }}
                className="pointer-events-none absolute z-10 max-w-[200px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-2.5 py-1.5 shadow-sm text-xs"
              >
                <p className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  {radarTooltip.title}
                </p>
                <p className="text-slate-500 dark:text-slate-400">{radarTooltip.line1}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-[#111827]">
          {report.axes.map((axis) => (
            <div key={axis.key} className="px-4 py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {axis.label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {axis.detail}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden hidden sm:block">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: `${axis.value}%` }}
                  />
                </div>
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white tabular-nums w-11 text-right">
                  {axis.value}/100
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Section Inspector */}
      {activeSection && (
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: colorMap.get(activeSection.id) || SECTION_PALETTE[0] }}
                aria-hidden="true"
              />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {activeSection.name}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              ~{activeSection.tokens} tokens · {activeSection.sharePercent}% share · {activeSection.words} words · {activeSection.constraintCount} rules · Complexity {activeSection.complexityScore}/100
            </p>
          </div>
          <pre className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111827] text-xs leading-relaxed font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words max-h-52 overflow-y-auto">
            {activeSection.fullText}
          </pre>
        </div>
      )}
    </div>
  );
};

export default PromptTokenAnalytics;
