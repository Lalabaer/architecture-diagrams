import { buildMermaid } from '../shared/buildMermaid.js'
import { getTeams, type View, type WebGraph } from '../shared/graph.js'

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
    wrap.innerHTML = ''

    if (selected.length === 0) {
        const empty = document.createElement('span')
        empty.className = 'meta'
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

function currentView(): View {
    const select = qs<HTMLSelectElement>('#viewSelect')
    return select.value === 'technical' ? 'technical' : 'architecture'
}

function render() {
    const graph = window.__ARCH_GRAPH__

    if (!graph) {
        throw new Error('Missing window.__ARCH_GRAPH__')
    }

    const view = currentView()
    const selectedTeams = getSelectedTeams()

    const { mermaid, isEmpty } = buildMermaid(graph, { view, selectedTeams })

    const hint = qs<HTMLDivElement>('#emptyHint')
    const showHint = isEmpty
    hint.style.display = showHint ? 'block' : 'none'

    if (showHint) {
        hint.textContent = 'Nothing to display yet, please add your architectural insights to see this view.'
    }

    // update mermaid source
    const pre = qs<HTMLPreElement>('#mermaidSource')
    pre.textContent = mermaid

    if (isEmpty) {
        return
    }

    // render
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mermaidGlobal = (window as any).mermaid

    if (!mermaidGlobal) {
        throw new Error('Mermaid not loaded')
    }

    mermaidGlobal.initialize({ startOnLoad: false })

    // Re-render every time: clear previous SVG output
    const container = qs<HTMLDivElement>('#diagram')
    container.innerHTML = `<pre class="mermaid" id="mermaidSource"></pre>`
    const pre2 = qs<HTMLPreElement>('#mermaidSource')
    pre2.textContent = mermaid

    mermaidGlobal.run({ nodes: [pre2] }).catch((e: any) => console.error('Mermaid render error:', e))
}

function attachSearch() {
    const input = qs<HTMLInputElement>('#teamSearch')
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase()
        const rows = Array.from(document.querySelectorAll<HTMLLabelElement>('.teamRow'))
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
    attachSearch()

    // view switching
    const viewSel = qs<HTMLSelectElement>('#viewSelect')
    viewSel.addEventListener('change', () => {
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
    })

    const selected = getSelectedTeams()
    renderChips(selected)
    render()
}
