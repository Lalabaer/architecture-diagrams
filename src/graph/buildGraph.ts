import type { Entity, Graph, GraphEdge, GraphNode, Manifest } from './types.js'

function uid(kind: string, id: string) {
    return `${kind}:${id}`
}

function nodeFromEntity(entity: Entity): GraphNode {
    return {
        uid: uid(entity.kind, entity.id),
        id: entity.id,
        kind: entity.kind,
        label: entity.name ?? entity.id,
        owner_team: entity.owner_team,
        business_critical: entity.business_critical,
        defined: true,
    }
}

function upsertEntityNode(nodes: Map<string, GraphNode>, entity: Entity): void {
    const next = nodeFromEntity(entity)
    const existing = nodes.get(next.uid)

    // Stub targets from dependencies are created without owner_team. When the real
    // manifest for that entity appears later, merge so swimlanes and labels stay correct.
    if (!existing) {
        nodes.set(next.uid, next)
    } else {
        nodes.set(next.uid, { ...existing, ...next })
    }
}

export function buildGraph(manifests: Manifest[]): Graph {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []

    for (const m of manifests) {
        upsertEntityNode(nodes, m.entity)

        // Co-owned / co-located entities declared inline in this manifest. Useful for
        // resources that don't have their own code repo (AWS infra, SaaS, internal hosted
        // services). Each is treated as a fully defined node, just like m.entity.
        for (const e of m.entities ?? []) {
            upsertEntityNode(nodes, e)
        }

        const fromUid = uid(m.entity.kind, m.entity.id)

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
                from: fromUid,
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
