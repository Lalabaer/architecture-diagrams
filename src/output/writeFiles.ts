import path from 'node:path'

import { writeTextFile } from '../utils/fileUtils.js'

export async function writeOutputs(
    outDir: string,
    payload: {
        architectureMmd: string
        technicalMmd: string
        html: string
        css: string
    },
): Promise<void> {
    await writeTextFile(path.join(outDir, 'architecture.mmd'), payload.architectureMmd)
    await writeTextFile(path.join(outDir, 'technical.mmd'), payload.technicalMmd)
    await writeTextFile(path.join(outDir, 'index.html'), payload.html)
    await writeTextFile(path.join(outDir, 'app.css'), payload.css)
}
