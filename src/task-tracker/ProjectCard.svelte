<script lang="ts">
  import type { IProject } from "./types";

  export let project: IProject;
  export let taskCount: number = 0;
  export let active: boolean = false;
</script>

<div
  class="project-card"
  class:active
  on:click
  on:keydown
  tabindex="0"
  role="button"
  aria-pressed={active}
  aria-label="{project.name}, {taskCount} задач"
>
  <span
    class="project-dot"
    style="background-color: {project.color}"
  ></span>
  <span class="project-icon">{project.icon}</span>
  <span class="project-name">{project.name}</span>
  {#if taskCount > 0}
    <span class="project-count">{taskCount}</span>
  {/if}
</div>

<style>
  .project-card {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
    transition: background-color 0.1s ease, color 0.1s ease;
  }

  .project-card:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .project-card.active {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .project-card:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: -2px;
  }

  .project-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .project-icon {
    font-size: 14px;
    line-height: 1;
  }

  .project-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-count {
    font-size: 10px;
    background-color: var(--background-modifier-border);
    padding: 1px 5px;
    border-radius: 8px;
    color: var(--text-muted);
  }
</style>
