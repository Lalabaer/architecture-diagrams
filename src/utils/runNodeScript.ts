import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'

export async function runNodeScript(scriptRelPath: string): Promise<void> {
    const scriptAbsPath = path.resolve(scriptRelPath)
    const child = spawn(process.execPath, [scriptAbsPath], {
        stdio: 'inherit',
        shell: false,
    })

    const [code] = await once(child, 'exit')

    if (code !== 0) {
        throw new Error(`Script failed: ${scriptRelPath} (exit code ${code})`)
    }
}
