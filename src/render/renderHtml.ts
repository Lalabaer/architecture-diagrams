import { readFile } from 'fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { WebGraph } from '../shared/graph.js'

import { bundleBrowserApp } from './bundleBrowser.js'

export async function renderHtmlFromTemplate(payload: { graph: WebGraph }): Promise<string> {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url))
    const templatePath = path.resolve(moduleDir, '../../templates/index.html')
    const tpl = await readFile(templatePath, 'utf-8')

    const browserBundle = await bundleBrowserApp()

    const escapeForJsString = (value: string): string =>
        value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')

    // JSON is injected into a JS string literal in the template.
    const graphJsonLiteral = JSON.stringify(payload.graph)
    const graphJsonEscaped = escapeForJsString(graphJsonLiteral)

    return tpl.replace('%%__ARCH_GRAPH_JSON__%%', graphJsonEscaped).replace('/*%%__BROWSER_BUNDLE__%%*/', browserBundle)
}
