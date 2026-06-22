import { KIND_LAYERS, teamClusterId } from '../shared/buildMermaid.js'
import type { Kind, WebEdge, WebNode } from '../shared/graph.js'
import { parseEdgeEndpoints } from '../shared/mermaidEdges.js'

const ROW_GAP_BELOW_TOP = 24
const TEAM_ROW_GAP = 44
const MAX_TEAM_ROW_WIDTH = 2400
const MIN_TEAM_GAP = 28
const KIND_LAYER_GAP = 36
const SERVICE_DATASTORE_GAP = 32
const MIN_SYSTEM_NODE_HEIGHT = 60
const NODE_H_GAP = 24
const TEAM_PAD_X = 12
const TEAM_PAD_Y = 16
const TEAM_LABEL_HEIGHT = 24
const EDGE_LANE_GAP = 12
const MIN_EDGE_ANCHOR_GAP = 24
const DIAGRAM_ORIGIN_X = 0
const DIAGRAM_ORIGIN_Y = 12
const EDGE_TARGET_GAP = 2

type ExitSide = 'right' | 'left' | 'bottom' | 'top'

function isTopRowTeam(teamNodes: WebNode[]): boolean {
    return teamNodes.length > 0 && teamNodes.every((n) => n.diagram_tier === 'top')
}

function matchesClusterId(renderedId: string, expectedId: string): boolean {
    return renderedId === expectedId || renderedId.endsWith(`-${expectedId}`)
}

function clusterBelongsToTeam(renderedId: string, expectedTeamId: string): boolean {
    const marker = renderedId.includes(`-${expectedTeamId}`)
        ? renderedId.slice(renderedId.indexOf(`-${expectedTeamId}`) + 1)
        : renderedId.endsWith(expectedTeamId)
          ? expectedTeamId
          : ''

    if (!marker.startsWith(expectedTeamId)) {
        return false
    }

    const suffix = marker.slice(expectedTeamId.length)

    return suffix === '' || suffix.startsWith('_')
}

function findTeamCluster(svgRoot: SVGSVGElement, clusterId: string): SVGGElement | null {
    for (const cluster of svgRoot.querySelectorAll<SVGGElement>('g.cluster')) {
        if (matchesClusterId(cluster.id, clusterId)) {
            return cluster
        }
    }

    return null
}

function findNodeGroup(svgRoot: SVGSVGElement, uid: string): SVGGElement | null {
    return svgRoot.querySelector(`g.node[id*="flowchart-${CSS.escape(uid)}-"]`)
}

function parseAccumulatedTranslate(transform: string | null): { x: number; y: number } {
    let x = 0
    let y = 0

    if (!transform) {
        return { x, y }
    }

    for (const match of transform.matchAll(/translate\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)/g)) {
        x += parseFloat(match[1])
        y += parseFloat(match[2] ?? '0')
    }

    return { x, y }
}

function nodeBounds(node: SVGGElement): { x: number; y: number; width: number; height: number } {
    const local = node.getBBox()
    const shift = parseAccumulatedTranslate(node.getAttribute('transform'))

    return {
        x: local.x + shift.x,
        y: local.y + shift.y,
        width: local.width,
        height: local.height,
    }
}

function entrySide(
    toBox: { x: number; y: number; width: number; height: number },
    fromBox: { x: number; y: number; width: number; height: number },
): ExitSide {
    const fromCx = fromBox.x + fromBox.width / 2
    const toCx = toBox.x + toBox.width / 2
    const dx = fromCx - toCx

    if (fromBox.y + fromBox.height <= toBox.y + 8) {
        return 'top'
    }

    if (fromBox.y >= toBox.y + toBox.height - 8) {
        return 'bottom'
    }

    return dx >= 0 ? 'right' : 'left'
}

