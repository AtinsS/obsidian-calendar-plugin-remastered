<script lang="ts">
  import { habitLogs } from "./stores";

  export let habitId: string | null = null;

  // Directly reference $habitLogs here so Svelte tracks the store subscription
  $: logsByDate = buildLogsMap($habitLogs, habitId);

  function buildLogsMap(
    logs: { habitId: string; date: string; completed: boolean }[],
    filterId: string | null
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const log of logs) {
      if (!log.completed) continue;
      if (filterId && log.habitId !== filterId) continue;
      map.set(log.date, (map.get(log.date) || 0) + 1);
    }
    return map;
  }

  function getGridData(dateCountMap: Map<string, number>): { date: string; count: number }[] {
    const moment = window.moment;
    const today = moment().startOf("day");
    const cells: { date: string; count: number }[] = [];
    const WEEKS = 52;

    const startDate = today
      .clone()
      .subtract(WEEKS * 7 - 1, "days")
      .startOf("week");

    for (let i = 0; i < WEEKS * 7; i++) {
      const d = startDate.clone().add(i, "days");
      if (d.isAfter(today)) break;
      const dateStr = d.format("YYYY-MM-DD");
      cells.push({
        date: dateStr,
        count: dateCountMap.get(dateStr) || 0,
      });
    }

    return cells;
  }

  function getColorClass(count: number): string {
    if (count === 0) return "level-0";
    if (count === 1) return "level-1";
    if (count === 2) return "level-2";
    if (count === 3) return "level-3";
    return "level-4";
  }

  // Pass logsByDate directly to ensure reactive tracking
  $: gridData = getGridData(logsByDate);
  $: weeks = Math.ceil(gridData.length / 7);
</script>

<div class="heatmap">
  <div class="heatmap-grid">
    {#each Array(weeks) as _, weekIdx}
      <div class="heatmap-week">
        {#each Array(7) as _, dayIdx}
          {#if weekIdx * 7 + dayIdx < gridData.length}
            <div
              class="heatmap-cell {getColorClass(gridData[weekIdx * 7 + dayIdx].count)}"
              title="{gridData[weekIdx * 7 + dayIdx].date}: {gridData[weekIdx * 7 + dayIdx].count}"
            ></div>
          {:else}
            <div class="heatmap-cell level-empty"></div>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
  <div class="heatmap-legend">
    <span class="legend-label">Меньше</span>
    <div class="heatmap-cell level-0"></div>
    <div class="heatmap-cell level-1"></div>
    <div class="heatmap-cell level-2"></div>
    <div class="heatmap-cell level-3"></div>
    <div class="heatmap-cell level-4"></div>
    <span class="legend-label">Больше</span>
  </div>
</div>

<style>
  .heatmap {
    padding: 8px 0;
    width: 100%;
  }

  .heatmap-grid {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .heatmap-week {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .heatmap-cell {
    width: 11px;
    height: 11px;
    min-width: 11px;
    min-height: 11px;
    border-radius: 2px;
    transition: all 0.15s ease;
  }

  .heatmap-cell:hover {
    outline: 1px solid var(--text-muted);
    transform: scale(1.3);
    z-index: 1;
  }

  .level-empty {
    background: transparent;
  }

  .level-0 {
    background: rgba(255, 255, 255, 0.04);
  }

  .level-1 {
    background: rgba(107, 203, 119, 0.25);
    box-shadow: 0 0 4px rgba(107, 203, 119, 0.15);
  }

  .level-2 {
    background: rgba(107, 203, 119, 0.45);
    box-shadow: 0 0 4px rgba(107, 203, 119, 0.25);
  }

  .level-3 {
    background: rgba(107, 203, 119, 0.65);
    box-shadow: 0 0 6px rgba(107, 203, 119, 0.35);
  }

  .level-4 {
    background: rgba(107, 203, 119, 0.9);
    box-shadow: 0 0 8px rgba(107, 203, 119, 0.5);
  }

  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    justify-content: flex-end;
  }

  .legend-label {
    font-size: 10px;
    color: var(--text-faint);
    margin: 0 2px;
  }
</style>
