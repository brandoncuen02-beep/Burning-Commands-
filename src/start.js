'use strict';

const GOLD = 0xF1C40F;
global.GOLD = GOLD;

// Register the command/event module; ./whitelist.js only exports whitelist helpers.
require('./whitelist-command').install();
require('./social-interactions').install();
require('./prefix-commands').install();
require('./slash-security').install();
require('./automod').install();
require('./prefix-utility').install();
require('./interaction-fixes').install();
require('./social-events').install();
require('./package5').install();
require('./package6').install();
// Installed last so this handler owns /cookie-game and its button interactions.
require('./cookie-game-fix').install();
process.env.ENABLE_PRIVILEGED_INTENTS = 'true';
require('./index');
