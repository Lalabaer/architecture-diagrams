import type { WebEdge } from './graph.js'

export function groupEdges(edges: WebEdge[]): Map<string, { from: string; to: string }> {
    const edgeGroups = new Map<string, { from: string; to: string }>()

    for (const edge of edges) {
        const key = `${edge.from}||${edge.to}`

        if (!edgeGroups.has(key)) {
            edgeGroups.set(key, { from: edge.from, to: edge.to })
        }
    }

    return edgeGroups
}

/** Must stay in sync with {@link buildMermaid} layoutEdge assignment order. */
export function buildLayoutEdgeIdMap(
    edges: WebEdge[],
    opts: { allLayoutNeutral?: boolean; nodeTeam?: Map<string, string> } = {},
): Map<string, { from: string; to: string }> {
    const edgeGroups = groupEdges(edges)
    const layoutEdgeMap = new Map<string, { from: string; to: string }>()
    let layoutNeutralEdgeIndex = 0

    for (const endpoints of edgeGroups.values()) {
        const layoutNeutral =
            opts.allLayoutNeutral ||
            (opts.nodeTeam ? opts.nodeTeam.get(endpoints.from) !== opts.nodeTeam.get(endpoints.to) : false)

        if (layoutNeutral) {
            layoutEdgeMap.set(`layoutEdge${layoutNeutralEdgeIndex++}`, endpoints)
        }
    }

    return layoutEdgeMap
}

export function parseMermaidLinkId(dataId: string, knownUids: readonly string[]): { from: string; to: string } | null {
    if (!dataId.startsWith('L_')) {
        return null
    }

    const body = dataId.slice(2).replace(/_\d+$/, '')
    const sortedUids = [...knownUids].sort((a, b) => b.length - a.length)

    for (const from of sortedUids) {
        const prefix = `${from}_`

        if (!body.startsWith(prefix)) {
            continue
        }

        const to = body.slice(prefix.length)

        if (knownUids.includes(to)) {
            return { from, to }
        }
    }

    return null
}

export function parseEdgeEndpoints(
    path: SVGPathElement,
    knownUids: readonly string[],
    layoutEdgeMap: Map<string, { from: string; to: string }>,
): { from: string; to: string } | null {
    const dataId = path.getAttribute('data-id')

    if (dataId) {
        const layoutEdge = layoutEdgeMap.get(dataId)

        if (layoutEdge) {
            return layoutEdge
        }

        const fromLink = parseMermaidLinkId(dataId, knownUids)

        if (fromLink) {
            return fromLink
        }
    }

    let from = ''
    let to = ''

    for (const cls of path.classList) {
        if (cls.startsWith('LS-')) {
            from = cls.slice(3)
        } else if (cls.startsWith('LE-')) {
            to = cls.slice(3)
        }
    }

    if (from && to) {
        return { from, to }
    }

    const pathId = path.id
    const suffix = pathId.includes('-L_')
        ? pathId.slice(pathId.indexOf('-L_') + 1)
        : pathId.slice(pathId.lastIndexOf('-') + 1)

    return layoutEdgeMap.get(suffix) ?? parseMermaidLinkId(suffix, knownUids)
}
