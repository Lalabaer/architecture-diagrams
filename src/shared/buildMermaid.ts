import type { Kind, View, WebEdge, WebGraph, WebNode } from './graph.js'

/** Root Mermaid flowchart direction; changes how team swimlanes use screen space. */
export type DiagramLayout = 'tb' | 'lr'

export interface BuildOptions {
    view: View
    selectedTeams?: string[] // empty/undefined => no team filter
    /** Root graph direction. Default: tb (wide horizontal team bands). */
    diagramLayout?: DiagramLayout
    /**
     * Which node kinds to include. System is always included.
     * Omit to show all kinds allowed by the current {@link BuildOptions.view}.
     */
    visibleKinds?: Set<Kind>
}

/**
 * Team filter behavior:
 * - If no teams selected: show full graph (subject to view filter)
 * - If teams selected:
 *   - include nodes owned by selected teams
 *   - include edges FROM selected-team nodes only
 *   - include target nodes of those edges (even if owned by other teams), but DO NOT expand beyond that
 */
export function buildMermaid(graph: WebGraph, opts: BuildOptions): {
    mermaid: string
    isEmpty: boolean
    includedNodes: WebNode[]
} {
    const selectedTeams = (opts.selectedTeams ?? []).filter(Boolean)
    const hasTeamFilter = selectedTeams.length > 0
    const teamSet = new Set(selectedTeams)

    const viewKinds: Kind[] =
        opts.view === 'architecture' ? ['system', 'datastore'] : ['system', 'datastore', 'library', 'tool']

    const visibleSet = opts.visibleKinds !== undefined ? new Set<Kind>(opts.visibleKinds) : new Set<Kind>(viewKinds)
    visibleSet.add('system')
    for (const k of [...visibleSet]) {
        if (!viewKinds.includes(k)) {
            visibleSet.delete(k)
        }
    }

    const kindVisible = (k: Kind) => viewKinds.includes(k) && visibleSet.has(k)

    const nodesByUid = new Map<string, WebNode>()

    for (const n of graph.nodes) {
        nodesByUid.set(n.uid, n)
    }

    // 1) Filter edges by view + (optional) team filter
    let edges: WebEdge[] = graph.edges.filter((e) => {
        const from = nodesByUid.get(e.from)
        const to = nodesByUid.get(e.to)

        if (!from || !to) {
            return false
        }

        if (!kindVisible(from.kind) || !kindVisible(to.kind)) {
            return false
        }

        if (!hasTeamFilter) {
            return true
        }

        return !!from.owner_team && teamSet.has(from.owner_team)
    })

    // 2) Determine which nodes to include
    const includedUids = new Set<string>()

    if (!hasTeamFilter) {
        // include all nodes that are referenced by remaining edges + any standalone nodes of allowed kinds
        for (const n of graph.nodes) {
            if (kindVisible(n.kind)) {
                includedUids.add(n.uid)
            }
        }

        for (const e of edges) {
            includedUids.add(e.from)
            includedUids.add(e.to)
        }
    } else {
        // include all selected-team nodes of allowed kinds
        for (const n of graph.nodes) {
            if (!kindVisible(n.kind)) {
                continue
            }

            if (n.owner_team && teamSet.has(n.owner_team)) {
                includedUids.add(n.uid)
            }
        }
        // include targets of edges from selected-team nodes
        for (const e of edges) {
            includedUids.add(e.from)
            includedUids.add(e.to)
        }
    }

    // 3) Drop edges that reference nodes we decided not to include (safety)
    edges = edges.filter((e) => includedUids.has(e.from) && includedUids.has(e.to))

    // 4) Build Mermaid
    const lines: string[] = []
    const layout: DiagramLayout = opts.diagramLayout ?? 'tb'

    if (layout === 'tb') {
        lines.push(
            "%%{init: {'securityLevel': 'strict', 'flowchart': {'useMaxWidth': false, 'htmlLabels': false, 'nodeSpacing': 48, 'rankSpacing': 72, 'padding': 20}}}%%",
        )
        lines.push('flowchart TB')
    } else {
        lines.push(
            "%%{init: {'securityLevel': 'strict', 'flowchart': {'useMaxWidth': false, 'htmlLabels': false, 'nodeSpacing': 40, 'rankSpacing': 80, 'padding': 16}}}%%",
        )
        lines.push('flowchart LR')
    }

    const includedNodes = [...includedUids].map((uid) => nodesByUid.get(uid)).filter(Boolean) as WebNode[]

    // stable sort
    includedNodes.sort((a, b) => a.uid.localeCompare(b.uid))

    const nodesByTeam = new Map<string, WebNode[]>()

    for (const n of includedNodes) {
        const team = n.owner_team?.trim() || 'Unowned'
        const list = nodesByTeam.get(team) ?? []
        list.push(n)
        nodesByTeam.set(team, list)
    }

    const teamEntries = [...nodesByTeam.entries()].sort(([a], [b]) => a.localeCompare(b))

    for (const [team, teamNodes] of teamEntries) {
        const teamId = `team_${team.replace(/[^a-zA-Z0-9_]/g, '_')}`
        lines.push(`  subgraph ${teamId}["${sanitizeLabel(team)}"]`)

        const useInnerLR = layout === 'tb' || teamNodes.length >= 6
        if (useInnerLR) {
            lines.push('    direction LR')
        }

        for (const n of teamNodes) {
            lines.push(`    ${n.uid}${shape(n.kind)}${nodeLabel(n)}`)
        }

        lines.push('  end')
    }

    // edge labels (keep optional, low-noise)
    const edgeGroups = new Map<string, { from: string; to: string; labels: string[] }>()

    for (const e of edges) {
        const key = `${e.from}||${e.to}`
        const edgeLbl = edgeLabel(e.relationship, opts.view)
        const existing = edgeGroups.get(key)

        if (existing) {
            if (edgeLbl && !existing.labels.includes(edgeLbl)) existing.labels.push(edgeLbl)
        } else {
            edgeGroups.set(key, { from: e.from, to: e.to, labels: edgeLbl ? [edgeLbl] : [] })
        }
    }

    for (const { from, to, labels } of edgeGroups.values()) {
        const lbl = labels.join(' ')

        if (lbl) {
            lines.push(`  ${from} -- "${sanitizeLabel(lbl)}" --> ${to}`)
        } else {
            lines.push(`  ${from} --> ${to}`)
        }
    }

    const mermaid = lines.join('\n')
    const isEmpty = includedNodes.length === 0

    return { mermaid, isEmpty, includedNodes }
}

function shape(kind: WebNode['kind']): string {
    switch (kind) {
        case 'system':
            return `["` // box
        case 'datastore':
            return `[("` // cylinder-ish
        case 'library':
            return `(["` // rounded
        case 'tool':
            return `{{"` // hex-ish
    }
}

function nodeLabel(n: WebNode): string {
    const title = n.name ? n.name : n.id
    const safe = sanitizeLabel(title) || 'Unknown'
    return `${safe}${closeShape(n.kind)}`
}

function closeShape(kind: WebNode['kind']): string {
    switch (kind) {
        case 'system':
            return `"]`
        case 'datastore':
            return `")]`
        case 'library':
            return `"])`
        case 'tool':
            return `"}}`
    }
}

function edgeLabel(rel: string | undefined, view: View): string {
    if (view === 'architecture') {
        return ''
    }

    if (!rel) {
        return ''
    }

    if (rel === 'unknown' || rel === 'compile_time') {
        return ''
    }

    return sanitizeLabel(rel.replace(/_/g, ' '))
}

function sanitizeLabel(s: string): string {
    return s
        .replace(/[^a-zA-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
