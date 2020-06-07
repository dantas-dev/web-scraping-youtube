const fs = require('fs').promises;
const readlineSync = require('readline-sync');
const scraping = require('./scraping');

async function main ({ channel, count, options }) {
  try {
    const ytChannel = new scraping(channel, count, options);
    await ytChannel.init();
    const main = await ytChannel.getMainInfos();
    const videos = await ytChannel.getAllVideos();
    
    // encerra o puppeteer
    await ytChannel.close();

    // nome do arquivo a ser salvo
    const fileName = `${main.channelName}-${new Date().getTime()}`;

    // salvando o arquivo .json
    await fs.writeFile(
      `./channels/${fileName}.json`,
      JSON.stringify({
        main,
        videos,
      }));
    console.log('\x1b[32m', `${fileName}.json saved.`);
  } catch (error) {
    console.log(error.message);
  }
}

async function initialize() {
  const channel = 
    await readlineSync.question('Please, type the channel url: ');
  const count =
    await readlineSync.question('Please, type quantity of the last videos you want: '); 

  const options = {
    blockResources: true,
    headless: true,
  }

  main({
    channel,
    count,
    options,
  });
}

initialize();
