import { buildMermaid } from '../../shared/buildMermaid.js'
import type { View, WebGraph } from '../../shared/graph.js'

export function renderMermaid(graph: WebGraph, opts: { view: View }): string {
    return buildMermaid(graph, { view: opts.view }).mermaid
}
