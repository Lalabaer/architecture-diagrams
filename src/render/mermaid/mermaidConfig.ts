/** Mermaid init options for the interactive diagram viewer (Mermaid 11, base theme). */
export const MERMAID_CONFIG = {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    theme: 'base' as const,
    themeVariables: {
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        fontSize: '13px',
        primaryColor: '#f8fafc',
        primaryTextColor: '#0f172a',
        primaryBorderColor: '#cbd5e1',
        lineColor: '#94a3b8',
        secondaryColor: '#f1f5f9',
        tertiaryColor: '#e2e8f0',
        background: '#ffffff',
        mainBkg: '#f8fafc',
        secondBkg: '#f1f5f9',
        clusterBkg: '#f8fafc',
        clusterBorder: '#e2e8f0',
        titleColor: '#334155',
        edgeLabelBackground: '#ffffff',
        nodeBorder: '#cbd5e1',
        defaultLinkColor: '#94a3b8',
    },
    flowchart: {
        htmlLabels: false,
        curve: 'basis' as const,
    },
}
