import { teamClusterId } from '../shared/buildMermaid.js'

const TEAM_FILTERABLE_CLASS = 'cluster--teamFilterable'
const TEAM_SELECTED_CLASS = 'cluster--teamSelected'

function matchesTeamCluster(renderedClusterId: string, expectedClusterId: string): boolean {
    return renderedClusterId === expectedClusterId || renderedClusterId.endsWith(`-${expectedClusterId}`)
}

function canonicalTeamClusterId(renderedClusterId: string, outerTeamClusterIds: Set<string>): string | null {
    for (const id of outerTeamClusterIds) {
        if (matchesTeamCluster(renderedClusterId, id)) {
            return id
        }
    }

    return null
}

function isOuterTeamCluster(clusterId: string, outerTeamClusterIds: Set<string>): boolean {
    return canonicalTeamClusterId(clusterId, outerTeamClusterIds) !== null
}

function updateTeamClusterSelection(svgRoot: Element, teams: string[], selectedTeams: string[]): void {
    const outerTeamClusterIds = new Set(teams.map(teamClusterId))
    const selectedIds = new Set(selectedTeams.map(teamClusterId))

    for (const cluster of svgRoot.querySelectorAll<SVGGElement>('g.cluster')) {
        const canonical = canonicalTeamClusterId(cluster.id, outerTeamClusterIds)
        cluster.classList.toggle(TEAM_SELECTED_CLASS, canonical ? selectedIds.has(canonical) : false)
    }
}

function findOuterTeamCluster(target: EventTarget | null, outerTeamClusterIds: Set<string>): SVGGElement | null {
    if (!(target instanceof Element)) {
        return null
    }

    let el: Element | null = target

    while (el) {
        if (
            el instanceof SVGGElement &&
            el.classList.contains('cluster') &&
            isOuterTeamCluster(el.id, outerTeamClusterIds)
        ) {
            return el
        }

        el = el.parentElement
    }

    return null
}

export function attachTeamClusterFilter(
    svgRoot: Element,
    teams: string[],
    selectedTeams: string[],
    onTeamSelect: (team: string) => void,
): () => void {
    const outerTeamClusterIds = new Set(teams.map(teamClusterId))
    const clusterById = new Map<string, string>()

    for (const team of teams) {
        clusterById.set(teamClusterId(team), team)
    }

    for (const cluster of svgRoot.querySelectorAll<SVGGElement>('g.cluster')) {
        if (isOuterTeamCluster(cluster.id, outerTeamClusterIds)) {
            cluster.classList.add(TEAM_FILTERABLE_CLASS)
        }
    }

    updateTeamClusterSelection(svgRoot, teams, selectedTeams)

    const onClick = (e: Event) => {
        const cluster = findOuterTeamCluster(e.target, outerTeamClusterIds)

        if (!cluster) {
            return
        }

        const canonical = canonicalTeamClusterId(cluster.id, outerTeamClusterIds)

        if (!canonical) {
            return
        }

        const team = clusterById.get(canonical)

        if (!team) {
            return
        }

        e.stopPropagation()
        onTeamSelect(team)
    }

    svgRoot.addEventListener('click', onClick)

    return () => {
        svgRoot.removeEventListener('click', onClick)

        for (const cluster of svgRoot.querySelectorAll<SVGGElement>('g.cluster')) {
            cluster.classList.remove(TEAM_FILTERABLE_CLASS, TEAM_SELECTED_CLASS)
        }
    }
}
