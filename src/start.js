'use strict';

const GOLD = 0xF1C40F;
global.GOLD = GOLD;

require('./whitelist').install();
require('./social-interactions').install();
require('./prefix-commands').install();
require('./slash-security').install();
require('./automod').install();
require('./prefix-utility').install();
require('./interaction-fixes').install();
require('./social-events').install();
require('./package5').install();
require('./package6').install();
process.env.ENABLE_PRIVILEGED_INTENTS = 'true';
require('./index');