function simpleEdgePath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    fromBox: { x: number; y: number; width: number; height: number },
    toBox: { x: number; y: number; width: number; height: number },
    laneOffset = 0,
): string {
    const fromCy = fromBox.y + fromBox.height / 2
    const toCy = toBox.y + toBox.height / 2
    const dx = to.x - from.x
    const dy = to.y - from.y

    // Target is below — always route down (service → datastore, etc.)
    if (toBox.y > fromBox.y + 4) {
        const midY = (from.y + to.y) / 2
        return `M ${from.x},${from.y} L ${from.x},${midY} L ${to.x},${midY} L ${to.x},${to.y}`
    }

    // Same-row horizontal flow
    if (Math.abs(fromCy - toCy) < 24 && Math.abs(dy) < 20) {
        return `M ${from.x},${from.y} L ${to.x},${to.y}`
    }

    // Cross-team at same row: route in a lane below the service/data rows
    if (Math.abs(fromCy - toCy) < 40 && Math.abs(dx) > 48) {
        const busY = Math.max(fromBox.y + fromBox.height, toBox.y + toBox.height) + 20 + Math.abs(laneOffset)
        return `M ${from.x},${from.y} L ${from.x},${busY} L ${to.x},${busY} L ${to.x},${to.y}`
    }

    // Cross-team / long distance: vertical exit, horizontal travel, vertical entry
    if (Math.abs(dx) > 48) {
        const midY = from.y + dy * 0.45 + laneOffset
        return `M ${from.x},${from.y} L ${from.x},${midY} L ${to.x},${midY} L ${to.x},${to.y}`
    }

    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
        return `M ${from.x},${from.y} L ${to.x},${to.y}`
    }

    const cx1 = from.x + dx * 0.35
    const cy1 = from.y
    const cx2 = to.x - dx * 0.35
    const cy2 = to.y

    return `M ${from.x},${from.y} C ${cx1},${cy1} ${cx2},${cy2} ${to.x},${to.y}`
}

function exitSide(
    fromBox: { x: number; y: number; width: number; height: number },
    toBox: { x: number; y: number; width: number; height: number },
): ExitSide {
    const fromCx = fromBox.x + fromBox.width / 2
    const toCx = toBox.x + toBox.width / 2
    const dx = toCx - fromCx

    if (toBox.y > fromBox.y + 8) {
        return 'bottom'
    }

    if (toBox.y + toBox.height < fromBox.y - 12) {
        return 'top'
    }

    return dx >= 0 ? 'right' : 'left'
}

function spreadAnchor(
    box: { x: number; y: number; width: number; height: number },
    side: ExitSide,
    index: number,
    size: number,
    inset = 0,
): { x: number; y: number } {
    const slot = (index + 1) / (size + 1)

    switch (side) {
        case 'bottom':
            return { x: box.x + box.width * slot, y: box.y + box.height + inset }
        case 'top':
            return { x: box.x + box.width * slot, y: box.y - inset }
        case 'right':
            return { x: box.x + box.width + inset, y: box.y + box.height * slot }
        case 'left':
            return { x: box.x - inset, y: box.y + box.height * slot }
    }
}

function sideSpan(box: { width: number; height: number }, side: ExitSide): number {
    return side === 'left' || side === 'right' ? box.height : box.width
}

function anchorSlotCount(box: { width: number; height: number }, side: ExitSide, requestedCount: number): number {
    if (requestedCount <= 1) {
        return requestedCount
    }

    const naturalGap = sideSpan(box, side) / (requestedCount + 1)

    return naturalGap >= MIN_EDGE_ANCHOR_GAP ? requestedCount : 1
}

function anchorSlotIndex(index: number, requestedCount: number, slotCount: number): number {
    if (requestedCount <= 1 || slotCount <= 1) {
        return 0
    }

    if (slotCount >= requestedCount) {
        return index
    }

    return Math.round((index / (requestedCount - 1)) * (slotCount - 1))
}

function pathMidpoint(d: string): { x: number; y: number } | null {
    const nums = d.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)?.map(Number)

    if (!nums || nums.length < 2) {
        return null
    }

    const x1 = nums[0]
    const y1 = nums[1]
    const x2 = nums[nums.length - 2]
    const y2 = nums[nums.length - 1]

    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}

function labelHasText(label: SVGGElement): boolean {
    return (label.textContent?.replace(/\s/g, '') ?? '').length > 0
}

export const EDGE_MARKER_ID = 'arch-edge-arrow'
export const EDGE_MARKER_HIGHLIGHT_ID = 'arch-edge-arrow-highlight'

const SVG_NS = 'http://www.w3.org/2000/svg'

