'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PermissionFlagsBits: P } = require('discord.js');

const FILE = path.resolve(process.env.WHITELIST_DATA_PATH || 'whitelist.json');
let store = { guilds: {} };
try { if (fs.existsSync(FILE)) store = { ...store, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
catch (error) { console.error('No se pudo leer whitelist.json:', error.message); }
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
function entry(guildId) {
  store.guilds[guildId] ||= { roles: [], members: [], channels: [] };
  const current = store.guilds[guildId];
  current.roles ||= []; current.members ||= []; current.channels ||= [];
  return current;
}
function isOwnerOrAdmin(member) {
  return Boolean(member?.guild && (member.id === member.guild.ownerId || member.permissions?.has(P.Administrator)));
}
function isImmuneMember(member) {
  if (!member?.guild) return false;
  if (isOwnerOrAdmin(member)) return true;
  const current = entry(member.guild.id);
  return current.members.includes(member.id) || member.roles.cache.some(role => current.roles.includes(role.id));
}
function isImmuneChannel(guild, channelId) {
  return Boolean(guild && entry(guild.id).channels.includes(channelId));
}
module.exports = { entry, save, isOwnerOrAdmin, isImmuneMember, isImmuneChannel };
