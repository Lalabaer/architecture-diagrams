import { MERMAID_CONFIG } from '../render/mermaid/mermaidConfig.js'
import { buildMermaid, type DiagramLayout } from '../shared/buildMermaid.js'
import { getTeams, type Kind, KINDS_BY_VIEW, type View, type WebGraph } from '../shared/graph.js'
import { kindLabel } from '../shared/nodeIcons.js'

declare global {
    interface Window {
        __ARCH_GRAPH__?: WebGraph
    }
}

function qs<T extends HTMLElement>(sel: string): T {
    const el = document.querySelector(sel)

    if (!el) {
        throw new Error(`Missing element: ${sel}`)
    }

    return el as T
}

function uniq(arr: string[]) {
    return [...new Set(arr)]
}

function renderTeamControls(allTeams: string[]) {
    const list = qs<HTMLDivElement>('#teamList')
    list.innerHTML = ''

    for (const team of allTeams) {
        const id = `team_${team.replace(/[^a-zA-Z0-9_-]/g, '_')}`

        const row = document.createElement('label')
        row.className = 'teamRow'
        row.htmlFor = id

        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.id = id
        cb.value = team
        cb.className = 'teamCb'

        const text = document.createElement('span')
        text.textContent = team

        row.appendChild(cb)
        row.appendChild(text)
        list.appendChild(row)
    }
}

function getSelectedTeams(): string[] {
    const cbs = Array.from(document.querySelectorAll<HTMLInputElement>('.teamCb'))
    return uniq(cbs.filter((c) => c.checked).map((c) => c.value))
}

function setSelectedTeams(next: string[]) {
    const set = new Set(next)
    const cbs = Array.from(document.querySelectorAll<HTMLInputElement>('.teamCb'))

    for (const cb of cbs) {
        cb.checked = set.has(cb.value)
    }
}

function renderChips(selected: string[]) {
    const wrap = qs<HTMLDivElement>('#selectedTeams')
    wrap.replaceChildren()
    wrap.classList.toggle('chips--empty', selected.length === 0)

    if (selected.length === 0) {
        const empty = document.createElement('span')
        empty.className = 'meta chipPlaceholder'
        empty.textContent = 'No team filter (showing all)'
        wrap.appendChild(empty)

        return
    }

    for (const t of selected) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'chip'
        chip.textContent = t

        const x = document.createElement('span')
        x.className = 'chipX'
        x.textContent = '×'
        chip.appendChild(x)

        chip.addEventListener('click', () => {
            const next = selected.filter((s) => s !== t)
            setSelectedTeams(next)
            renderChips(next)
            render()
        })

        wrap.appendChild(chip)
    }
}

const LAYOUT_STORAGE_KEY = 'architecture-diagrams.diagramLayout'

function kindFilterStorageKey(view: View): string {
    return `architecture-diagrams.kindFilter.${view}`
}

function loadKindOverride(view: View, kind: Kind): boolean | undefined {
    if (kind === 'system') {
        return true
    }

    try {
        const raw = localStorage.getItem(kindFilterStorageKey(view))

        if (!raw) {
            return undefined
        }

        const o = JSON.parse(raw) as Partial<Record<Kind, boolean>>

        return o[kind]
    } catch {
        return undefined
    }
}

function persistKindFilter(view: View) {
    const kinds = KINDS_BY_VIEW[view]
    const payload: Partial<Record<Kind, boolean>> = {}

    for (const k of kinds) {
        if (k === 'system') {
            continue
        }

        const cb = document.getElementById(`kind_cb_${k}`) as HTMLInputElement | null

        if (cb) {
            payload[k] = cb.checked
        }
    }

    try {
        localStorage.setItem(kindFilterStorageKey(view), JSON.stringify(payload))
    } catch {
        /* ignore */
    }
}

function renderKindFilters(view: View) {
    const list = qs<HTMLDivElement>('#kindFilterList')
    list.innerHTML = ''

    for (const kind of KINDS_BY_VIEW[view]) {
        const id = `kind_cb_${kind}`
        const row = document.createElement('label')
        row.className = 'teamRow'
        row.htmlFor = id

        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.id = id
        cb.value = kind
        cb.className = 'kindCb'

        if (kind === 'system') {
            cb.disabled = true
            cb.checked = true
        } else {
            const override = loadKindOverride(view, kind)
            cb.checked = override !== false
        }

        const text = document.createElement('span')
        text.textContent = kindLabel(kind)

        row.appendChild(cb)
        row.appendChild(text)
        list.appendChild(row)
    }
}

function getVisibleKinds(view: View): Set<Kind> {
    const out = new Set<Kind>()

    for (const k of KINDS_BY_VIEW[view]) {
        if (k === 'system') {
            out.add('system')
            continue
        }

        const cb = document.getElementById(`kind_cb_${k}`) as HTMLInputElement | null

        if (cb?.checked) {
            out.add(k)
        }
    }

    return out
}

