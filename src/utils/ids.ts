export function parseCustomId(customId: string): { namespace: string; action: string; parts: string[] } {
  const segs = customId.split(':');
  if (segs.length < 3 || segs[0] !== 'civitas') throw new Error('Invalid interaction id');
  const [, namespace, action, ...parts] = segs;
  return { namespace: namespace ?? '', action: action ?? '', parts };
}

export function buildCustomId(namespace: string, action: string, ...parts: string[]): string {
  const clean = [namespace, action, ...parts].map((s) => s.replace(/:/g, '_')).join(':');
  const id = `civitas:${clean}`;
  // Discord custom IDs have a 100 char limit.
  if (id.length > 100) throw new Error('Interaction id too long');
  return id;
}

export function mustGuildId(guildId: string | null): string {
  if (!guildId) throw new Error('This command can only be used in a server.');
  return guildId;
}
