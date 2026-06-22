import { teamClusterId } from '../shared/buildMermaid.js'
import type { WebEdge, WebNode } from '../shared/graph.js'
import { buildLayoutEdgeIdMap, parseEdgeEndpoints } from '../shared/mermaidEdges.js'

const ROW_GAP_BELOW_TOP = 24
const MIN_TEAM_GAP = 48

interface Shift {
    dx: number
    dy: number
}

interface EdgeSnapshot {
    d: string
    transform: string | null
}

const ZERO_SHIFT: Shift = { dx: 0, dy: 0 }

function isTopRowTeam(teamNodes: WebNode[]): boolean {
    return teamNodes.length > 0 && teamNodes.every((n) => n.diagram_tier === 'top')
}

function rowTeamsFromNodes(nodes: WebNode[]): Map<string, WebNode[]> {
    const byTeam = new Map<string, WebNode[]>()

    for (const node of nodes) {
        const team = node.owner_team?.trim()

        if (!team) {
            continue
        }

        const list = byTeam.get(team) ?? []
        list.push(node)
        byTeam.set(team, list)
    }

    const rowTeams = new Map<string, WebNode[]>()

    for (const [team, teamNodes] of byTeam) {
        if (!isTopRowTeam(teamNodes)) {
            rowTeams.set(team, teamNodes)
        }
    }

    return rowTeams
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

function clusterTopY(cluster: SVGGElement): number | null {
    const rect = cluster.querySelector(':scope > rect')

    if (!rect) {
        return null
    }

    const y = rect.getAttribute('y')

    if (y !== null) {
        return parseFloat(y)
    }

    return (rect as SVGGraphicsElement).getBBox().y
}

function clusterBottomY(cluster: SVGGElement): number | null {
    const rect = cluster.querySelector(':scope > rect')

    if (!rect) {
        return null
    }

    const y = rect.getAttribute('y')
    const h = rect.getAttribute('height')

    if (y !== null && h !== null) {
        return parseFloat(y) + parseFloat(h)
    }

    const box = (rect as SVGGraphicsElement).getBBox()

    return box.y + box.height
}

function appendTranslate(element: SVGGraphicsElement, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) {
        return
    }

    const existing = element.getAttribute('transform')?.trim()
    const next = `translate(${dx}, ${dy})`

    element.setAttribute('transform', existing ? `${existing} ${next}` : next)
}

function findNodeGroup(svgRoot: SVGSVGElement, uid: string): SVGGElement | null {
    return svgRoot.querySelector(`g.node[id*="flowchart-${CSS.escape(uid)}-"]`)
}

function countPathPoints(d: string): number {
    const nums = d.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)

    return nums ? nums.length / 2 : 0
}