function installEdgeMarkers(svg: SVGSVGElement): void {
    let defs = svg.querySelector('defs')

    if (!defs) {
        defs = document.createElementNS(SVG_NS, 'defs')
        svg.insertBefore(defs, svg.firstChild)
    }

    if (!defs.querySelector(`#${EDGE_MARKER_ID}`)) {
        const marker = document.createElementNS(SVG_NS, 'marker')
        marker.setAttribute('id', EDGE_MARKER_ID)
        marker.setAttribute('markerUnits', 'userSpaceOnUse')
        marker.setAttribute('markerWidth', '10')
        marker.setAttribute('markerHeight', '10')
        marker.setAttribute('refX', '9')
        marker.setAttribute('refY', '5')
        marker.setAttribute('orient', 'auto')
        marker.setAttribute('viewBox', '0 0 10 10')

        const head = document.createElementNS(SVG_NS, 'path')
        head.setAttribute('d', 'M 1.5 1.5 L 9 5 L 1.5 8.5 Z')
        head.setAttribute('fill', '#64748b')
        head.setAttribute('stroke', 'none')
        marker.appendChild(head)
        defs.appendChild(marker)
    }

    if (!defs.querySelector(`#${EDGE_MARKER_HIGHLIGHT_ID}`)) {
        const marker = document.createElementNS(SVG_NS, 'marker')
        marker.setAttribute('id', EDGE_MARKER_HIGHLIGHT_ID)
        marker.setAttribute('markerUnits', 'userSpaceOnUse')
        marker.setAttribute('markerWidth', '10')
        marker.setAttribute('markerHeight', '10')
        marker.setAttribute('refX', '9')
        marker.setAttribute('refY', '5')
        marker.setAttribute('orient', 'auto')
        marker.setAttribute('viewBox', '0 0 10 10')

        const head = document.createElementNS(SVG_NS, 'path')
        head.setAttribute('d', 'M 1.5 1.5 L 9 5 L 1.5 8.5 Z')
        head.setAttribute('fill', '#2563eb')
        head.setAttribute('stroke', 'none')
        marker.appendChild(head)
        defs.appendChild(marker)
    }
}

function applyEdgeMarkers(svg: SVGSVGElement): void {
    for (const path of svg.querySelectorAll<SVGPathElement>('.edgePaths path[data-edge="true"]')) {
        if (!path.getAttribute('d')) {
            continue
        }

        path.setAttribute('marker-end', `url(#${EDGE_MARKER_ID})`)
    }
}

function rerouteEdgesAfterShift(svg: SVGSVGElement, includedNodes: WebNode[]): void {
    installEdgeMarkers(svg)
    const knownUids = includedNodes.map((n) => n.uid)
    const labelByDataId = new Map<string, SVGGElement>()

    for (const label of svg.querySelectorAll<SVGGElement>('.edgeLabels g.label[data-id]')) {
        labelByDataId.set(label.getAttribute('data-id') ?? '', label)
    }

    interface EdgeWork {
        path: SVGPathElement
        from: string
        to: string
        fromNode: SVGGElement
        toNode: SVGGElement
        fromBox: ReturnType<typeof nodeBounds>
        toBox: ReturnType<typeof nodeBounds>
        fromSide: ExitSide
        toSide: ExitSide
    }

    const edges: EdgeWork[] = []

    for (const path of svg.querySelectorAll<SVGPathElement>('.edgePaths path[data-edge="true"]')) {
        const endpoints = parseEdgeEndpoints(path, knownUids, new Map())

        if (!endpoints) {
            continue
        }

        const fromNode = findNodeGroup(svg, endpoints.from)
        const toNode = findNodeGroup(svg, endpoints.to)

        if (!fromNode || !toNode) {
            continue
        }

        const fromBox = nodeBounds(fromNode)
        const toBox = nodeBounds(toNode)

        edges.push({
            path,
            from: endpoints.from,
            to: endpoints.to,
            fromNode,
            toNode,
            fromBox,
            toBox,
            fromSide: exitSide(fromBox, toBox),
            toSide: entrySide(toBox, fromBox),
        })
    }

    const fromBundles = new Map<string, EdgeWork[]>()
    const toBundles = new Map<string, EdgeWork[]>()

    for (const edge of edges) {
        const fromKey = `${edge.from}:${edge.fromSide}`
        const toKey = `${edge.to}:${edge.toSide}`
        const fromList = fromBundles.get(fromKey) ?? []
        fromList.push(edge)
        fromBundles.set(fromKey, fromList)
        const toList = toBundles.get(toKey) ?? []
        toList.push(edge)
        toBundles.set(toKey, toList)
    }

    for (const list of fromBundles.values()) {
        list.sort((a, b) => a.to.localeCompare(b.to))
    }

    for (const list of toBundles.values()) {
        list.sort((a, b) => a.from.localeCompare(b.from))
    }

    for (const edge of edges) {
        const fromKey = `${edge.from}:${edge.fromSide}`
        const toKey = `${edge.to}:${edge.toSide}`
        const fromList = fromBundles.get(fromKey)!
        const toList = toBundles.get(toKey)!
        const fromIndex = fromList.indexOf(edge)
        const toIndex = toList.indexOf(edge)
        const fromLane = (fromIndex - (fromList.length - 1) / 2) * EDGE_LANE_GAP
        const toLane = (toIndex - (toList.length - 1) / 2) * EDGE_LANE_GAP
        const routeLane = fromLane
        const fromSlotCount = anchorSlotCount(edge.fromBox, edge.fromSide, fromList.length)
        const toSlotCount = anchorSlotCount(edge.toBox, edge.toSide, toList.length)
        const fromSlot = anchorSlotIndex(fromIndex, fromList.length, fromSlotCount)
        const toSlot = anchorSlotIndex(toIndex, toList.length, toSlotCount)

        const start = spreadAnchor(edge.fromBox, edge.fromSide, fromSlot, fromSlotCount)
        const end = spreadAnchor(edge.toBox, edge.toSide, toSlot, toSlotCount, EDGE_TARGET_GAP)

        if (fromSlotCount === fromList.length && (edge.fromSide === 'right' || edge.fromSide === 'left')) {
            start.y += fromLane
        } else if (fromSlotCount === fromList.length) {
            start.x += fromLane
        }

        if (toSlotCount === toList.length && (edge.toSide === 'right' || edge.toSide === 'left')) {
            end.y += toLane
        } else if (toSlotCount === toList.length) {
            end.x += toLane
        }

        const d = simpleEdgePath(start, end, edge.fromBox, edge.toBox, routeLane)

        edge.path.setAttribute('d', d)
        edge.path.removeAttribute('transform')

        const dataId = edge.path.getAttribute('data-id') ?? ''
        const label = labelByDataId.get(dataId)

        if (!label) {
            continue
        }

        if (!labelHasText(label)) {
            label.setAttribute('visibility', 'hidden')
            continue
        }

        const mid = pathMidpoint(d)

        if (mid) {
            label.setAttribute('transform', `translate(${mid.x}, ${mid.y})`)
            label.removeAttribute('visibility')
        }
    }

    applyEdgeMarkers(svg)
}

