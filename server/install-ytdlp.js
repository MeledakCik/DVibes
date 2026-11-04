'use strict';

const ytdlp = require('./ytdlp');

(async () => {
  try {
    const result = await ytdlp.status();
    if (!result.available) {
      console.error(`yt-dlp setup failed: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`yt-dlp ready: ${result.version}`);
    console.log(`binary: ${result.binary}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
