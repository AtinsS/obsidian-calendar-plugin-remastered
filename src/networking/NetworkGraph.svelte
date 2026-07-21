<script lang="ts">
  /**
   * React-компонент графа связей между людьми на D3.js v7.
   *
   * Узлы = люди (Person[]), рёбра = connections.
   * При наведении — tooltip с именем, навыками, контактами.
   * При клике — открытие заметки в Obsidian.
   */
  import { onMount, onDestroy } from "svelte";
  import * as d3 from "d3";
  import type { Person, GraphNode, GraphLink } from "./types";
  import type { App } from "obsidian";

  export let persons: Person[] = [];
  export let app: App | null = null;
  export let onEditPerson: ((person: Person) => void) | null = null;
  export let onOpenDossier: ((person: Person) => void) | null = null;

  /** Конвертирует vault-путь или URL в загружаемый src для <image> */
  function resolveAvatarSrc(avatar: string): string {
    if (avatar.startsWith("http://") || avatar.startsWith("https://") || avatar.startsWith("data:")) {
      return avatar;
    }
    // Vault-путь → полный URL через Obsidian API
    if (app) {
      const file = app.vault.getAbstractFileByPath(avatar);
      if (file && "stat" in file) {
        return app.vault.getResourcePath(file as any);
      }
    }
    return avatar;
  }

  let container: HTMLDivElement;
  let svgElement: SVGSVGElement;
  let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // Tooltip и меню создаются динамически и добавляются в document.body,
  // чтобы position: fixed работал корректно (аналогично ScheduleCalendar).
  let tooltipEl: HTMLDivElement | null = null;
  let menuEl: HTMLDivElement | null = null;

  function showTooltip(html: string, x: number, y: number): void {
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "network-tooltip";
      document.body.appendChild(tooltipEl);
    }
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = "block";
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }

  function hideTooltip(): void {
    if (tooltipEl) tooltipEl.style.display = "none";
  }

  function closeMenu(): void {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  /**
   * Строит узлы и рёбра графа из массива Person[].
   * Ребро создаётся, если A указывает B в connections ИЛИ B указывает A.
   */
  function buildGraphData(persons: Person[]): {
    nodes: GraphNode[];
    links: GraphLink[];
  } {
    const nameToId = new Map<string, string>();
    for (const p of persons) {
      nameToId.set(p.name, p.id);
    }

    const nodes: GraphNode[] = persons.map((p) => ({
      id: p.id,
      name: p.name,
      skills: p.skills,
      contacts: p.contacts,
      path: p.path,
      color: p.color,
      avatar: p.avatar,
    }));

    const linkSet = new Set<string>();
    const links: GraphLink[] = [];

    for (const p of persons) {
      if (!p.connections) continue;
      for (const targetName of p.connections) {
        const targetId = nameToId.get(targetName);
        if (!targetId || targetId === p.id) continue;

        // Уникальное ребро (A→B и B→A — одно ребро)
        const key = [p.id, targetId].sort().join("||");
        if (linkSet.has(key)) continue;
        linkSet.add(key);

        links.push({ source: p.id, target: targetId });
      }
    }

    return { nodes, links };
  }

  /**
   * Рендерит SVG-граф на основе узлов и рёбер.
   */
  function renderGraph(
    svg: SVGSVGElement,
    nodes: GraphNode[],
    links: GraphLink[],
    width: number,
    height: number
  ): d3.Simulation<GraphNode, GraphLink> {
    const svgSelection = d3.select(svg);
    svgSelection.selectAll("*").remove();

    // Группа для зума/пана
    const g = svgSelection.append("g");

    // Зум
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
      });

    svgSelection.call(zoom);

    // Симуляция
    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(120)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<GraphNode>().radius(40)
      );

    // Рёбра
    const link = g
      .append("g")
      .attr("class", "network-links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "var(--interactive-accent)")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.5);

    // Узлы
    const node = g
      .append("g")
      .attr("class", "network-nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "network-node")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Кружки узлов
    node
      .append("circle")
      .attr("r", 18)
      .attr("fill", (d) => d.color || "var(--interactive-accent)")
      .attr("fill-opacity", (d) => d.avatar ? 0 : 0.8)
      .attr("stroke", "var(--background-primary)")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    // Аватары (clip-image в круг через CSS clip-path)
    node
      .filter((d) => !!d.avatar)
      .each(function(d) {
        const nodeG = d3.select(this);

        // Скрываем текст инициалов если есть аватар
        nodeG.select("text").remove();

        // Изображение с CSS clip-path circle
        nodeG.append("image")
          .attr("href", resolveAvatarSrc(d.avatar!))
          .attr("width", 36)
          .attr("height", 36)
          .attr("x", -18)
          .attr("y", -18)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .style("clip-path", "circle(18px at 50% 50%)")
          .style("-webkit-clip-path", "circle(18px at 50% 50%)")
          .style("pointer-events", "none");
      });

    // Инициалы внутри кружка (только для узлов без аватара)
    node
      .filter((d) => !d.avatar)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "var(--text-on-accent)")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .text((d) => {
        const parts = d.name.split(" ");
        if (parts.length >= 2) {
          return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return d.name.slice(0, 2).toUpperCase();
      });

    // Tooltip при наведении — используем event.clientX/clientY
    // (нативные координаты viewport) и создаём элемент в document.body
    node
      .on("mouseenter", (event: MouseEvent, d) => {
        let html = `<strong>${d.name}</strong>`;
        if (d.skills && d.skills.length > 0) {
          html += `<br/>Навыки: ${d.skills.join(", ")}`;
        }
        if (d.contacts) {
          for (const [key, value] of Object.entries(d.contacts)) {
            if (value) {
              const label = key.charAt(0).toUpperCase() + key.slice(1);
              html += `<br/>${label}: ${value}`;
            }
          }
        }
        showTooltip(html, event.clientX + 16, event.clientY - 8);
      })
      .on("mousemove", (event: MouseEvent) => {
        if (tooltipEl) {
          tooltipEl.style.left = `${event.clientX + 16}px`;
          tooltipEl.style.top = `${event.clientY - 8}px`;
        }
      })
      .on("mouseleave", () => {
        hideTooltip();
      });

    // Клик — выпадающее меню (создаём в document.body)
    node.on("click", (event: MouseEvent, d) => {
      closeMenu();

      const fullPerson = persons.find(p => p.id === d.id);
      if (!fullPerson) return;

      let x = event.clientX;
      let y = event.clientY;

      // Ограничиваем, чтобы меню не выходило за экран
      const menuWidth = 200;
      const menuHeight = 100;
      if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
      if (x < 8) x = 8;
      if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
      if (y < 8) y = 8;

      const el = document.createElement("div");
      el.className = "node-context-menu";
      el.style.position = "fixed";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.zIndex = "9999";

      const editBtn = document.createElement("button");
      editBtn.className = "node-menu-item";
      editBtn.textContent = "✏️ Редактировать";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        if (onEditPerson) onEditPerson(fullPerson);
      });
      el.appendChild(editBtn);

      const openBtn = document.createElement("button");
      openBtn.className = "node-menu-item";
      openBtn.textContent = "📄 Открыть карточку контакта";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        if (onOpenDossier) {
          onOpenDossier(fullPerson);
        } else if (app) {
          const file = app.vault.getAbstractFileByPath(fullPerson.path);
          if (file) {
            app.workspace.openLinkText(fullPerson.path, "", true);
          }
        }
      });
      el.appendChild(openBtn);

      document.body.appendChild(el);
      menuEl = el;

      // Закрытие при клике вне меню
      const closeHandler = (e: MouseEvent) => {
        if (!el.contains(e.target as Node)) {
          closeMenu();
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
    });

    // Обновление позиций на каждом тике симуляции
    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as unknown as GraphNode).x!)
        .attr("y1", (d) => (d.source as unknown as GraphNode).y!)
        .attr("x2", (d) => (d.target as unknown as GraphNode).x!)
        .attr("y2", (d) => (d.target as unknown as GraphNode).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return sim;
  }

  onMount(() => {
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const { nodes, links } = buildGraphData(persons);

    simulation = renderGraph(svgElement, nodes, links, width, height);

    // Автоматическое обновление размера при изменении контейнера
    resizeObserver = new ResizeObserver(() => {
      if (!container || !svgElement || !simulation) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      simulation.force("center", d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    });
    resizeObserver.observe(container);
  });

  onDestroy(() => {
    hideTooltip();
    closeMenu();
    if (simulation) simulation.stop();
    if (resizeObserver) resizeObserver.disconnect();
  });

  // Реактивное обновление при изменении persons
  $: if (svgElement && container && persons) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const { nodes, links } = buildGraphData(persons);
    if (simulation) simulation.stop();
    simulation = renderGraph(svgElement, nodes, links, width, height);
  }
</script>

<div class="network-graph-container" bind:this={container}>
  <svg bind:this={svgElement} width="100%" height="100%"></svg>
</div>

<style>
  .network-graph-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }
</style>
