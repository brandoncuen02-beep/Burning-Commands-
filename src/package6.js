'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits: P, REST, Routes } = require('discord.js');

const STORE = path.resolve(process.env.PACKAGE6_DATA_PATH || 'package6.json');
const BACKUP_EVERY_MS = 3 * 60 * 60 * 1000;
let state = { backups: {} };
try { if (fs.existsSync(STORE)) state = { ...state, ...JSON.parse(fs.readFileSync(STORE, 'utf8')) }; } catch (error) { console.error('No se pudo leer package6.json:', error.message); }
function save() { fs.mkdirSync(path.dirname(STORE), { recursive: true }); const tmp = `${STORE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(tmp, STORE); }
const embed = (title, description, color = 0x5865F2) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
const row = component => [new ActionRowBuilder().addComponents(component)];
const commands = [{ name: 'copia-seguridad', description: 'Crea una copia de roles, canales y categorías.', default_member_permissions: P.ManageGuild.toString() }];

function snapshotGuild(guild, requestedBy) {
  const roles = guild.roles.cache.filter(role => role.id !== guild.id && !role.managed).map(role => ({ id: role.id, name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions.bitfield.toString(), position: role.position }));
  const channels = guild.channels.cache.filter(channel => [ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)).map(channel => ({
    id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId || null, position: channel.rawPosition,
    topic: channel.topic || null, nsfw: Boolean(channel.nsfw), rateLimitPerUser: channel.rateLimitPerUser || 0,
    bitrate: channel.bitrate || null, userLimit: channel.userLimit || 0,
    overwrites: channel.permissionOverwrites.cache.map(overwrite => ({ id: overwrite.id, type: overwrite.type, allow: overwrite.allow.bitfield.toString(), deny: overwrite.deny.bitfield.toString() }))
  }));
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, guildId: guild.id, guildName: guild.name, requestedBy, createdAt: Date.now(), roles, channels };
}

async function createBackup(client, guildId) {
  const config = state.backups[guildId]; if (!config) return;
  const guild = client.guilds.cache.get(guildId); if (!guild) return;
  const backup = snapshotGuild(guild, config.requestedBy);
  config.latest = backup; config.lastCreatedAt = backup.createdAt; save();
  const recipient = await client.users.fetch(config.requestedBy).catch(() => null);
  if (!recipient) return;
  const button = new ButtonBuilder().setCustomId(`backup:restore:${guildId}:${backup.id}:${config.requestedBy}`).setLabel('Restaurar').setEmoji('✅').setStyle(ButtonStyle.Danger);
  await recipient.send({ embeds: [embed('Copia guardada', `**${guild.name}**
Roles: ${backup.roles.length}
Canales/categorías: ${backup.channels.length}
Fecha: <t:${Math.floor(backup.createdAt / 1000)}:F>`)], components: row(button) }).catch(() => {});
}

async function beginBackup(client, guild, channel, user) {
  if (!guild || !channel?.isTextBased()) throw new Error('Este comando solo funciona en un canal del servidor.');
  if (!guild.members.me.permissions.has(P.ManageChannels) || !guild.members.me.permissions.has(P.ManageRoles)) throw new Error('El bot necesita Gestionar canales y Gestionar roles.');
  state.backups[guild.id] = { requestedBy: user.id, channelId: channel.id, latest: null, lastCreatedAt: 0 };
  await createBackup(client, guild.id);
}

async function restoreSnapshot(guild, backup) {
  if (!guild.members.me.permissions.has(P.ManageChannels) || !guild.members.me.permissions.has(P.ManageRoles)) throw new Error('El bot necesita Gestionar canales y Gestionar roles.');
  const roleMap = new Map([[guild.id, guild.id]]);
  for (const saved of backup.roles) {
    let role = guild.roles.cache.get(saved.id) || guild.roles.cache.find(item => item.name === saved.name);
    if (!role) role = await guild.roles.create({ name: saved.name, color: saved.color, hoist: saved.hoist, mentionable: saved.mentionable, permissions: BigInt(saved.permissions), reason: 'Restauración de copia de seguridad' }).catch(() => null);
    if (role) { roleMap.set(saved.id, role.id); await role.edit({ name: saved.name, color: saved.color, hoist: saved.hoist, mentionable: saved.mentionable, permissions: BigInt(saved.permissions) }, 'Restauración de copia').catch(() => {}); }
  }

  const savedIds = new Set(backup.channels.map(channel => channel.id));
  for (const channel of [...guild.channels.cache.values()]) {
    if ([ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type) && !savedIds.has(channel.id)) {
      await channel.delete('Eliminado durante restauración de copia').catch(() => {});
    }
  }

  const channelMap = new Map();
  const ordered = [...backup.channels].sort((a, b) => (a.type === ChannelType.GuildCategory ? -1 : b.type === ChannelType.GuildCategory ? 1 : 0) || a.position - b.position);
  for (const saved of ordered) {
    let channel = guild.channels.cache.get(saved.id) || guild.channels.cache.find(item => item.name === saved.name && item.type === saved.type);
    const overwrites = saved.overwrites.map(overwrite => ({ id: overwrite.type === 0 ? (roleMap.get(overwrite.id) || overwrite.id) : overwrite.id, type: overwrite.type, allow: BigInt(overwrite.allow), deny: BigInt(overwrite.deny) })).filter(overwrite => overwrite.type !== 0 || overwrite.id === guild.id || guild.roles.cache.has(overwrite.id));
    const parent = saved.parentId ? (channelMap.get(saved.parentId) || saved.parentId) : null;
    const options = { name: saved.name, type: saved.type, position: saved.position, permissionOverwrites: overwrites, ...(parent ? { parent } : {}) };
    if ([ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(saved.type)) Object.assign(options, { topic: saved.topic, nsfw: saved.nsfw, rateLimitPerUser: saved.rateLimitPerUser });
    if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(saved.type)) Object.assign(options, { bitrate: saved.bitrate || undefined, userLimit: saved.userLimit });
    if (!channel) channel = await guild.channels.create(options).catch(() => null);
    else await channel.edit(options).catch(() => {});
    if (channel) channelMap.set(saved.id, channel.id);
  }
  return { roles: backup.roles.length, channels: backup.channels.length };
}

async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'copia-seguridad') return false;
  if (!interaction.memberPermissions?.has(P.Administrator) && !interaction.memberPermissions?.has(P.ManageGuild)) {
    await interaction.reply({ content: 'Necesitas Administrador o Gestionar servidor.', ephemeral: true }); return true;
  }
  await interaction.deferReply({ ephemeral: true });
  await beginBackup(interaction.client, interaction.guild, interaction.channel, interaction.user);
  await interaction.editReply({ embeds: [embed('Copia creada', 'Se guardó canales, categorías y roles. Se actualiza automáticamente cada 3 horas.')] });
  return true;
}

async function handleComponent(interaction) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith('backup:restore:')) return false;
  const [, , guildId, backupId, ownerId] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) { await interaction.reply({ content: 'Solo el usuario que inició la copia puede restaurarla.', ephemeral: true }); return true; }
  const backup = state.backups[guildId]?.latest;
  if (!backup || backup.id !== backupId) { await interaction.reply({ content: 'Esta copia ya no está disponible.', ephemeral: true }); return true; }
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) { await interaction.reply({ content: 'El bot ya no está en ese servidor.', ephemeral: true }); return true; }
  const member = await guild.members.fetch(ownerId).catch(() => null);
  if (!member?.permissions.has(P.Administrator) && !member?.permissions.has(P.ManageGuild)) { await interaction.reply({ content: 'Necesitas permisos de administrador para restaurar.', ephemeral: true }); return true; }
  await interaction.deferReply({ ephemeral: true });
  const result = await restoreSnapshot(guild, backup);
  await interaction.editReply({ embeds: [embed('Restauración completada', `Restaurados ${result.channels} canales/categorías y ${result.roles} roles.`)] });
  return true;
}

function install() {
  const { Client } = require('discord.js');
  const originalOn = Client.prototype.on;
  const originalOnce = Client.prototype.once;
  Client.prototype.on = function patchedOn(eventName, listener) {
    if (eventName === 'interactionCreate') return originalOn.call(this, eventName, async interaction => {
      try { if (await handleCommand(interaction)) return; if (await handleComponent(interaction)) return; } catch (error) { const payload = { embeds: [embed('Error', error.message || 'No se pudo completar.', 0xE74C3C)], ephemeral: true }; if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {}); else await interaction.reply(payload).catch(() => {}); return; }
      return listener.call(this, interaction);
    });
    return originalOn.call(this, eventName, listener);
  };
  Client.prototype.once = function patchedOnce(eventName, listener) {
    if (eventName !== 'ready') return originalOnce.call(this, eventName, listener);
    return originalOnce.call(this, eventName, async (...args) => {
      await listener.apply(this, args);
      try { await register(this); } catch (error) { console.error('No se pudo registrar copia-seguridad:', error.message); }
      setInterval(() => { for (const guildId of Object.keys(state.backups)) void createBackup(this, guildId).catch(() => {}); }, BACKUP_EVERY_MS).unref?.();
    });
  };
}

async function register(client) {
  if (!process.env.DISCORD_TOKEN) return;
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DEV_GUILD_ID ? Routes.applicationGuildCommands(client.user.id, process.env.DEV_GUILD_ID) : Routes.applicationCommands(client.user.id);
  const current = await rest.get(route); const merged = new Map(current.map(command => [command.name, command]));
  for (const command of commands) merged.set(command.name, command);
  await rest.put(route, { body: [...merged.values()] });
}

module.exports = { install };
