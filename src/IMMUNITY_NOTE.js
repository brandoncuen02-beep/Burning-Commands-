function isImmuneTarget(guild, member) {
  return Boolean(member && (member.id === guild.ownerId || member.permissions?.has(P.Administrator)));
}
