import type { Manifest } from '../graph/types.js'
import { readJsonFile } from '../utils/fileUtils.js'
import { validateManifestOrThrow } from '../validate/validateManifest.js'

export async function loadAndValidateManifest(filePath: string): Promise<Manifest> {
    const raw = await readJsonFile<unknown>(filePath)
    return await validateManifestOrThrow(filePath, raw)
}