function nodeLocalBox(node: SVGGElement): { x: number; y: number; width: number; height: number } {
    const saved = node.getAttribute('transform')
    node.removeAttribute('transform')
    const box = node.getBBox()
    if (saved) {
        node.setAttribute('transform', saved)
    }

    return { x: box.x, y: box.y, width: box.width, height: box.height }
}

function setNodeAbsolutePosition(node: SVGGElement, targetX: number, targetY: number): void {
    node.removeAttribute('transform')
    const local = node.getBBox()
    node.setAttribute('transform', `translate(${targetX - local.x}, ${targetY - local.y})`)
}

function resetTeamClusterTransforms(svg: SVGSVGElement, teamId: string): void {
    for (const cluster of svg.querySelectorAll<SVGGElement>('g.cluster')) {
        if (clusterBelongsToTeam(cluster.id, teamId)) {
            cluster.removeAttribute('transform')
        }
    }
}

function resetMermaidRootTransforms(svg: SVGSVGElement): void {
    for (const root of svg.querySelectorAll<SVGGElement>('g.root')) {
        root.removeAttribute('transform')
    }
}

function teamsFromNodes(nodes: WebNode[]): Map<string, WebNode[]> {
    const byTeam = new Map<string, WebNode[]>()

    for (const node of nodes) {
        const team = node.owner_team?.trim() || 'Unowned'
        const list = byTeam.get(team) ?? []
        list.push(node)
        byTeam.set(team, list)
    }

    for (const list of byTeam.values()) {
        list.sort((a, b) => a.uid.localeCompare(b.uid))
    }

    return byTeam
}

function updateTeamClusterLabel(cluster: SVGGElement, rectX: number, rectY: number): void {
    const label = cluster.querySelector<SVGGElement>('.cluster-label')

    if (!label) {
        return
    }

    label.setAttribute('transform', `translate(${rectX + 12}, ${rectY + 18})`)
}

function updateTeamClusterRect(
    svg: SVGSVGElement,
    cluster: SVGGElement,
    teamNodes: WebNode[],
    fixedBox?: { x: number; y: number; width: number; height: number },
): void {
    const rect = cluster.querySelector(':scope > rect')

    if (!rect) {
        return
    }

    if (fixedBox) {
        rect.setAttribute('x', String(fixedBox.x))
        rect.setAttribute('y', String(fixedBox.y))
        rect.setAttribute('width', String(fixedBox.width))
        rect.setAttribute('height', String(fixedBox.height))
        updateTeamClusterLabel(cluster, fixedBox.x, fixedBox.y)
        return
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of teamNodes) {
        const group = findNodeGroup(svg, node.uid)

        if (!group) {
            continue
        }

        const box = nodeBounds(group)
        minX = Math.min(minX, box.x)
        minY = Math.min(minY, box.y)
        maxX = Math.max(maxX, box.x + box.width)
        maxY = Math.max(maxY, box.y + box.height)
    }

    if (!Number.isFinite(minX)) {
        return
    }

    const clusterShift = parseAccumulatedTranslate(cluster.getAttribute('transform'))
    const rectX = minX - TEAM_PAD_X - clusterShift.x
    const rectY = minY - TEAM_PAD_Y - TEAM_LABEL_HEIGHT - clusterShift.y
    const rectW = maxX - minX + TEAM_PAD_X * 2
    const rectH = maxY - minY + TEAM_PAD_Y * 2 + TEAM_LABEL_HEIGHT

    rect.setAttribute('x', String(rectX))
    rect.setAttribute('y', String(rectY))
    rect.setAttribute('width', String(rectW))
    rect.setAttribute('height', String(rectH))
    updateTeamClusterLabel(cluster, rectX, rectY)
}

