# Correcciones

El comando `/cookie-game` cuenta de 5 a 1, habilita una cookie verde por cinco segundos y muestra al primer ganador. Si nadie la pulsa, deshabilita la cookie.

La advertencia `npm warn config production Use --omit=dev instead.` proviene de la configuración de npm del entorno de despliegue. No es un error del bot; configura `npm install --omit=dev` en ese entorno.

La advertencia del evento `ready` es de compatibilidad con discord.js v15. El proyecto declara discord.js v14; si el host instala v15, fija la dependencia a v14 o migra los listeners a `clientReady`.