function currentLayout(): DiagramLayout {
    const select = qs<HTMLSelectElement>('#layoutSelect')
    return select.value === 'lr' ? 'lr' : 'tb'
}

function restoreLayoutFromStorage() {
    const select = qs<HTMLSelectElement>('#layoutSelect')
    try {
        const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
        if (raw === 'tb' || raw === 'lr') {
            select.value = raw
        }
    } catch {
        /* ignore */
    }
}

function persistLayout() {
    try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, currentLayout())
    } catch {
        /* ignore */
    }
}

function currentView(): View {
    const select = qs<HTMLSelectElement>('#viewSelect')
    return select.value === 'technical' ? 'technical' : 'architecture'
}

let mermaidReady = false
let renderGeneration = 0

function initMermaid() {
    if (mermaidReady) {
        return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mermaidGlobal = (window as any).mermaid

    if (!mermaidGlobal) {
        throw new Error('Mermaid not loaded')
    }

    mermaidGlobal.initialize(MERMAID_CONFIG)
    mermaidReady = true
}

async function render() {
    const graph = window.__ARCH_GRAPH__

    if (!graph) {
        throw new Error('Missing window.__ARCH_GRAPH__')
    }

    initMermaid()

    const view = currentView()
    const selectedTeams = getSelectedTeams()
    const diagramLayout = currentLayout()

    const visibleKinds = getVisibleKinds(view)
    const { mermaid, isEmpty } = buildMermaid(graph, {
        view,
        selectedTeams,
        diagramLayout,
        visibleKinds,
    })

    const hint = qs<HTMLDivElement>('#emptyHint')
    const showHint = isEmpty
    hint.style.display = showHint ? 'block' : 'none'

    if (showHint) {
        hint.textContent = 'Nothing to display yet, please add your architectural insights to see this view.'
    }

    const container = qs<HTMLDivElement>('#diagram')
    const diagramWrap = qs<HTMLDivElement>('.diagramWrap')
    const scrollLeft = diagramWrap.scrollLeft
    const scrollTop = diagramWrap.scrollTop
    const generation = ++renderGeneration

    if (isEmpty) {
        container.replaceChildren()
        return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mermaidGlobal = (window as any).mermaid
    const renderId = `arch-diagram-${generation}`

    try {
        const { svg, bindFunctions } = await mermaidGlobal.render(renderId, mermaid)

        if (generation !== renderGeneration) {
            return
        }

        container.innerHTML = svg
        bindFunctions?.(container)
        diagramWrap.scrollLeft = Math.min(scrollLeft, Math.max(0, diagramWrap.scrollWidth - diagramWrap.clientWidth))
        diagramWrap.scrollTop = Math.min(scrollTop, Math.max(0, diagramWrap.scrollHeight - diagramWrap.clientHeight))
    } catch (e: unknown) {
        if (generation === renderGeneration) {
            console.error('Mermaid render error:', e)
        }
    }
}

function attachSearch() {
    const input = qs<HTMLInputElement>('#teamSearch')
    const teamList = qs<HTMLDivElement>('#teamList')
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase()
        const rows = Array.from(teamList.querySelectorAll<HTMLLabelElement>('.teamRow'))
        for (const r of rows) {
            const text = (r.textContent ?? '').toLowerCase()
            r.style.display = text.includes(q) ? 'flex' : 'none'
        }
    })

    const clearBtn = qs<HTMLButtonElement>('#clearTeams')
    clearBtn.addEventListener('click', () => {
        setSelectedTeams([])
        renderChips([])
        render()
    })
}

export function boot() {
    const graph = window.__ARCH_GRAPH__

    if (!graph) {
        throw new Error('Missing window.__ARCH_GRAPH__')
    }

    const teams = getTeams(graph)
    renderTeamControls(teams)
    renderKindFilters(currentView())
    restoreLayoutFromStorage()
    attachSearch()

    // view switching
    const viewSel = qs<HTMLSelectElement>('#viewSelect')
    viewSel.addEventListener('change', () => {
        renderKindFilters(currentView())
        render()
    })

    const layoutSel = qs<HTMLSelectElement>('#layoutSelect')
    layoutSel.addEventListener('change', () => {
        persistLayout()
        render()
    })

    // checkbox changes
    document.addEventListener('change', (e) => {
        const t = e.target as HTMLElement | null

        if (t && (t as HTMLInputElement).classList?.contains('teamCb')) {
            const selected = getSelectedTeams()
            renderChips(selected)
            render()
        }

        if (t && (t as HTMLInputElement).classList?.contains('kindCb')) {
            persistKindFilter(currentView())
            render()
        }
    })

    const selected = getSelectedTeams()
    renderChips(selected)
    render()
}