interface TeamLayerLayout {
    kind: Kind
    nodes: WebNode[]
    rowWidth: number
    rowHeight: number
}

interface TeamColumnLayout {
    system: WebNode
    datastores: WebNode[]
    width: number
    height: number
    systemHeight: number
    datastoreRowWidth: number
    datastoreRowHeight: number
}

interface TeamLayoutPlan {
    width: number
    height: number
    layers: TeamLayerLayout[]
    columns: TeamColumnLayout[]
    sharedDatastores: TeamLayerLayout | null
    columnRowHeight: number
}

function nodeSize(svg: SVGSVGElement, node: WebNode): { width: number; height: number } {
    const group = findNodeGroup(svg, node.uid)

    if (!group) {
        return { width: 0, height: 0 }
    }

    const size = nodeLocalBox(group)

    return { width: size.width, height: size.height }
}

function rowMetrics(svg: SVGSVGElement, nodes: WebNode[]): { rowWidth: number; rowHeight: number } {
    let rowWidth = 0
    let rowHeight = 0

    for (const node of nodes) {
        const size = nodeSize(svg, node)
        rowWidth += size.width + NODE_H_GAP
        rowHeight = Math.max(rowHeight, size.height)
    }

    return {
        rowWidth: Math.max(0, rowWidth - NODE_H_GAP),
        rowHeight,
    }
}

function columnsWidth(columns: TeamColumnLayout[]): number {
    return Math.max(0, columns.reduce((sum, column) => sum + column.width + NODE_H_GAP, 0) - NODE_H_GAP)
}

function serviceDatastoresByUid(teamNodes: WebNode[], includedEdges: WebEdge[]): Map<string, WebNode[]> {
    const nodesByUid = new Map(teamNodes.map((node) => [node.uid, node]))
    const ownersByDatastore = new Map<string, Set<string>>()

    for (const edge of includedEdges) {
        const from = nodesByUid.get(edge.from)
        const to = nodesByUid.get(edge.to)

        if (!from || !to || from.kind !== 'system' || to.kind !== 'datastore') {
            continue
        }

        const owners = ownersByDatastore.get(to.uid) ?? new Set<string>()
        owners.add(from.uid)
        ownersByDatastore.set(to.uid, owners)
    }

    const byService = new Map<string, WebNode[]>()

    for (const [datastoreUid, owners] of ownersByDatastore) {
        if (owners.size !== 1) {
            continue
        }

        const datastore = nodesByUid.get(datastoreUid)
        const serviceUid = [...owners][0]

        if (!datastore) {
            continue
        }

        const list = byService.get(serviceUid) ?? []
        list.push(datastore)
        byService.set(serviceUid, list)
    }

    for (const list of byService.values()) {
        list.sort((a, b) => a.uid.localeCompare(b.uid))
    }

    return byService
}

