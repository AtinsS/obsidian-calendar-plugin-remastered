<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import type { TimeLog } from "../task-tracker/types";
  import { formatDuration } from "../task-tracker/TimerManager";

  export let logs: TimeLog[] = [];

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let tooltip: HTMLDivElement;
  let hoveredBar: number = -1;

  interface DayData {
    date: string;
    label: string;
    totalMs: number;
  }

  function aggregateByDay(logs: TimeLog[]): DayData[] {
    const map = new Map<string, number>();
    for (const log of logs) {
      map.set(log.date, (map.get(log.date) || 0) + log.duration);
    }

    const result: DayData[] = [];
    for (const [date, totalMs] of map) {
      const d = new Date(date + "T12:00:00");
      const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      result.push({ date, label, totalMs });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    const maxBars = 14;
    if (result.length > maxBars) {
      return result.slice(result.length - maxBars);
    }
    return result;
  }

  $: dayData = aggregateByDay(logs);
  $: maxMs = dayData.length > 0 ? Math.max(...dayData.map((d) => d.totalMs)) : 0;

  let dpr = 1;

  function drawChart() {
    if (!canvas || !container || dayData.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = Math.min(160, Math.max(100, rect.width * 0.45));

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const computedStyles = getComputedStyle(document.documentElement);
    const accentColor = computedStyles.getPropertyValue("--mcp-accent").trim() || "rgba(95, 153, 225, 0.479)";
    const textMuted = computedStyles.getPropertyValue("--mcp-text-muted").trim() || "rgba(200, 210, 220, 0.5)";
    const textFaint = computedStyles.getPropertyValue("--mcp-text-faint").trim() || "rgba(200, 210, 220, 0.25)";
    const glassHighlight = computedStyles.getPropertyValue("--mcp-glass-highlight").trim() || "rgba(255, 255, 255, 0.02)";

    ctx.clearRect(0, 0, width, height);

    const paddingLeft = 0;
    const paddingRight = 8;
    const paddingTop = 14;
    const paddingBottom = 24;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const barCount = dayData.length;
    const barGap = Math.max(3, Math.min(8, chartWidth / barCount * 0.2));
    const barWidth = Math.max(4, (chartWidth - barGap * (barCount + 1)) / barCount);

    // Draw horizontal grid lines
    const gridLines = 3;
    ctx.strokeStyle = textFaint;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    for (let i = 1; i <= gridLines; i++) {
      const y = paddingTop + chartHeight - (chartHeight * i) / gridLines;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Parse accent color for gradient
    const accentMatch = accentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    let barR = 95, barG = 153, barB = 225, barA = 0.85;
    if (accentMatch) {
      barR = parseInt(accentMatch[1]);
      barG = parseInt(accentMatch[2]);
      barB = parseInt(accentMatch[3]);
      barA = accentMatch[4] ? parseFloat(accentMatch[4]) : 0.85;
    }

    // Draw bars
    const minBarHeight = 3;
    for (let i = 0; i < barCount; i++) {
      const d = dayData[i];
      const barH = maxMs > 0 ? Math.max(minBarHeight, (d.totalMs / maxMs) * chartHeight) : minBarHeight;
      const x = paddingLeft + barGap + i * (barWidth + barGap);
      const y = paddingTop + chartHeight - barH;

      const isHovered = i === hoveredBar;

      // Bar with rounded top corners
      const radius = Math.min(4, barWidth / 3);
      ctx.beginPath();
      ctx.moveTo(x, y + radius);
      ctx.arcTo(x, y, x + radius, y, radius);
      ctx.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
      ctx.lineTo(x + barWidth, paddingTop + chartHeight);
      ctx.lineTo(x, paddingTop + chartHeight);
      ctx.closePath();

      if (isHovered) {
        ctx.fillStyle = `rgba(${barR}, ${barG}, ${barB}, 1)`;
      } else {
        const grad = ctx.createLinearGradient(x, y, x, paddingTop + chartHeight);
        grad.addColorStop(0, `rgba(${barR}, ${barG}, ${barB}, ${barA})`);
        grad.addColorStop(1, `rgba(${barR}, ${barG}, ${barB}, ${barA * 0.4})`);
        ctx.fillStyle = grad;
      }
      ctx.fill();

      if (isHovered) {
        ctx.shadowColor = `rgba(${barR}, ${barG}, ${barB}, 0.4)`;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Date label
      ctx.fillStyle = isHovered ? textMuted : textFaint;
      ctx.font = `${Math.max(8, Math.min(10, barWidth * 0.6))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(d.label, x + barWidth / 2, height - 6);
    }

    // Duration label on top of hovered bar
    if (hoveredBar >= 0 && hoveredBar < barCount) {
      const d = dayData[hoveredBar];
      const barH = maxMs > 0 ? Math.max(minBarHeight, (d.totalMs / maxMs) * chartHeight) : minBarHeight;
      const x = paddingLeft + barGap + hoveredBar * (barWidth + barGap);

      ctx.fillStyle = textMuted;
      ctx.font = `bold ${Math.max(9, Math.min(11, barWidth * 0.7))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(formatDuration(d.totalMs), x + barWidth / 2, paddingTop + chartHeight - barH - 4);
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvas || dayData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const width = rect.width;

    const paddingLeft = 0;
    const paddingRight = 8;
    const chartWidth = width - paddingLeft - paddingRight;
    const barGap = Math.max(3, Math.min(8, chartWidth / dayData.length * 0.2));
    const barWidth = Math.max(4, (chartWidth - barGap * (dayData.length + 1)) / dayData.length);

    const idx = Math.floor((mouseX - paddingLeft - barGap) / (barWidth + barGap));
    if (idx >= 0 && idx < dayData.length) {
      hoveredBar = idx;
    } else {
      hoveredBar = -1;
    }
    drawChart();
  }

  function handleMouseLeave() {
    hoveredBar = -1;
    drawChart();
  }

  onMount(() => {
    drawChart();
    const ro = new ResizeObserver(() => drawChart());
    ro.observe(container);
    return () => ro.disconnect();
  });

  afterUpdate(() => {
    drawChart();
  });
</script>

<div class="bar-chart-container" bind:this={container}>
  {#if dayData.length === 0}
    <div class="bar-chart-empty">Нет данных для графика</div>
  {:else}
    <canvas
      bind:this={canvas}
      on:mousemove={handleMouseMove}
      on:mouseleave={handleMouseLeave}
    ></canvas>
    <div class="bar-chart-summary">
      <span class="bar-chart-total">Всего: {formatDuration(dayData.reduce((s, d) => s + d.totalMs, 0))}</span>
      <span class="bar-chart-avg">Среднее: {formatDuration(dayData.reduce((s, d) => s + d.totalMs, 0) / dayData.length)}</span>
    </div>
  {/if}
</div>

<style>
  .bar-chart-container {
    width: 100%;
    position: relative;
  }

  canvas {
    display: block;
    width: 100%;
    cursor: crosshair;
  }

  .bar-chart-empty {
    text-align: center;
    padding: 20px 0;
    color: var(--mcp-text-faint);
    font-size: 12px;
  }

  .bar-chart-summary {
    display: flex;
    justify-content: space-between;
    padding: 6px 0 2px;
    font-size: 11px;
    color: var(--mcp-text-muted);
  }

  .bar-chart-total {
    font-weight: 600;
  }

  .bar-chart-avg {
    color: var(--mcp-text-faint);
  }

  @media (max-width: 480px) {
    .bar-chart-summary {
      font-size: 10px;
      flex-direction: column;
      gap: 2px;
      text-align: center;
    }
  }
</style>
