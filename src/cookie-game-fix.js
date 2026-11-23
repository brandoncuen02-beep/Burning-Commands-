'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client
} = require('discord.js');

const PREFIX = 'burning:cookie:';
const games = new Map();
const embed = (title, description, color = 0xF1C40F) =>
  new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function cookieRow(customId, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setEmoji('🍪').setLabel('Tocar la galleta')
      .setStyle(ButtonStyle.Success).setDisabled(disabled)
  )];
}

async function runCookieGame(interaction) {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({ content: 'Usa /cookie-game dentro de un servidor.', ephemeral: true });
    return;
  }

  await interaction.reply({ embeds: [embed('🍪 Carrera de cookie', '**5**')], allowedMentions: { parse: [] } });
  const message = await interaction.fetchReply();
  const customId = `${PREFIX}${interaction.guildId}:${message.id}`;

  for (let count = 4; count >= 0; count--) {
    await sleep(1000);
    await message.edit({ embeds: [embed('🍪 Carrera de cookie', `**${count}**`)] }).catch(() => {});
  }

  const game = { guildId: interaction.guildId, winner: null, expiresAt: Date.now() + 5000 };
  games.set(message.id, game);
  await message.edit({
    embeds: [embed('🍪 ¡Toca la galleta!', 'Quien toque primero gana.')] ,
    components: cookieRow(customId, false)
  }).catch(() => {});

  setTimeout(async () => {
    const current = games.get(message.id);
    if (!current || current.winner) return;
    games.delete(message.id);
    await message.edit({
      embeds: [embed('⏱️ Sin ganador', 'Nadie tocó la galleta. El botón quedó bloqueado.', 0x95A5A6)],
      components: cookieRow(customId, true)
    }).catch(() => {});
  }, 5000).unref?.();
}

async function handleCookie(interaction) {
  if (!interaction.isChatInputCommand?.() && !interaction.isButton?.()) return false;

  if (interaction.isChatInputCommand?.() && interaction.commandName === 'cookie-game') {
    await runCookieGame(interaction);
    return true;
  }

  if (!interaction.isButton?.() || !interaction.customId?.startsWith(PREFIX)) return false;
  const [, , guildId, messageId] = interaction.customId.split(':');
  const game = games.get(messageId);

  if (!game || game.guildId !== guildId || interaction.guildId !== guildId) {
    await interaction.reply({ content: 'Este juego ya terminó.', ephemeral: true }).catch(() => {});
    await interaction.message.edit({ components: cookieRow(interaction.customId, true) }).catch(() => {});
    return true;
  }

  if (game.winner) {
    await interaction.reply({ content: 'La galleta ya tiene ganador.', ephemeral: true }).catch(() => {});
    return true;
  }

  if (Date.now() > game.expiresAt) {
    games.delete(messageId);
    await interaction.update({
      embeds: [embed('⏱️ Tiempo agotado', 'Nadie ganó antes de que caducara la galleta.', 0x95A5A6)],
      components: cookieRow(interaction.customId, true)
    }).catch(() => {});
    return true;
  }

  game.winner = interaction.user.id;
  await interaction.update({
    embeds: [embed('🏆 ¡Ganador!', `${interaction.user} tocó la 🍪 primero.`, 0x2ECC71)],
    components: cookieRow(interaction.customId, true)
  }).catch(() => {});
  games.delete(messageId);
  return true;
}

function install() {
  const originalOn = Client.prototype.on;
  Client.prototype.on = function patchedOn(eventName, listener) {
    if (eventName !== 'interactionCreate') return originalOn.call(this, eventName, listener);
    return originalOn.call(this, eventName, async interaction => {
      try {
        if (await handleCookie(interaction)) return;
      } catch (error) {
        console.error('Error cookie-game:', error);
        const payload = { content: 'No se pudo ejecutar el juego.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
        return;
      }
      return listener.call(this, interaction);
    });
  };
}

module.exports = { install };