function planTeamLayout(svg: SVGSVGElement, teamNodes: WebNode[], includedEdges: WebEdge[]): TeamLayoutPlan {
    const byKind = new Map<Kind, WebNode[]>()

    for (const node of teamNodes) {
        const list = byKind.get(node.kind) ?? []
        list.push(node)
        byKind.set(node.kind, list)
    }

    for (const list of byKind.values()) {
        list.sort((a, b) => a.uid.localeCompare(b.uid))
    }

    const systemNodes = byKind.get('system') ?? []
    const datastoreNodes = byKind.get('datastore') ?? []
    const datastoresByService = serviceDatastoresByUid(teamNodes, includedEdges)
    const assignedDatastoreUids = new Set([...datastoresByService.values()].flat().map((node) => node.uid))
    const sharedDatastores = datastoreNodes.filter((node) => !assignedDatastoreUids.has(node.uid))
    const columns: TeamColumnLayout[] = []
    let columnRowWidth = 0
    let columnRowHeight = 0

    for (const system of systemNodes) {
        const systemSize = nodeSize(svg, system)
        const systemHeight = Math.max(systemSize.height, MIN_SYSTEM_NODE_HEIGHT)
        const datastores = datastoresByService.get(system.uid) ?? []
        const datastoreMetrics = rowMetrics(svg, datastores)
        const hasDatastores = datastores.length > 0
        const height = systemHeight + (hasDatastores ? SERVICE_DATASTORE_GAP + datastoreMetrics.rowHeight : 0)
        const width = Math.max(systemSize.width, datastoreMetrics.rowWidth)

        columns.push({
            system,
            datastores,
            width,
            height,
            systemHeight,
            datastoreRowWidth: datastoreMetrics.rowWidth,
            datastoreRowHeight: datastoreMetrics.rowHeight,
        })
        columnRowWidth += width + NODE_H_GAP
        columnRowHeight = Math.max(columnRowHeight, height)
    }

    columnRowWidth = Math.max(0, columnRowWidth - NODE_H_GAP)

    const presentLayers = KIND_LAYERS.filter((kind) => (byKind.get(kind)?.length ?? 0) > 0)
    const layers: TeamLayerLayout[] = []
    let width = TEAM_PAD_X * 2
    let height = TEAM_PAD_Y * 2 + TEAM_LABEL_HEIGHT

    for (const kind of presentLayers) {
        if (systemNodes.length > 0 && (kind === 'system' || kind === 'datastore')) {
            continue
        }

        const nodes = byKind.get(kind)!
        const { rowWidth, rowHeight } = rowMetrics(svg, nodes)
        width = Math.max(width, rowWidth + TEAM_PAD_X * 2)
        layers.push({ kind, nodes, rowWidth, rowHeight })
        height += rowHeight + (layers.length > 1 ? KIND_LAYER_GAP : 0)
    }

    const sharedDatastoreLayer =
        sharedDatastores.length > 0
            ? {
                  kind: 'datastore' as const,
                  nodes: sharedDatastores,
                  ...rowMetrics(svg, sharedDatastores),
              }
            : null

    if (columns.length > 0) {
        width = Math.max(width, columnRowWidth + TEAM_PAD_X * 2)
        height += columnRowHeight
    }

    if (columns.length > 0 && layers.length > 0) {
        height += KIND_LAYER_GAP
    }

    if (sharedDatastoreLayer) {
        width = Math.max(width, sharedDatastoreLayer.rowWidth + TEAM_PAD_X * 2)
        height += (columns.length > 0 || layers.length > 0 ? KIND_LAYER_GAP : 0) + sharedDatastoreLayer.rowHeight
    }

    return { width, height, layers, columns, sharedDatastores: sharedDatastoreLayer, columnRowHeight }
}

function placeTeam(
    svg: SVGSVGElement,
    team: string,
    teamNodes: WebNode[],
    originX: number,
    originY: number,
    plan: TeamLayoutPlan,
    outerHeight = plan.height,
): void {
    resetTeamClusterTransforms(svg, teamClusterId(team))

    let rowY = originY + TEAM_PAD_Y + TEAM_LABEL_HEIGHT

    if (plan.columns.length > 0) {
        let columnX = originX + TEAM_PAD_X + Math.max(0, (plan.width - TEAM_PAD_X * 2 - columnsWidth(plan.columns)) / 2)

        for (const column of plan.columns) {
            const systemGroup = findNodeGroup(svg, column.system.uid)
            let datastoreY = rowY + column.systemHeight + SERVICE_DATASTORE_GAP

            if (systemGroup) {
                const systemSize = nodeLocalBox(systemGroup)
                setNodeAbsolutePosition(systemGroup, columnX + (column.width - systemSize.width) / 2, rowY)
                datastoreY = nodeBounds(systemGroup).y + systemSize.height + SERVICE_DATASTORE_GAP
            }

            let datastoreX = columnX + Math.max(0, (column.width - column.datastoreRowWidth) / 2)

            for (const datastore of column.datastores) {
                const datastoreGroup = findNodeGroup(svg, datastore.uid)

                if (!datastoreGroup) {
                    continue
                }

                setNodeAbsolutePosition(datastoreGroup, datastoreX, datastoreY)
                datastoreX += nodeLocalBox(datastoreGroup).width + NODE_H_GAP
            }

            columnX += column.width + NODE_H_GAP
        }

        rowY += plan.columnRowHeight

        if (plan.layers.length > 0 || plan.sharedDatastores) {
            rowY += KIND_LAYER_GAP
        }
    }

    for (const layer of plan.layers) {
        let rowX = originX + TEAM_PAD_X + Math.max(0, (plan.width - TEAM_PAD_X * 2 - layer.rowWidth) / 2)

        for (const node of layer.nodes) {
            const group = findNodeGroup(svg, node.uid)

            if (!group) {
                continue
            }

            setNodeAbsolutePosition(group, rowX, rowY)
            rowX += nodeLocalBox(group).width + NODE_H_GAP
        }

        rowY += layer.rowHeight + KIND_LAYER_GAP
    }

    if (plan.sharedDatastores) {
        let rowX =
            originX + TEAM_PAD_X + Math.max(0, (plan.width - TEAM_PAD_X * 2 - plan.sharedDatastores.rowWidth) / 2)

        for (const node of plan.sharedDatastores.nodes) {
            const group = findNodeGroup(svg, node.uid)

            if (!group) {
                continue
            }

            setNodeAbsolutePosition(group, rowX, rowY)
            rowX += nodeLocalBox(group).width + NODE_H_GAP
        }
    }

    const cluster = findTeamCluster(svg, teamClusterId(team))

    if (cluster) {
        updateTeamClusterRect(svg, cluster, teamNodes, {
            x: originX,
            y: originY,
            width: plan.width,
            height: outerHeight,
        })
    }
}