function adjustPathCoords(d: string, from: Shift, to: Shift): string {
    const pointCount = countPathPoints(d)

    if (pointCount === 0) {
        return d
    }

    if (from.dx === to.dx && from.dy === to.dy) {
        let numIdx = 0

        return d.replace(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g, (match) => {
            const val = parseFloat(match)
            const isY = numIdx % 2 === 1
            numIdx++

            return String(val + (isY ? from.dy : from.dx))
        })
    }

    let numIdx = 0
    let pairIdx = 0

    return d.replace(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g, (match) => {
        const val = parseFloat(match)
        const isY = numIdx % 2 === 1
        const t = pointCount <= 1 ? 0 : pairIdx / (pointCount - 1)
        numIdx++

        if (isY) {
            pairIdx++

            return String(val + from.dy + t * (to.dy - from.dy))
        }

        return String(val + from.dx + t * (to.dx - from.dx))
    })
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

function snapshotEdges(svg: SVGSVGElement): Map<string, EdgeSnapshot> {
    const snapshots = new Map<string, EdgeSnapshot>()

    for (const path of svg.querySelectorAll<SVGPathElement>('.edgePaths path[data-edge="true"]')) {
        const dataId = path.getAttribute('data-id') ?? ''

        snapshots.set(dataId, {
            d: path.getAttribute('d') ?? '',
            transform: path.getAttribute('transform'),
        })
    }

    return snapshots
}

function applyTeamShift(svg: SVGSVGElement, teamId: string, dx: number, dy: number, nodeUids: readonly string[]): void {
    if (dx === 0 && dy === 0) {
        return
    }

    for (const cluster of svg.querySelectorAll<SVGGElement>('g.cluster')) {
        if (clusterBelongsToTeam(cluster.id, teamId)) {
            appendTranslate(cluster, dx, dy)
        }
    }

    for (const uid of nodeUids) {
        const node = findNodeGroup(svg, uid)

        if (node) {
            appendTranslate(node, dx, dy)
        }
    }
}

function addTeamShift(teamShifts: Map<string, Shift>, team: string, dx: number, dy: number): void {
    const current = teamShifts.get(team) ?? ZERO_SHIFT

    teamShifts.set(team, {
        dx: current.dx + dx,
        dy: current.dy + dy,
    })
}

function shiftForTeam(teamShifts: Map<string, Shift>, team: string | undefined): Shift {
    if (!team) {
        return ZERO_SHIFT
    }

    return teamShifts.get(team) ?? ZERO_SHIFT
}

function restoreShiftedEdges(
    svg: SVGSVGElement,
    snapshots: Map<string, EdgeSnapshot>,
    includedNodes: WebNode[],
    includedEdges: WebEdge[],
    teamShifts: Map<string, Shift>,
): void {
    const knownUids = includedNodes.map((n) => n.uid)
    const layoutEdgeMap = buildLayoutEdgeIdMap(includedEdges, { allLayoutNeutral: true })
    const nodeTeam = new Map(includedNodes.map((n) => [n.uid, n.owner_team?.trim() ?? '']))
    const labelByDataId = new Map<string, SVGGElement>()

    for (const label of svg.querySelectorAll<SVGGElement>('.edgeLabels g.label[data-id]')) {
        labelByDataId.set(label.getAttribute('data-id') ?? '', label)
    }

    for (const path of svg.querySelectorAll<SVGPathElement>('.edgePaths path[data-edge="true"]')) {
        const dataId = path.getAttribute('data-id') ?? ''
        const snapshot = snapshots.get(dataId)

        if (!snapshot) {
            continue
        }

        const endpoints = parseEdgeEndpoints(path, knownUids, layoutEdgeMap)

        if (!endpoints) {
            path.setAttribute('d', snapshot.d)
            path.removeAttribute('transform')
            continue
        }

        const fromShift = shiftForTeam(teamShifts, nodeTeam.get(endpoints.from))
        const toShift = shiftForTeam(teamShifts, nodeTeam.get(endpoints.to))
        path.setAttribute('d', adjustPathCoords(snapshot.d, fromShift, toShift))
        path.removeAttribute('transform')

        const label = labelByDataId.get(dataId)

        if (label) {
            if (!labelHasText(label)) {
                label.setAttribute('visibility', 'hidden')
            } else {
                const mid = pathMidpoint(path.getAttribute('d') ?? '')

                if (mid) {
                    label.setAttribute('transform', `translate(${mid.x}, ${mid.y})`)
                    label.removeAttribute('visibility')
                }
            }
        }
    }
}

function reflowRowTeamsHorizontally(
    svg: SVGSVGElement,
    rowTeams: Map<string, WebNode[]>,
    teamShifts: Map<string, Shift>,
): void {
    const entries: { team: string; teamId: string; box: DOMRect; nodeUids: string[] }[] = []

    for (const [team, teamNodes] of rowTeams) {
        const cluster = findTeamCluster(svg, teamClusterId(team))

        if (!cluster) {
            continue
        }

        const rect = cluster.querySelector(':scope > rect')

        if (!rect) {
            continue
        }

        entries.push({
            team,
            teamId: teamClusterId(team),
            box: rect.getBoundingClientRect(),
            nodeUids: teamNodes.map((n) => n.uid),
        })
    }

    if (entries.length <= 1) {
        return
    }

    entries.sort((a, b) => a.box.left - b.box.left)

    let rightEdge = entries[0].box.right

    for (let i = 1; i < entries.length; i++) {
        const entry = entries[i]
        const minLeft = rightEdge + MIN_TEAM_GAP
        const dx = entry.box.left < minLeft ? minLeft - entry.box.left : 0

        if (dx > 0) {
            addTeamShift(teamShifts, entry.team, dx, 0)
            applyTeamShift(svg, entry.teamId, dx, 0, entry.nodeUids)
            entry.box = {
                ...entry.box,
                left: entry.box.left + dx,
                right: entry.box.right + dx,
            } as DOMRect
        }

        rightEdge = entry.box.right
    }
}

function fitSvgViewBox(svg: SVGSVGElement): void {
    const root = svg.querySelector<SVGGElement>('g.root') ?? svg
    const layers = ['.clusters', '.nodes', '.edgePaths']
        .map((sel) => root.querySelector<SVGGElement>(sel))
        .filter((el): el is SVGGElement => el !== null)

    if (layers.length === 0) {
        return
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const layer of layers) {
        const box = layer.getBBox()

        if (box.width === 0 && box.height === 0) {
            continue
        }

        minX = Math.min(minX, box.x)
        minY = Math.min(minY, box.y)
        maxX = Math.max(maxX, box.x + box.width)
        maxY = Math.max(maxY, box.y + box.height)
    }

    if (!Number.isFinite(minX)) {
        return
    }

    const pad = 20
    const width = maxX - minX + pad * 2
    const height = maxY - minY + pad * 2

    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${width} ${height}`)
    // Keep pixel size in sync with viewBox so filter changes do not shrink via stale width.
    svg.setAttribute('width', String(width))
    svg.removeAttribute('height')
    svg.style.maxWidth = 'none'
}

/**
 * Mermaid 11 renders nodes outside cluster groups, so dagre staggers team boxes vertically.
 * After render, align main-row teams and shift original Mermaid edge paths with them.
 */
export function alignTeamRowLayout(svgRoot: Element, includedNodes: WebNode[], includedEdges: WebEdge[]): void {
    if (!(svgRoot instanceof SVGSVGElement)) {
        return
    }

    const rowTeams = rowTeamsFromNodes(includedNodes)

    if (rowTeams.size <= 1) {
        return
    }

    const edgeSnapshots = snapshotEdges(svgRoot)
    const teamShifts = new Map<string, Shift>()
    const topClusters: SVGGElement[] = []
    const rowClusters: { team: string; top: number }[] = []

    for (const [team] of rowTeams) {
        const cluster = findTeamCluster(svgRoot, teamClusterId(team))

        if (!cluster) {
            continue
        }

        const top = clusterTopY(cluster)

        if (top === null) {
            continue
        }

        rowClusters.push({ team, top })
    }

    for (const node of includedNodes) {
        const team = node.owner_team?.trim()

        if (!team || rowTeams.has(team)) {
            continue
        }

        const teamNodes = includedNodes.filter((n) => n.owner_team?.trim() === team)

        if (!isTopRowTeam(teamNodes)) {
            continue
        }

        const cluster = findTeamCluster(svgRoot, teamClusterId(team))

        if (cluster && !topClusters.includes(cluster)) {
            topClusters.push(cluster)
        }
    }

    if (rowClusters.length <= 1) {
        return
    }

    let targetTop = Math.min(...rowClusters.map((entry) => entry.top))

    if (topClusters.length > 0) {
        const topBottom = Math.max(
            ...topClusters.map((cluster) => clusterBottomY(cluster)).filter((y): y is number => y !== null),
        )
        targetTop = Math.max(targetTop, topBottom + ROW_GAP_BELOW_TOP)
    }

    let adjusted = false

    for (const { team, top } of rowClusters) {
        const dy = targetTop - top

        if (dy !== 0) {
            adjusted = true
            addTeamShift(teamShifts, team, 0, dy)
            applyTeamShift(
                svgRoot,
                teamClusterId(team),
                0,
                dy,
                rowTeams.get(team)!.map((n) => n.uid),
            )
        }
    }

    reflowRowTeamsHorizontally(svgRoot, rowTeams, teamShifts)

    if (adjusted || teamShifts.size > 0) {
        restoreShiftedEdges(svgRoot, edgeSnapshots, includedNodes, includedEdges, teamShifts)
    }

    fitSvgViewBox(svgRoot)
}
