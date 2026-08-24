import { useMemo, type ReactNode } from "react";
import dagre from "dagre";
import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ProjectRelationshipGraph } from "../../../src/application/web/contracts";
import { PageTitle } from "../components/ui";
import { useI18n } from "../i18n/i18n";

export default function RelationshipGraphView({ graph, scopeControl }: { readonly graph: ProjectRelationshipGraph; readonly scopeControl?: ReactNode }) {
  const { t } = useI18n();
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  return <div className="page graph-page"><PageTitle title={t("web.graph.title")} summary={t("web.graph.summary")} actions={scopeControl} /><div className="graph-canvas"><ReactFlow nodes={layout.nodes} edges={layout.edges} fitView fitViewOptions={{ padding: 0.1, minZoom: 0.4 }} minZoom={0.15} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable><Background gap={24} size={1} /><Controls showInteractive={false} /></ReactFlow></div></div>;
}

function layoutGraph(graph: ProjectRelationshipGraph): { readonly nodes: Node[]; readonly edges: Edge[] } {
  const layout = new dagre.graphlib.Graph();
  layout.setGraph({ rankdir: "TB", ranksep: 55, nodesep: 22, marginx: 24, marginy: 24 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) layout.setNode(node.id, { width: 150, height: 50 });
  for (const edge of graph.edges.filter((edge) => graph.nodes.some((node) => node.id === edge.target))) layout.setEdge(edge.source, edge.target);
  dagre.layout(layout);
  const nodes: Node[] = graph.nodes.map((node) => {
    const point = layout.node(node.id) as { readonly x: number; readonly y: number } | undefined;
    return { id: node.id, position: { x: (point?.x ?? 0) - 75, y: (point?.y ?? 0) - 25 }, data: { label: node.label }, className: `graph-node graph-${node.kind} graph-status-${node.status ?? "none"}`, sourcePosition: Position.Bottom, targetPosition: Position.Top };
  });
  const edges: Edge[] = graph.edges.filter((edge) => graph.nodes.some((node) => node.id === edge.target)).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.kind.replaceAll("_", " "), className: edge.broken ? "graph-edge-broken" : "", markerEnd: { type: MarkerType.ArrowClosed }, animated: edge.kind === "depends_on" }));
  return { nodes, edges };
}
