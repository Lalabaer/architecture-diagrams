import type { DiagramLayout } from '../shared/buildMermaid.js'
import { teamClusterId } from '../shared/buildMermaid.js'
import type { WebEdge, WebNode } from '../shared/graph.js'
import { buildLayoutEdgeIdMap, parseEdgeEndpoints } from '../shared/mermaidEdges.js'

const FOCUS_ACTIVE_CLASS = 'diagram--focusActive'
const NODE_DIMMED_CLASS = 'diagram__node--dimmed'
const NODE_SELECTED_CLASS = 'diagram__node--selected'
const NODE_RELATED_CLASS = 'diagram__node--related'
const EDGE_DIMMED_CLASS = 'diagram__edge--dimmed'
const EDGE_HIGHLIGHT_CLASS = 'diagram__edge--highlight'
const CLUSTER_DIMMED_CLASS = 'diagram__cluster--dimmed'

const INNER_CLUSTER_SUFFIXES = ['_system', '_library', '_tool', '_datastore', 'teams_row']

export interface FocusState {
    selectedUid: string
    downstream: Set<string>
    upstream: Set<string>
}

function uidFromNodeGroupId(groupId: string): string | null {
    const match = groupId.match(/flowchart-(.+)-\d+$/)

    return match?.[1] ?? null
}

function findNodeGroup(svgRoot: Element, uid: string): SVGGElement | null {
    return svgRoot.querySelector(`g.node[id*="flowchart-${CSS.escape(uid)}-"]`)
}

function isOuterTeamClusterId(clusterId: string): boolean {
    const suffix = clusterId.includes('-') ? clusterId.slice(clusterId.lastIndexOf('-') + 1) : clusterId

    if (INNER_CLUSTER_SUFFIXES.some((part) => suffix.endsWith(part))) {
        return false
    }

    return /^team_[a-z0-9_]+$/i.test(suffix)
}

function teamForOuterCluster(clusterId: string, teams: string[]): string | null {
    for (const team of teams) {
        const expected = teamClusterId(team)

        if (clusterId === expected || clusterId.endsWith(`-${expected}`)) {
            return team
        }
    }

    return null
}

function buildAdjacency(edges: WebEdge[]): {
    downstream: Map<string, Set<string>>
    upstream: Map<string, Set<string>>
} {
    const downstream = new Map<string, Set<string>>()
    const upstream = new Map<string, Set<string>>()

    for (const e of edges) {
        if (!downstream.has(e.from)) {
            downstream.set(e.from, new Set())
        }

        downstream.get(e.from)!.add(e.to)

        if (!upstream.has(e.to)) {
            upstream.set(e.to, new Set())
        }

        upstream.get(e.to)!.add(e.from)
    }

    return { downstream, upstream }
}

function computeFocusState(uid: string, edges: WebEdge[]): FocusState {
    const { downstream, upstream } = buildAdjacency(edges)

    return {
        selectedUid: uid,
        downstream: downstream.get(uid) ?? new Set(),
        upstream: upstream.get(uid) ?? new Set(),
    }
}

function relatedUids(state: FocusState): Set<string> {
    const related = new Set<string>([state.selectedUid])

    for (const uid of state.downstream) {
        related.add(uid)
    }

    for (const uid of state.upstream) {
        related.add(uid)
    }

    return related
}

function clearFocusClasses(svgRoot: Element): void {
    svgRoot.classList.remove(FOCUS_ACTIVE_CLASS)

    for (const el of svgRoot.querySelectorAll(
        `.${NODE_DIMMED_CLASS}, .${NODE_SELECTED_CLASS}, .${NODE_RELATED_CLASS}`,
    )) {
        el.classList.remove(NODE_DIMMED_CLASS, NODE_SELECTED_CLASS, NODE_RELATED_CLASS)
    }

    for (const el of svgRoot.querySelectorAll(`.${EDGE_DIMMED_CLASS}, .${EDGE_HIGHLIGHT_CLASS}`)) {
        el.classList.remove(EDGE_DIMMED_CLASS, EDGE_HIGHLIGHT_CLASS)
    }

    for (const el of svgRoot.querySelectorAll(`.${CLUSTER_DIMMED_CLASS}`)) {
        el.classList.remove(CLUSTER_DIMMED_CLASS)
    }
}

