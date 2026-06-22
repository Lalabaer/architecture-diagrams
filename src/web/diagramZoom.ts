const ZOOM_STORAGE_KEY = 'architecture-diagrams.diagramZoom'

/** Discrete zoom steps: 3× out, 100%, 3× in */
export const ZOOM_LEVELS = [0.5, 0.65, 0.8, 1, 1.2, 1.4, 1.6] as const

const DEFAULT_ZOOM_INDEX = ZOOM_LEVELS.indexOf(1)

let zoomIndex = DEFAULT_ZOOM_INDEX
let baseSize: { width: number; height: number } | null = null

function qs<T extends HTMLElement>(sel: string): T | null {
    return document.querySelector(sel)
}

function persistZoom(): void {
    try {
        localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomIndex))
    } catch {
        /* ignore */
    }
}

function restoreZoom(): void {
    try {
        const raw = localStorage.getItem(ZOOM_STORAGE_KEY)

        if (raw === null) {
            return
        }

        const index = Number.parseInt(raw, 10)

        if (Number.isFinite(index) && index >= 0 && index < ZOOM_LEVELS.length) {
            zoomIndex = index
        }
    } catch {
        /* ignore */
    }
}

function updateZoomControls(): void {
    const zoomIn = qs<HTMLButtonElement>('#zoomIn')
    const zoomOut = qs<HTMLButtonElement>('#zoomOut')
    const label = qs<HTMLSpanElement>('#zoomLevelLabel')

    if (zoomIn) {
        zoomIn.disabled = zoomIndex >= ZOOM_LEVELS.length - 1
    }

    if (zoomOut) {
        zoomOut.disabled = zoomIndex <= 0
    }

    if (label) {
        label.textContent = `${Math.round(ZOOM_LEVELS[zoomIndex] * 100)}%`
    }
}

function measureBaseSize(stage: HTMLElement, diagram: HTMLElement): { width: number; height: number } | null {
    const svg = diagram.querySelector('svg')

    if (!svg) {
        return null
    }

    stage.style.transform = 'none'

    const rect = svg.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) {
        return null
    }

    return { width: rect.width, height: rect.height }
}

export function applyDiagramZoom(remeasure = false): void {
    const stage = qs<HTMLElement>('#diagramStage')
    const sizer = qs<HTMLElement>('#diagramSizer')
    const diagram = qs<HTMLElement>('#diagram')

    if (!stage || !sizer || !diagram) {
        return
    }

    const svg = diagram.querySelector('svg')

    if (!svg) {
        baseSize = null
        stage.style.transform = ''
        stage.style.width = ''
        stage.style.height = ''
        sizer.style.width = ''
        sizer.style.height = ''
        updateZoomControls()
        return
    }

    if (remeasure || !baseSize) {
        baseSize = measureBaseSize(stage, diagram)
    }

    if (!baseSize) {
        return
    }

    const level = ZOOM_LEVELS[zoomIndex]

    stage.style.width = `${baseSize.width}px`
    stage.style.height = `${baseSize.height}px`
    stage.style.transformOrigin = '0 0'
    stage.style.transform = `scale(${level})`

    sizer.style.width = `${baseSize.width * level}px`
    sizer.style.height = `${baseSize.height * level}px`

    updateZoomControls()
}

function zoomBy(delta: number): void {
    const nextIndex = zoomIndex + delta

    if (nextIndex < 0 || nextIndex >= ZOOM_LEVELS.length) {
        return
    }

    const scroll = qs<HTMLElement>('#diagramScroll')

    if (!scroll) {
        zoomIndex = nextIndex
        applyDiagramZoom()
        persistZoom()
        return
    }

    const oldLevel = ZOOM_LEVELS[zoomIndex]
    const centerX = scroll.scrollLeft + scroll.clientWidth / 2
    const centerY = scroll.scrollTop + scroll.clientHeight / 2

    zoomIndex = nextIndex
    applyDiagramZoom()

    const newLevel = ZOOM_LEVELS[zoomIndex]
    const ratio = newLevel / oldLevel

    scroll.scrollLeft = Math.max(0, centerX * ratio - scroll.clientWidth / 2)
    scroll.scrollTop = Math.max(0, centerY * ratio - scroll.clientHeight / 2)

    persistZoom()
}

export function resetDiagramZoomMeasurement(): void {
    baseSize = null
}

export function attachDiagramZoom(): void {
    restoreZoom()
    updateZoomControls()

    const zoomIn = qs<HTMLButtonElement>('#zoomIn')
    const zoomOut = qs<HTMLButtonElement>('#zoomOut')

    zoomIn?.addEventListener('click', () => zoomBy(1))
    zoomOut?.addEventListener('click', () => zoomBy(-1))
}
