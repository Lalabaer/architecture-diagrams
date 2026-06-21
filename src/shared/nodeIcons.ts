import type { Kind, WebNode } from './graph.js'

function haystack(n: WebNode): string {
    return `${n.id} ${n.name ?? ''}`.toLowerCase()
}

/** Redis / ElastiCache Redis — compact inline SVG (no external assets). */
const REDIS_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' aria-hidden='true' style='vertical-align:middle;margin-right:5px;display:inline'><path fill='#DC382D' d='M4 5c0-1.1 4-2.5 8-2.5S20 3.9 20 5v3c0 1.1-4 2.5-8 2.5S4 9.1 4 8V5zm0 5.5c0 1.1 4 2.5 8 2.5s8-1.4 8-2.5V13c0 1.1-4 2.5-8 2.5S4 14.1 4 13v-2.5zm0 6c0 1.1 4 2.5 8 2.5s8-1.4 8-2.5V19c0 1.1-4 2.5-8 2.5S4 20.1 4 19v-2.5z'/></svg>"

/** Generic database / data store — cylinder stack icon. */
const DATABASE_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' aria-hidden='true' style='vertical-align:middle;margin-right:5px;display:inline'><ellipse cx='12' cy='5' rx='7' ry='2.5' fill='#64748b'/><path d='M5 5v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5' fill='none' stroke='#475569' stroke-width='1'/><path d='M5 9v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V9' fill='none' stroke='#475569' stroke-width='1'/><path d='M5 13v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V13' fill='none' stroke='#475569' stroke-width='1'/></svg>"

function looksLikeRedis(h: string): boolean {
    if (/\bredis\b/.test(h)) {
        return true
    }
    if (h.includes('elasticache') && h.includes('redis')) {
        return true
    }
    return false
}

function looksLikeDatabaseSystem(h: string): boolean {
    return /(mysql|postgres|postgre|mongo|aurora|dynamo|snowflake|elasticsearch|memcached|sqlite|mssql|sql ?server|cassandra|clickhouse|bigquery|planetscale)/i.test(
        h,
    )
}

/**
 * HTML prefix for Mermaid node labels (requires htmlLabels + loose security in the viewer).
 */
export function nodeIconPrefix(n: WebNode): string {
    const h = haystack(n)

    if (looksLikeRedis(h)) {
        return REDIS_SVG
    }

    if (n.kind === 'datastore') {
        return DATABASE_SVG
    }

    if (n.kind === 'system' && looksLikeDatabaseSystem(h)) {
        return DATABASE_SVG
    }

    return ''
}

export function kindLabel(kind: Kind): string {
    switch (kind) {
        case 'system':
            return 'Systems'
        case 'datastore':
            return 'Datastores'
        case 'library':
            return 'Libraries'
        case 'tool':
            return 'Tools'
    }
}
