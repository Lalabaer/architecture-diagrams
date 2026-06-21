import type { WebNode } from '../shared/graph.js'

const TOOLTIP_ID = 'nodeTooltip'
const OFFSET_X = 14
const OFFSET_Y = 16

function nodeTitle(n: WebNode): string {
    return n.name?.trim() || n.id
}

function findNodeGroup(svgRoot: HTMLElement, uid: string): SVGGElement | null {
    const prefix = `flowchart-${uid}-`
    return svgRoot.querySelector(`g.node[id^="${CSS.escape(prefix)}"]`)
}

function ensureTooltipElement(): HTMLDivElement {
    let el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null

    if (!el) {
        el = document.createElement('div')
        el.id = TOOLTIP_ID
        el.className = 'nodeTooltip'
        el.setAttribute('role', 'tooltip')
        el.hidden = true
        document.body.appendChild(el)
    }

    return el
}

function appendMetaLine(
    tooltip: HTMLDivElement,
    text: string,
    tone?: 'critical' | 'warning' | 'muted',
): void {
    const line = document.createElement('div')
    line.className = 'nodeTooltip__meta'

    if (tone === 'critical') {
        line.classList.add('nodeTooltip__meta--critical')
    } else if (tone === 'warning') {
        line.classList.add('nodeTooltip__meta--warning')
    } else if (tone === 'muted') {
        line.classList.add('nodeTooltip__meta--muted')
    }

    line.textContent = text
    tooltip.appendChild(line)
}

function renderTooltipContent(tooltip: HTMLDivElement, n: WebNode): void {
    tooltip.replaceChildren()

    const title = document.createElement('div')
    title.className = 'nodeTooltip__title'
    title.textContent = nodeTitle(n)
    tooltip.appendChild(title)

    const description = n.description?.trim()

    if (description) {
        const desc = document.createElement('div')
        desc.className = 'nodeTooltip__desc'
        desc.textContent = description
        tooltip.appendChild(desc)
    }

    if (n.business_critical) {
        appendMetaLine(tooltip, 'Business critical', 'critical')
    } else {
        appendMetaLine(tooltip, 'Not business critical', 'muted')
    }

    if (n.in_production === true) {
        appendMetaLine(tooltip, 'In production')
    } else if (n.in_production === false) {
        appendMetaLine(tooltip, 'Not in production', 'muted')
    }

    if (n.deprecated === true) {
        appendMetaLine(tooltip, 'Deprecated / sunsetting', 'warning')
    }
}

function positionTooltip(tooltip: HTMLDivElement, clientX: number, clientY: number): void {
    tooltip.hidden = false
    tooltip.classList.add('nodeTooltip--visible')

    const margin = 8
    const rect = tooltip.getBoundingClientRect()
    let left = clientX + OFFSET_X
    let top = clientY + OFFSET_Y

    if (left + rect.width > window.innerWidth - margin) {
        left = clientX - rect.width - OFFSET_X
    }

    if (top + rect.height > window.innerHeight - margin) {
        top = clientY - rect.height - OFFSET_Y
    }

    tooltip.style.left = `${Math.max(margin, left)}px`
    tooltip.style.top = `${Math.max(margin, top)}px`
}

function hideTooltip(tooltip: HTMLDivElement): void {
    tooltip.hidden = true
    tooltip.classList.remove('nodeTooltip--visible')
}

export function attachNodeTooltips(svgRoot: HTMLElement, nodes: WebNode[]): void {
    const tooltip = ensureTooltipElement()

    for (const n of nodes) {
        const group = findNodeGroup(svgRoot, n.uid)

        if (!group) {
            continue
        }

        group.classList.add('node--hasTooltip')

        group.addEventListener('mouseenter', (e) => {
            renderTooltipContent(tooltip, n)
            positionTooltip(tooltip, e.clientX, e.clientY)
        })

        group.addEventListener('mousemove', (e) => {
            positionTooltip(tooltip, e.clientX, e.clientY)
        })

        group.addEventListener('mouseleave', () => {
            hideTooltip(tooltip)
        })
    }
}
