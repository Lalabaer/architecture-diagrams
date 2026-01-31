import type { View, WebEdge, WebGraph, WebNode } from './graph.js'

export interface BuildOptions {
    view: View
    selectedTeams?: string[] // empty/undefined => no team filter
}

/**
 * Team filter behavior:
 * - If no teams selected: show full graph (subject to view filter)
 * - If teams selected:
 *   - include nodes owned by selected teams
 *   - include edges FROM selected-team nodes only
 *   - include target nodes of those edges (even if owned by other teams), but DO NOT expand beyond that
 */
export function buildMermaid(graph: WebGraph, opts: BuildOptions): { mermaid: string; isEmpty: boolean } {
    const selectedTeams = (opts.selectedTeams ?? []).filter(Boolean)
    const hasTeamFilter = selectedTeams.length > 0
    const teamSet = new Set(selectedTeams)

    const kindAllowed = (k: WebNode['kind']) => {
        if (opts.view === 'architecture') return k === 'system' || k === 'datastore'
        return true // technical
    }

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

        if (!kindAllowed(from.kind) || !kindAllowed(to.kind)) {
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
            if (kindAllowed(n.kind)) {
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
            if (!kindAllowed(n.kind)) {
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
    lines.push("%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 80}}}%%")
    lines.push('flowchart LR')

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
        lines.push(`  subgraph ${teamId}["${escapeLabel(team)}"]`)

        for (const n of teamNodes) {
            lines.push(`    ${n.uid}${shape(n.kind)}${label(n)}`)
        }

        lines.push('  end')
    }

    // edge labels (keep optional, low-noise)
    const edgeGroups = new Map<string, { from: string; to: string; labels: string[] }>()

    for (const e of edges) {
        const key = `${e.from}||${e.to}`
        const label = edgeLabel(e.relationship, opts.view)
        const existing = edgeGroups.get(key)

        if (existing) {
            if (label && !existing.labels.includes(label)) existing.labels.push(label)
        } else {
            edgeGroups.set(key, { from: e.from, to: e.to, labels: label ? [label] : [] })
        }
    }

    for (const { from, to, labels } of edgeGroups.values()) {
        const lbl = labels.join(', ')

        if (lbl) {
            lines.push(`  ${from} -- "${escapeLabel(lbl)}" --> ${to}`)
        } else {
            lines.push(`  ${from} --> ${to}`)
        }
    }

    const mermaid = lines.join('\n')
    const isEmpty =
        includedNodes.length === 0 || (includedNodes.length > 0 && edges.length === 0 && opts.view === 'architecture')

    return { mermaid, isEmpty }
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

function label(n: WebNode): string {
    const title = n.name ? n.name : n.id
    const owner = n.owner_team ? `<br/>Owner: ${n.owner_team}` : ''
    const critical = n.business_critical ? `<br/><b>Business Critical</b>` : ''
    return `${escapeLabel(title)}${owner}${critical}${closeShape(n.kind)}`
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

    return rel
}

function escapeLabel(s: string): string {
    return s.replace(/"/g, '\\"')
}