function teamRenderOrder(svg: SVGSVGElement, includedNodes: WebNode[]): string[] {
    const teams = [...teamsFromNodes(includedNodes).keys()]

    return teams.sort((a, b) => {
        const clusterA = findTeamCluster(svg, teamClusterId(a))
        const clusterB = findTeamCluster(svg, teamClusterId(b))
        const rectA = clusterA?.querySelector(':scope > rect')
        const rectB = clusterB?.querySelector(':scope > rect')
        const shiftA = parseAccumulatedTranslate(clusterA?.getAttribute('transform') ?? null)
        const shiftB = parseAccumulatedTranslate(clusterB?.getAttribute('transform') ?? null)
        const xA = parseFloat(rectA?.getAttribute('x') ?? '0') + shiftA.x
        const xB = parseFloat(rectB?.getAttribute('x') ?? '0') + shiftB.x

        if (xA !== xB) {
            return xA - xB
        }

        return a.localeCompare(b)
    })
}

function dependencyTeamOrder(baseOrder: string[], includedNodes: WebNode[], includedEdges: WebEdge[]): string[] {
    const teamByUid = new Map(includedNodes.map((node) => [node.uid, node.owner_team?.trim() || 'Unowned']))
    const baseIndex = new Map(baseOrder.map((team, index) => [team, index]))
    const edgeCounts = new Map<string, number>()

    for (const edge of includedEdges) {
        const fromTeam = teamByUid.get(edge.from)
        const toTeam = teamByUid.get(edge.to)

        if (!fromTeam || !toTeam || fromTeam === toTeam || !baseIndex.has(fromTeam) || !baseIndex.has(toTeam)) {
            continue
        }

        const key = `${fromTeam}→${toTeam}`
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
    }

    return [...baseOrder].sort((a, b) => {
        const aToB = edgeCounts.get(`${a}→${b}`) ?? 0
        const bToA = edgeCounts.get(`${b}→${a}`) ?? 0

        if (aToB !== bToA) {
            return bToA - aToB
        }

        return (baseIndex.get(a) ?? 0) - (baseIndex.get(b) ?? 0)
    })
}

interface TeamRowItem {
    team: string
    teamNodes: WebNode[]
    plan: TeamLayoutPlan
}

function placeTeamRows(
    svg: SVGSVGElement,
    teams: [string, WebNode[]][],
    startY: number,
    includedEdges: WebEdge[],
): number {
    const rows: Array<{ items: TeamRowItem[]; width: number; height: number }> = []
    let current = { items: [] as TeamRowItem[], width: 0, height: 0 }

    for (const [team, teamNodes] of teams) {
        const plan = planTeamLayout(svg, teamNodes, includedEdges)
        const nextWidth = current.items.length === 0 ? plan.width : current.width + MIN_TEAM_GAP + plan.width

        if (current.items.length > 0 && nextWidth > MAX_TEAM_ROW_WIDTH) {
            rows.push(current)
            current = { items: [], width: 0, height: 0 }
        }

        current.items.push({ team, teamNodes, plan })
        current.width = current.width === 0 ? plan.width : current.width + MIN_TEAM_GAP + plan.width
        current.height = Math.max(current.height, plan.height)
    }

    if (current.items.length > 0) {
        rows.push(current)
    }

    let rowY = startY
    let bottom = startY

    for (const row of rows) {
        let x = DIAGRAM_ORIGIN_X

        for (const item of row.items) {
            placeTeam(svg, item.team, item.teamNodes, x, rowY, item.plan, row.height)
            x += item.plan.width + MIN_TEAM_GAP
        }

        bottom = Math.max(bottom, rowY + row.height)
        rowY += row.height + TEAM_ROW_GAP
    }

    return bottom
}

