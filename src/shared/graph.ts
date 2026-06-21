export type Kind = 'system' | 'datastore' | 'library' | 'tool'

export type Relationship =
    | 'sync_call'
    | 'async_event'
    | 'batch'
    | 'compile_time'
    | 'config'
    | 'data_read'
    | 'data_write'
    | 'unknown'

export type View = 'architecture' | 'technical'

/** Kinds that can appear in each diagram view (used for the type filter UI). */
export const KINDS_BY_VIEW: Record<View, Kind[]> = {
    architecture: ['system', 'datastore'],
    technical: ['system', 'datastore', 'library', 'tool'],
}

export interface WebNode {
    uid: string // unique stable node id for mermaid, e.g. "system_playback-service"
    id: string // raw id, e.g. "playback-service"
    kind: Kind
    owner_team?: string
    name?: string
    description?: string
    business_critical?: boolean
    in_production?: boolean
    deprecated?: boolean
}

export interface WebEdge {
    from: string // uid
    to: string // uid
    relationship?: Relationship
    purpose?: string
}

export interface WebGraph {
    nodes: WebNode[]
    edges: WebEdge[]
}

export function getTeams(graph: WebGraph): string[] {
    const set = new Set<string>()

    for (const n of graph.nodes) {
        if (n.owner_team && n.owner_team.trim()) {
            set.add(n.owner_team.trim())
        }
    }

    return [...set].sort((a, b) => a.localeCompare(b))
}
