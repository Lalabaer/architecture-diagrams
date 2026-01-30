import type { Graph, GraphEdge, GraphNode, Manifest } from './types.js'

function uid(kind: string, id: string) {
    return `${kind}:${id}`
}

function labelFor(m: Manifest): string {
    return m.entity.name ?? m.entity.id
}

export function buildGraph(manifests: Manifest[]): Graph {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []

    for (const m of manifests) {
        const nUid = uid(m.entity.kind, m.entity.id)

        if (!nodes.has(nUid)) {
            nodes.set(nUid, {
                uid: nUid,
                id: m.entity.id,
                kind: m.entity.kind,
                label: labelFor(m),
                owner_team: m.entity.owner_team,
                business_critical: m.entity.business_critical,
                defined: true,
            })
        }

        for (const dep of m.dependencies ?? []) {
            const tUid = uid(dep.target.kind, dep.target.id)

            if (!nodes.has(tUid)) {
                // Allow unknown targets to exist as stub nodes (common early on)
                nodes.set(tUid, {
                    uid: tUid,
                    id: dep.target.id,
                    kind: dep.target.kind,
                    label: dep.target.id,
                })
            }

            edges.push({
                from: nUid,
                to: tUid,
                relationship: dep.relationship ?? 'unknown',
                purpose: dep.purpose,
                critical: dep.critical,
                sla_impact: dep.sla_impact,
            })
        }
    }

    return { nodes, edges }
}
