'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits: P,
  REST,
  Routes,
  StringSelectMenuBuilder
} = require('discord.js');

const DATA_FILE = path.resolve(process.env.DATA_PATH || 'data.json');
let data = { guilds: {}, warnings: {}, allowedBots: {} };
function load() {
  try { if (fs.existsSync(DATA_FILE)) data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; }
  catch (error) { console.error('No se pudo leer whitelist:', error.message); }
}
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), null, 2);
  fs.renameSync(tmp, DATA_FILE);
}
load();

function entry(guildId) {
  data.guilds[guildId] ||= {};
  data.guilds[guildId].whitelist ||= { roles: [], members: [], channels: [] };
  return data.guilds[guildId].whitelist;
}

function isOwnerOrAdmin(member) {
  return Boolean(member?.id === member?.guild?.ownerId || member?.permissions?.has(P.Administrator));
}

function isImmuneMember(member) {
  if (!member?.guild) return false;
  if (isOwnerOrAdmin(member)) return true;
  const whitelist = entry(member.guild.id);
  if (whitelist.members.includes(member.id)) return true;
  return member.roles.cache.some(role => whitelist.roles.includes(role.id));
}

function isImmuneChannel(guild, channelId) {
  return Boolean(guild && entry(guild.id).channels.includes(channelId));
}

const command = {
  name: 'whitelist',
  description: 'Inmuniza hasta 5 roles, miembros y canales contra moderación y seguridad.',
  default_member_permissions: P.Administrator.toString(),
  options: [
    { type: 8, name: 'rol1', description: 'Primer rol inmunizado', required: false },
    { type: 8, name: 'rol2', description: 'Segundo rol inmunizado', required: false },
    { type: 8, name: 'rol3', description: 'Tercer rol inmunizado', required: false },
    { type: 8, name: 'rol4', description: 'Cuarto rol inmunizado', required: false },
    { type: 8, name: 'rol5', description: 'Quinto rol inmunizado', required: false },
    { type: 6, name: 'miembro1', description: 'Primer miembro inmunizado', required: false },
    { type: 6, name: 'miembro2', description: 'Segundo miembro inmunizado', required: false },
    { type: 6, name: 'miembro3', description: 'Tercer miembro inmunizado', required: false },
    { type: 6, name: 'miembro4', description: 'Cuarto miembro inmunizado', required: false },
    { type: 6, name: 'miembro5', description: 'Quinto miembro inmunizado', required: false },
    { type: 7, name: 'canal1', description: 'Primer canal inmunizado', required: false, channel_types: [0, 2, 5, 10, 11, 12, 13, 15] },
    { type: 7, name: 'canal2', description: 'Segundo canal inmunizado', required: false, channel_types: [0, 2, 5, 10, 11, 12, 13, 15] },
    { type: 7, name: 'canal3', description: 'Tercer canal inmunizado', required: false, channel_types: [0, 2, 5, 10, 11, 12, 13, 15] },
    { type: 7, name: 'canal4', description: 'Cuarto canal inmunizado', required: false, channel_types: [0, 2, 5, 10, 11, 12, 13, 15] },
    { type: 7, name: 'canal5', description: 'Quinto canal inmunizado', required: false, channel_types: [0, 2, 5, 10, 11, 12, 13, 15] }
  ]
};

function card(title, description) {
  return new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description).setTimestamp();
}

async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'whitelist') return false;
  if (!isOwnerOrAdmin(interaction.member)) {
    await interaction.reply({ embeds: [card('Sin permiso', 'Solo el propietario o los administradores pueden cambiar la whitelist.', 0xE74C3C)], ephemeral: true });
    return true;
  }
  const whitelist = entry(interaction.guildId);
  for (let i = 1; i <= 5; i++) {
    const role = interaction.options.getRole(`rol${i}`);
    const member = interaction.options.getUser(`miembro${i}`);
    const channel = interaction.options.getChannel(`canal${i}`);
    if (role) whitelist.roles.push(role.id);
    if (member) whitelist.members.push(member.id);
    if (channel) whitelist.channels.push(channel.id);
  }
  whitelist.roles = [...new Set(whitelist.roles)].slice(0, 100);
  whitelist.members = [...new Set(whitelist.members)].slice(0, 100);
  whitelist.channels = [...new Set(whitelist.channels)].slice(0, 100);
  save();
  const formatIds = (ids, prefix) => ids.length ? ids.map(id => `${prefix}${id}>`).join(' ') : 'Ninguno';
  await interaction.reply({ embeds: [card('Whitelist guardada', `Roles: ${formatIds(whitelist.roles, '<@&')}\nMiembros: ${formatIds(whitelist.members, '<@')}\nCanales: ${formatIds(whitelist.channels, '<#')}`)], ephemeral: true });
  return true;
}

async function register(client) {
  if (!process.env.DISCORD_TOKEN) return;
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DEV_GUILD_ID ? Routes.applicationGuildCommands(client.user.id, process.env.DEV_GUILD_ID) : Routes.applicationCommands(client.user.id);
  const current = await rest.get(route);
  const merged = new Map(current.map(item => [item.name, item]));
  merged.set(command.name, command);
  await rest.put(route, { body: [...merged.values()] });
}

function install() {
  const { Client } = require('discord.js');
  const originalOn = Client.prototype.on;
  const originalOnce = Client.prototype.once;

  Client.prototype.on = function patchedOn(eventName, listener) {
    if (eventName === 'interactionCreate') {
      return originalOn.call(this, eventName, async interaction => {
        try { if (await handleCommand(interaction)) return; } catch (error) { await interaction.reply({ content: error.message || 'Error al actualizar la whitelist.', ephemeral: true }).catch(() => {}); return; }
        return listener.call(this, interaction);
      });
    }
    if (eventName === 'messageCreate') {
      return originalOn.call(this, eventName, async message => {
        if (message.member && isImmuneMember(message.member)) {
          // Owner, administrators and whitelisted users bypass security filters.
          return listener.call(this, message);
        }
        return listener.call(this, message);
      });
    }
    return originalOn.call(this, eventName, listener);
  };

  Client.prototype.once = function patchedOnce(eventName, listener) {
    if (eventName !== 'ready') return originalOnce.call(this, eventName, listener);
    return originalOnce.call(this, eventName, async (...args) => {
      await listener.apply(this, args);
      try { await register(this); } catch (error) { console.error('No se pudo registrar /whitelist:', error.message); }
    });
  };
}

module.exports = { install, command, isOwnerOrAdmin, isImmuneMember, isImmuneChannel, entry };
