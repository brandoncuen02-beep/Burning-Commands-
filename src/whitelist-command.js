'use strict';

const { ActionRowBuilder, EmbedBuilder, PermissionFlagsBits: P, REST, Routes } = require('discord.js');
const whitelist = require('./whitelist');
const optionList = [];
for (let i = 1; i <= 5; i++) optionList.push({ type: 8, name: `rol${i}`, description: `Rol inmunizado ${i} (opcional)`, required: false });
for (let i = 1; i <= 5; i++) optionList.push({ type: 6, name: `miembro${i}`, description: `Miembro inmunizado ${i} (opcional)`, required: false });
for (let i = 1; i <= 5; i++) optionList.push({ type: 7, name: `canal${i}`, description: `Canal inmunizado ${i} (opcional)`, required: false, channel_types: [0, 2, 4, 5, 10, 11, 12, 13, 15] });
const command = { name: 'whitelist', description: 'Añade hasta 5 roles, miembros y canales a la lista de inmunidad.', default_member_permissions: P.ManageGuild.toString(), options: optionList };
const embed = (title, description, color = 0x5865F2) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
function render(ids, prefix, suffix = '>') { return ids.length ? ids.map(id => `${prefix}${id}${suffix}`).join(', ') : 'Ninguno'; }
async function handle(interaction) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'whitelist') return false;
  if (!whitelist.isOwnerOrAdmin(interaction.member)) {
    await interaction.reply({ embeds: [embed('Sin permiso', 'Solo el dueño o administradores pueden configurar la whitelist.', 0xE74C3C)], ephemeral: true });
    return true;
  }
  const config = whitelist.entry(interaction.guildId);
  for (let i = 1; i <= 5; i++) {
    const role = interaction.options.getRole(`rol${i}`);
    const user = interaction.options.getUser(`miembro${i}`);
    const channel = interaction.options.getChannel(`canal${i}`);
    if (role && role.id !== interaction.guildId) config.roles.push(role.id);
    if (user && interaction.guild.members.cache.has(user.id)) config.members.push(user.id);
    if (channel) config.channels.push(channel.id);
  }
  config.roles = [...new Set(config.roles)];
  config.members = [...new Set(config.members)];
  config.channels = [...new Set(config.channels)];
  whitelist.save();
  await interaction.reply({ embeds: [embed('Whitelist actualizada', `**Roles:** ${render(config.roles, '<@&')}\n**Miembros:** ${render(config.members, '<@')}\n**Canales:** ${render(config.channels, '<#')}`)], ephemeral: true });
  return true;
}
async function register(client) {
  if (!process.env.DISCORD_TOKEN) return;
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DEV_GUILD_ID ? Routes.applicationGuildCommands(client.user.id, process.env.DEV_GUILD_ID) : Routes.applicationCommands(client.user.id);
  const current = await rest.get(route);
  const commands = new Map(current.map(item => [item.name, item]));
  commands.set(command.name, command);
  await rest.put(route, { body: [...commands.values()] });
}
function install() {
  const { Client } = require('discord.js');
  const originalOn = Client.prototype.on;
  const originalOnce = Client.prototype.once;
  Client.prototype.on = function patchedOn(eventName, listener) {
    if (eventName === 'interactionCreate') return originalOn.call(this, eventName, async interaction => {
      try { if (await handle(interaction)) return; }
      catch (error) {
        const payload = { content: `No se pudo actualizar la whitelist: ${error.message || 'error inesperado'}`, ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
        return;
      }
      return listener.call(this, interaction);
    });
    return originalOn.call(this, eventName, listener);
  };
  Client.prototype.once = function patchedOnce(eventName, listener) {
    if (eventName !== 'ready' && eventName !== 'clientReady') return originalOnce.call(this, eventName, listener);
    return originalOnce.call(this, eventName, async (...args) => {
      await listener.apply(this, args);
      try { await register(this); } catch (error) { console.error('No se pudo registrar /whitelist:', error.message); }
    });
  };
}
module.exports = { install, command };
