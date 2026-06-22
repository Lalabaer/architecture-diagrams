import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.join(ROOT, 'docs')
const CHROME =
    process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : (process.env.CHROME_PATH ?? 'google-chrome')

const SCREENSHOT_STYLE = `
  body { overflow: visible !important; padding-bottom: 24px; }
  .panel { height: auto !important; min-height: 0 !important; overflow: visible !important; }
  .diagramWrap { height: auto !important; min-height: 0 !important; overflow: visible !important; }
  .diagramScroll { overflow: visible !important; }
  .teamList { max-height: 220px; }
  .diagramZoom { display: none !important; }
`

function prepareHtml(inputDir) {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'arch-doc-screenshot-'))
    const html = readFileSync(path.join(inputDir, 'index.html'), 'utf8')

    writeFileSync(path.join(tmpDir, 'index.html'), html)
    copyFileSync(path.join(inputDir, 'app.css'), path.join(tmpDir, 'app.css'))

    return path.join(tmpDir, 'index.html')
}

async function capture({ inputDir, output, width }) {
    const htmlPath = prepareHtml(inputDir)
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: CHROME,
    })

    try {
        const page = await browser.newPage()
        await page.setViewport({ width, height: 900 })
        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' })
        await page.waitForSelector('#diagram svg', { timeout: 60_000 })
        await page.addStyleTag({ content: SCREENSHOT_STYLE })
        await new Promise((resolve) => setTimeout(resolve, 2500))

        const clip = await page.evaluate(() => {
            const layout = document.querySelector('.layout')

            if (!layout) {
                return null
            }

            const layoutBox = layout.getBoundingClientRect()

            return {
                x: 0,
                y: 0,
                width: Math.ceil(document.body.scrollWidth),
                height: Math.ceil(layoutBox.bottom + 24),
            }
        })

        if (!clip || clip.width <= 0 || clip.height <= 0) {
            throw new Error(`Could not measure screenshot bounds for ${inputDir}`)
        }

        await page.setViewport({
            width: Math.min(clip.width, 16_000),
            height: Math.min(clip.height, 16_000),
        })
        await page.screenshot({ path: output, clip })
        console.log(`Wrote ${output} (${clip.width}x${clip.height})`)
    } finally {
        await browser.close()
    }
}

await capture({
    inputDir: path.join(ROOT, 'dist/screenshots/basic'),
    output: path.join(DOCS, 'architecture-diagrams-basic-example.png'),
    width: 2017,
})

await capture({
    inputDir: path.join(ROOT, 'dist/screenshots/url-shortener'),
    output: path.join(DOCS, 'architecture-diagrams-url-shortener-example.png'),
    width: 1600,
})
