export type Kind = 'system' | 'library' | 'datastore' | 'tool'

/** Wide-layout swimlane row; declared per entity in manifests (not hardcoded by team name). */
export type DiagramTier = 'top' | 'main'

export type Relationship =
    | 'sync_call'
    | 'async_event'
    | 'batch'
    | 'compile_time'
    | 'config'
    | 'data_read'
    | 'data_write'
    | 'unknown'

export interface Entity {
    id: string
    kind: Kind
    name?: string
    description?: string
    owner_team?: string
    diagram_tier?: DiagramTier
    business_critical?: boolean
    in_production?: boolean
    deprecated?: boolean
    regions?: Array<'EU' | 'US' | 'AP'>
}

export interface Dependency {
    target: { id: string; kind: Kind }
    relationship?: Relationship
    sla_impact?: 'IMMEDIATE' | 'AFTER_5_MIN' | 'AFTER_30_MIN' | 'NO_IMPACT'
    critical?: boolean
    regions?: Array<'EU' | 'US' | 'AP'>
    purpose?: string
}

export interface Manifest {
    schema_version: '1.0'
    entity: Entity
    entities?: Entity[]
    dependencies?: Dependency[]
}

export interface GraphNode {
    uid: string
    id: string
    kind: Kind
    label: string
    description?: string
    owner_team?: string
    diagram_tier?: DiagramTier
    business_critical?: boolean
    in_production?: boolean
    deprecated?: boolean
    defined?: boolean
}

export interface GraphEdge {
    from: string
    to: string
    relationship: Relationship
    purpose?: string
    critical?: boolean
    sla_impact?: string
}

export interface Graph {
    nodes: Map<string, GraphNode>
    edges: GraphEdge[]
}
