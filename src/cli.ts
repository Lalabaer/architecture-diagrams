import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'path'

import { toWebGraph } from './adapters/toWebGraph.js'
import { buildGraph } from './graph/buildGraph.js'
import { discoverManifests } from './ingest/discoverManifests.js'
import { loadAndValidateManifest } from './ingest/loadManifest.js'
import { writeOutputs } from './output/writeFiles.js'
import { renderMermaid } from './render/mermaid/renderMermaid.js'
import { renderHtmlFromTemplate } from './render/renderHtml.js'
import { runNodeScript } from './utils/runNodeScript.js'

function isMermaidEmpty(diagram: string): boolean {
    return diagram.trim() === 'flowchart LR'
}

export async function runCli(argv: string[]): Promise<void> {
    const program = new Command()

    program
        .name('architecture-diagrams')
        .description('Generate Mermaid-based architecture diagrams from architecture manifests.')
        .option('-i, --input <path>', 'Input directory to scan for manifests', '.')
        .option('-o, --output <path>', 'Output directory', 'dist/output')
        .option('--fail-on-empty-architecture', 'Exit with non-zero code if architecture view is empty', false)

    const examples = program.command('examples').description('Generate/reset example manifests.')

    examples
        .command('reset')
        .description('Reset ./examples to an empty folder.')
        .action(async () => {
            await runNodeScript('scripts/reset-examples.mjs')
        })

    examples
        .command('basic')
        .description('Generate basic examples into ./examples/basic (overwrites that folder).')
        .action(async () => {
            await runNodeScript('scripts/generate-basic-examples.mjs')
        })

    examples
        .command('url-shortener')
        .description('Generate URL shortener examples into ./examples/url-shortener (overwrites that folder).')
        .action(async () => {
            await runNodeScript('scripts/generate-url-shortener-examples.mjs')
        })

    program.action(async () => {
        const opts = program.opts<{ input: string; output: string; failOnEmptyArchitecture: boolean }>()

        const inputDir = path.resolve(opts.input)
        const outDir = path.resolve(opts.output)

        const files = await discoverManifests(inputDir)

        if (files.length === 0) {
            throw new Error(`No architecture.json files found under: ${inputDir}`)
        }

        const manifests: any[] = []

        for (const f of files) {
            manifests.push(await loadAndValidateManifest(f))
        }

        const internalGraph = buildGraph(manifests)
        const webGraph = toWebGraph(internalGraph)

        const architectureMmd = renderMermaid(webGraph, { view: 'architecture' })
        const technicalMmd = renderMermaid(webGraph, { view: 'technical' })

        const archIsEmpty = isMermaidEmpty(architectureMmd)

        if (opts.failOnEmptyArchitecture && archIsEmpty) {
            throw new Error('Architecture view is empty (no systems/datastores).')
        }

        const html = await renderHtmlFromTemplate({ graph: webGraph })
        const moduleDir = path.dirname(fileURLToPath(import.meta.url))
        const cssPath = path.resolve(moduleDir, '../templates/app.css')
        const css = await readFile(cssPath, 'utf-8')

        await writeOutputs(outDir, { architectureMmd, technicalMmd, html, css })

        console.log(`Generated:
- ${path.join(outDir, 'index.html')}
- ${path.join(outDir, 'architecture.mmd')}
- ${path.join(outDir, 'technical.mmd')}
`)
        console.log(`Manifests: ${files.length}`)
    })

    await program.parseAsync(argv)
}
