'use strict';

const { Client } = require('discord.js');

const originalOn = Client.prototype.on;
const state = new WeakMap();

function markObject(target) {
  if (!target || typeof target !== 'object') return;
  state.set(target, true);
}

function wasMarked(target) {
  return Boolean(target && state.get(target));
}

function wrapMessage(message) {
  if (message?.reply) {
    const reply = message.reply.bind(message);
    message.reply = async (...args) => {
      markObject(message);
      return reply(...args);
    };
  }
  if (message?.channel?.send) {
    const send = message.channel.send.bind(message.channel);
    message.channel.send = async (...args) => {
      markObject(message);
      return send(...args);
    };
  }
}

function wrapInteraction(interaction) {
  for (const name of ['reply', 'deferReply', 'followUp', 'update', 'editReply', 'showModal']) {
    if (typeof interaction[name] !== 'function') continue;
    const original = interaction[name].bind(interaction);
    interaction[name] = async (...args) => {
      markObject(interaction);
      return original(...args);
    };
  }
}

function install() {
  Client.prototype.on = function patchedOn(eventName, listener) {
    const wrapped = async (...args) => {
      const first = args[0];
      if (eventName === 'messageCreate') {
        if (wasMarked(first)) return;
        wrapMessage(first);
      }
      if (eventName === 'interactionCreate') {
        if (wasMarked(first)) return;
        wrapInteraction(first);
      }
      return listener.apply(this, args);
    };
    return originalOn.call(this, eventName, wrapped);
  };
}

module.exports = { install };
