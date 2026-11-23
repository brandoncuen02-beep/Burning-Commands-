'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Client
} = require('discord.js');

const COOKIE_PREFIX = 'burning:cookie:';
const games = new Map();
const embed = (title, description, color = 0xF1C40F) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function row(button) { return [new ActionRowBuilder().addComponents(button)]; }
function cookieButton(id, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setEmoji('🍪').setLabel('Tocar la galleta')
    .setStyle(ButtonStyle.Success).setDisabled(disabled);
}

async function runGame(interaction) {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({ content: 'Este juego solo se puede usar en un canal del servidor.', ephemeral: true });
    return true;
  }
  await interaction.reply({ embeds: [embed('🍪 Carrera por la galleta', 'La galleta aparecerá en **5**…')], allowedMentions: { parse: [] } });
  const message = await interaction.fetchReply();
  for (let count = 4; count >= 1; count--) {
    await sleep(1000);
    await message.edit({ embeds: [embed('🍪 Carrera por la galleta', `La galleta aparecerá en **${count}**…`)] }).catch(() => {});
  }
  const customId = `${COOKIE_PREFIX}${interaction.guildId}:${message.id}`;
  const expiresAt = Date.now() + 5000;
  games.set(message.id, { guildId: interaction.guildId, expiresAt, winner: null });
  await message.edit({ embeds: [embed('🍪 ¡Ya!', '¡Pulsa el botón verde! Tienes **5 segundos**.')], components: row(cookieButton(customId)) }).catch(() => {});
  const timer = setTimeout(async () => {
    const game = games.get(message.id);
    if (!game || game.winner) return;
    games.delete(message.id);
    await message.edit({ embeds: [embed('⏱️ Tiempo agotado', 'Nadie alcanzó la galleta. Esta cookie ya no se puede usar.', 0x95A5A6)], components: row(cookieButton(customId, true)) }).catch(() => {});
  }, 5000);
  timer.unref?.();
  return true;
}

async function handleButton(interaction) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith(COOKIE_PREFIX)) return false;
  const [, , guildId, messageId] = interaction.customId.split(':');
  const game = games.get(messageId);
  if (!game || game.guildId !== guildId || interaction.guildId !== guildId || Date.now() > game.expiresAt) {
    games.delete(messageId);
    await interaction.reply({ content: '⏱️ La cookie caducó; ya no se puede usar.', ephemeral: true }).catch(() => {});
    await interaction.message.edit({ components: row(cookieButton(interaction.customId, true)) }).catch(() => {});
    return true;
  }
  if (game.winner) {
    await interaction.reply({ content: `La cookie ya la ganó ${game.winner}.`, ephemeral: true }).catch(() => {});
    return true;
  }
  game.winner = interaction.user;
  games.delete(messageId);
  await interaction.update({
    embeds: [embed('🏆 ¡Tenemos ganador!', `${interaction.user} fue quien tocó la 🍪 primero.`, 0x2ECC71)],
    components: []
  });
  return true;
}

function install() {
  const originalOn = Client.prototype.on;
  Client.prototype.on = function patchedOn(eventName, listener) {
    if (eventName !== 'interactionCreate') return originalOn.call(this, eventName, listener);
    return originalOn.call(this, eventName, async interaction => {
      try {
        if (interaction.isChatInputCommand?.() && interaction.commandName === 'cookie-game') {
          await runGame(interaction);
          return;
        }
        if (await handleButton(interaction)) return;
      } catch (error) {
        console.error('Error en cookie-game:', error);
        const payload = { content: 'No se pudo completar el juego de la cookie.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
        return;
      }
      return listener.call(this, interaction);
    });
  };
}

module.exports = { install };
