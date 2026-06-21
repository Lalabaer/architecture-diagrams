import type { WebEdge, WebGraph, WebNode } from '../shared/graph.js'

// ---- Adapter: internal graph -> WebGraph ----
// Normalizes a few possible internal shapes while keeping strict enough
// validation to avoid emitting broken nodes/edges.
export function toWebGraph(internalGraph: any): WebGraph {
    const asArray = (v: any): any[] => {
        if (!v) {
            return []
        }

        if (Array.isArray(v)) {
            return v
        }

        if (v instanceof Map || v instanceof Set) {
            return Array.from(v.values())
        }

        if (typeof v === 'object') {
            return Object.values(v)
        }

        return []
    }

    const rawNodes = asArray(internalGraph?.nodes ?? internalGraph?.nodesByKey ?? internalGraph?.nodeMap)
    const rawEdges = asArray(internalGraph?.edges ?? internalGraph?.edgeList ?? internalGraph?.edgeSet)

    const nodes = rawNodes
        .map((n: any): WebNode | null => {
            if (!n || !n.kind || !n.id) {
                return null
            }

            const uid = (typeof n.uid === 'string' ? n.uid : `${n.kind}_${n.id}`).replace(/[^a-zA-Z0-9_:-]/g, '_')

            return {
                uid,
                id: n.id,
                kind: n.kind,
                name: n.name ?? n.label,
                description: n.description,
                owner_team: n.owner_team,
                business_critical: n.business_critical,
                in_production: n.in_production,
                deprecated: n.deprecated,
            }
        })
        .filter((n): n is WebNode => n !== null)

    const nodeUidByKey = new Map<string, string>()
    for (const n of nodes) nodeUidByKey.set(`${n.kind}:${n.id}`, n.uid)

    const resolveUid = (endpoint: any): string => {
        if (typeof endpoint === 'string') {
            return endpoint
        }

        if (endpoint && typeof endpoint.uid === 'string') {
            return endpoint.uid
        }

        if (endpoint?.kind && endpoint?.id) {
            return nodeUidByKey.get(`${endpoint.kind}:${endpoint.id}`) ?? ''
        }

        const ek = endpoint?.entity?.kind ?? endpoint?.target?.kind
        const ei = endpoint?.entity?.id ?? endpoint?.target?.id

        if (ek && ei) {
            return nodeUidByKey.get(`${ek}:${ei}`) ?? ''
        }

        return ''
    }

    const knownUids = new Set(nodes.map((n) => n.uid))
    const edges = rawEdges
        .map((e: any): WebEdge => {
            const from = resolveUid(e.fromUid ?? e.from)
            const to = resolveUid(e.toUid ?? e.to)
            return {
                from,
                to,
                relationship: e.relationship,
                purpose: e.purpose,
            }
        })
        .filter((e: WebEdge) => e.from && e.to && knownUids.has(e.from) && knownUids.has(e.to))

    return { nodes, edges }
}