function applyFocus(
    svgRoot: Element,
    state: FocusState,
    edges: WebEdge[],
    nodes: WebNode[],
    diagramLayout: DiagramLayout,
): void {
    clearFocusClasses(svgRoot)
    svgRoot.classList.add(FOCUS_ACTIVE_CLASS)

    const related = relatedUids(state)
    const highlightEdgeKeys = new Set<string>()
    const knownUids = nodes.map((n) => n.uid)
    const nodeTeam = new Map(nodes.map((n) => [n.uid, n.owner_team?.trim() || 'Unowned']))
    const layoutEdgeMap = buildLayoutEdgeIdMap(edges, {
        allLayoutNeutral: diagramLayout === 'tb',
        nodeTeam,
    })
    const teams = [...new Set(nodes.map((n) => n.owner_team?.trim()).filter(Boolean))] as string[]

    for (const to of state.downstream) {
        highlightEdgeKeys.add(`${state.selectedUid}→${to}`)
    }

    for (const from of state.upstream) {
        highlightEdgeKeys.add(`${from}→${state.selectedUid}`)
    }

    for (const group of svgRoot.querySelectorAll<SVGGElement>('g.node')) {
        const uid = uidFromNodeGroupId(group.id)

        if (!uid) {
            continue
        }

        if (uid === state.selectedUid) {
            group.classList.add(NODE_SELECTED_CLASS)
        } else if (related.has(uid)) {
            group.classList.add(NODE_RELATED_CLASS)
        } else {
            group.classList.add(NODE_DIMMED_CLASS)
        }
    }

    const edgePaths = svgRoot.querySelector('.edgePaths')
    const edgeLabels = svgRoot.querySelector('.edgeLabels')

    if (edgePaths) {
        const paths = [...edgePaths.querySelectorAll<SVGPathElement>('path[data-edge="true"]')]

        for (const path of paths) {
            const endpoints = parseEdgeEndpoints(path, knownUids, layoutEdgeMap)

            if (!endpoints) {
                path.classList.add(EDGE_DIMMED_CLASS)
                continue
            }

            const key = `${endpoints.from}→${endpoints.to}`

            if (highlightEdgeKeys.has(key)) {
                path.classList.add(EDGE_HIGHLIGHT_CLASS)
            } else {
                path.classList.add(EDGE_DIMMED_CLASS)
            }
        }

        if (edgeLabels) {
            for (const label of edgeLabels.querySelectorAll<SVGGElement>('g.edgeLabel')) {
                label.classList.add(EDGE_DIMMED_CLASS)
            }

            for (const path of paths) {
                const endpoints = parseEdgeEndpoints(path, knownUids, layoutEdgeMap)

                if (!endpoints) {
                    continue
                }

                const key = `${endpoints.from}→${endpoints.to}`

                if (!highlightEdgeKeys.has(key)) {
                    continue
                }

                const dataId = path.getAttribute('data-id')
                const label = dataId
                    ? edgeLabels.querySelector<SVGGElement>(`g.label[data-id="${CSS.escape(dataId)}"]`)
                    : null

                if (label) {
                    label.classList.remove(EDGE_DIMMED_CLASS)
                    label.classList.add(EDGE_HIGHLIGHT_CLASS)
                }
            }
        }
    }

    for (const cluster of svgRoot.querySelectorAll<SVGGElement>('g.cluster')) {
        if (!isOuterTeamClusterId(cluster.id)) {
            continue
        }

        const team = teamForOuterCluster(cluster.id, teams)

        if (!team) {
            continue
        }

        const hasRelatedNode = nodes.some((node) => node.owner_team?.trim() === team && related.has(node.uid))

        if (!hasRelatedNode) {
            cluster.classList.add(CLUSTER_DIMMED_CLASS)
        }
    }
}

function updateFocusHint(state: FocusState | null, nodesByUid: Map<string, WebNode>): void {
    const hint = document.getElementById('focusHint')

    if (!hint) {
        return
    }

    if (!state) {
        hint.textContent = 'Click a component to highlight its direct dependencies.'
        hint.classList.remove('focusHint--active')

        return
    }

    const selected = nodesByUid.get(state.selectedUid)
    const title = selected?.name?.trim() || selected?.id || state.selectedUid

    hint.classList.add('focusHint--active')
    hint.textContent = `${title}: ${state.downstream.size} outgoing, ${state.upstream.size} incoming. Click empty space or press Esc to reset.`
}

export function attachNodeFocus(
    diagramContainer: HTMLElement,
    svgRoot: Element,
    nodes: WebNode[],
    edges: WebEdge[],
    diagramLayout: DiagramLayout,
): () => void {
    const nodesByUid = new Map(nodes.map((n) => [n.uid, n]))
    let currentFocus: FocusState | null = null

    const clearFocus = () => {
        currentFocus = null
        clearFocusClasses(svgRoot)
        updateFocusHint(null, nodesByUid)
    }

    const setFocus = (uid: string) => {
        if (currentFocus?.selectedUid === uid) {
            clearFocus()
            return
        }

        currentFocus = computeFocusState(uid, edges)
        applyFocus(svgRoot, currentFocus, edges, nodes, diagramLayout)
        updateFocusHint(currentFocus, nodesByUid)
    }

    const nodeClickHandlers = new Map<SVGGElement, (e: MouseEvent) => void>()

    for (const n of nodes) {
        const group = findNodeGroup(svgRoot, n.uid)

        if (!group) {
            continue
        }

        group.classList.add('node--focusable')

        const onClick = (e: MouseEvent) => {
            e.stopPropagation()
            setFocus(n.uid)
        }

        nodeClickHandlers.set(group, onClick)
        group.addEventListener('click', onClick)
    }

    const onDiagramClick = (e: MouseEvent) => {
        const target = e.target as Element | null

        if (!target?.closest('g.node')) {
            clearFocus()
        }
    }

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            clearFocus()
        }
    }

    diagramContainer.addEventListener('click', onDiagramClick)
    document.addEventListener('keydown', onKeyDown)

    updateFocusHint(null, nodesByUid)

    return () => {
        clearFocus()

        for (const [group, onClick] of nodeClickHandlers) {
            group.removeEventListener('click', onClick)
        }

        diagramContainer.removeEventListener('click', onDiagramClick)
        document.removeEventListener('keydown', onKeyDown)
    }
}
