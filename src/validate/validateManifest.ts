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

async function getValidateFn(): Promise<NonNullable<typeof validateFn>> {
    if (!validateFn) {
        const moduleDir = path.dirname(fileURLToPath(import.meta.url))
        const schemaPath = path.resolve(moduleDir, '../../schemas/architecture-manifest-1.0.schema.json')
        const schema = await readJsonFile<any>(schemaPath)
        validateFn = ajv.compile(schema)
    }

    return validateFn
}

function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
    return (
        errors?.map((e: ErrorObject) => `${e.instancePath || '(root)'} ${e.message}`).join('\n') ??
        'Unknown validation error'
    )
}

export async function validateManifest(
    manifest: unknown,
): Promise<{ ok: true; manifest: Manifest } | { ok: false; error: string }> {
    const validate = await getValidateFn()
    const ok = validate(manifest)

    if (!ok) {
        return { ok: false, error: formatValidationErrors(validate.errors) }
    }

    return { ok: true, manifest: manifest as Manifest }
}

export async function validateManifestOrThrow(manifestPath: string, manifest: unknown): Promise<Manifest> {
    const result = await validateManifest(manifest)

    if (!result.ok) {
        throw new Error(`Schema validation failed for ${manifestPath}:\n${result.error}`)
    }

    return result.manifest
}
