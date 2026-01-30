import type { ErrorObject } from 'ajv'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Manifest } from '../graph/types.js'
import { readJsonFile } from '../utils/fileUtils.js'

const require = createRequire(import.meta.url)
const Ajv = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js').default
const ajv = new Ajv({ allErrors: true, strict: false })

let validateFn: ReturnType<typeof ajv.compile> | null = null

export async function validateManifestOrThrow(manifestPath: string, manifest: unknown): Promise<Manifest> {
    if (!validateFn) {
        const moduleDir = path.dirname(fileURLToPath(import.meta.url))
        const schemaPath = path.resolve(moduleDir, '../../schemas/architecture-manifest-1.0.schema.json')
        const schema = await readJsonFile<any>(schemaPath)
        validateFn = ajv.compile(schema)
    }

    const ok = validateFn(manifest)

    if (!ok) {
        const errors = validateFn.errors
            ?.map((e: ErrorObject) => `${e.instancePath || '(root)'} ${e.message}`)
            .join('\n')
        throw new Error(`Schema validation failed for ${manifestPath}:\n${errors}`)
    }

    return manifest as Manifest
}
