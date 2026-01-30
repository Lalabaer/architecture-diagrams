import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const EXAMPLES_DIR = path.resolve('examples')

async function main() {
    // Delete examples folder if it exists
    await rm(EXAMPLES_DIR, { recursive: true, force: true })

    // Recreate empty examples folder
    await mkdir(EXAMPLES_DIR, { recursive: true })

    console.log(`Reset examples folder: ${EXAMPLES_DIR}`)
    console.log(`(Folder is empty by default)`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
