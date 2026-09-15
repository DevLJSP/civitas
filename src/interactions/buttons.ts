// Button interaction registry (handlers live with their commands; this module
// documents the customId contract: civitas:<namespace>:<action>:<entityId>).
export const BUTTON_NAMESPACES = ['dash', 'apply', 'election', 'proposal', 'impeach', 'resign', 'tutorial'] as const;