function layoutTeamsFromScratch(svg: SVGSVGElement, includedNodes: WebNode[], includedEdges: WebEdge[]): void {
    const byTeam = teamsFromNodes(includedNodes)
    const order = dependencyTeamOrder(teamRenderOrder(svg, includedNodes), includedNodes, includedEdges)
    const topTeams: [string, WebNode[]][] = []
    const rowTeams: [string, WebNode[]][] = []

    for (const team of order) {
        const teamNodes = byTeam.get(team)

        if (!teamNodes) {
            continue
        }

        if (isTopRowTeam(teamNodes)) {
            topTeams.push([team, teamNodes])
        } else {
            rowTeams.push([team, teamNodes])
        }
    }

    let mainRowY = DIAGRAM_ORIGIN_Y
    let topRowBottom = DIAGRAM_ORIGIN_Y

    if (topTeams.length > 0) {
        topRowBottom = placeTeamRows(svg, topTeams, DIAGRAM_ORIGIN_Y, includedEdges)
        mainRowY = topRowBottom + ROW_GAP_BELOW_TOP
    }

    placeTeamRows(svg, rowTeams, mainRowY, includedEdges)
}

function outerTeamClusterRect(cluster: SVGGElement): { x: number; y: number; width: number; height: number } | null {
    const suffix = cluster.id.includes('-') ? cluster.id.slice(cluster.id.lastIndexOf('-') + 1) : cluster.id

    if (
        suffix.endsWith('_system') ||
        suffix.endsWith('_library') ||
        suffix.endsWith('_tool') ||
        suffix.endsWith('_datastore') ||
        suffix === 'teams_row'
    ) {
        return null
    }

    if (!/^team_[a-z0-9_]+$/i.test(suffix)) {
        return null
    }

    const rect = cluster.querySelector(':scope > rect')

    if (!rect) {
        return null
    }

    const shift = parseAccumulatedTranslate(cluster.getAttribute('transform'))
    const x = parseFloat(rect.getAttribute('x') ?? '0') + shift.x
    const y = parseFloat(rect.getAttribute('y') ?? '0') + shift.y
    const width = parseFloat(rect.getAttribute('width') ?? '0')
    const height = parseFloat(rect.getAttribute('height') ?? '0')

    if (width <= 0 || height <= 0) {
        return null
    }

    return { x, y, width, height }
}

function growBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    box: { x: number; y: number; width: number; height: number },
): [number, number, number, number] {
    return [
        Math.min(minX, box.x),
        Math.min(minY, box.y),
        Math.max(maxX, box.x + box.width),
        Math.max(maxY, box.y + box.height),
    ]
}

export function fitDiagramViewBox(svgRoot: Element): void {
    if (!(svgRoot instanceof SVGSVGElement)) {
        return
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of svgRoot.querySelectorAll<SVGGElement>('g.node')) {
        const box = nodeBounds(node)

        if (box.width === 0 && box.height === 0) {
            continue
        }

        ;[minX, minY, maxX, maxY] = growBounds(minX, minY, maxX, maxY, box)
    }

    for (const cluster of svgRoot.querySelectorAll<SVGGElement>('g.cluster')) {
        const box = outerTeamClusterRect(cluster)

        if (!box) {
            continue
        }

        ;[minX, minY, maxX, maxY] = growBounds(minX, minY, maxX, maxY, box)
    }

    for (const path of svgRoot.querySelectorAll<SVGPathElement>('.edgePaths path[data-edge="true"]')) {
        const d = path.getAttribute('d')

        if (!d) {
            continue
        }

        const box = path.getBBox()

        if (box.width === 0 && box.height === 0) {
            continue
        }

        ;[minX, minY, maxX, maxY] = growBounds(minX, minY, maxX, maxY, box)
    }

    if (!Number.isFinite(minX)) {
        return
    }

    const pad = 4
    const width = maxX - minX + pad * 2
    const height = maxY - minY + pad * 2
    const originX = minX - pad
    const originY = minY - pad

    svgRoot.setAttribute('viewBox', `${originX} ${originY} ${width} ${height}`)
    svgRoot.setAttribute('width', String(width))
    svgRoot.setAttribute('height', String(height))
    svgRoot.removeAttribute('preserveAspectRatio')
    svgRoot.style.width = ''
    svgRoot.style.height = ''
    svgRoot.style.maxWidth = 'none'
    svgRoot.style.display = 'block'
}

/**
 * Mermaid 11 ignores swimlane structure — lay out teams and kind layers from scratch.
 */
export function alignTeamRowLayout(svgRoot: Element, includedNodes: WebNode[], _includedEdges: WebEdge[]): void {
    if (!(svgRoot instanceof SVGSVGElement)) {
        return
    }

    resetMermaidRootTransforms(svgRoot)
    layoutTeamsFromScratch(svgRoot, includedNodes, _includedEdges)
    rerouteEdgesAfterShift(svgRoot, includedNodes)
    fitDiagramViewBox(svgRoot)
}
