const puppeteer = require('puppeteer');

class Scraping {
  constructor(channel, count, options) {
    this.channel = channel;
    this.count = count;

    this.blockResources = options.blockResources || false;
    this.headless = options.headless || false;

    this.browser = null;
    this.page = null;
  }

  async init() {
    const { headless, blockResources } = this;

    // lança uma instância do navegador chrome/chromium
    this.browser = await puppeteer.launch({
      headless, 
      /**
       * gosto de manter true para evitar o puppeteer
       * parar devido a HTTPS erros desnecessários
       */
      ignoreHTTPSErrors: true,
      /**
       * tamanho da tela que irá ser executado, sempre escolha um
       * tamanho onde você sabe que irá ter os itens que você
       * deseja na tela
       */
      defaultViewport: {
        width: 1366,
        height: 768
      }
    });

    // basicamente cria uma nova aba 
    this.page = await this.browser.newPage();
    blockResources && (await this.blockInterceptResources());
  }

  async blockInterceptResources() {
    // ativa a interceptação de requisições 
    await this.page.setRequestInterception(true);
    // tipos que quero interceptar
    const resources = ['image', 'stylesheet', 'font'];

    /**
     * escuta o evento "request", e por cada requisição
     * verifica se o tipo dela e o mesmo do array, caso
     * seja, eu bloqueio essa chamada, caso não. Deixo a
     * mesma continuar
     */
    this.page.on('request', (request) => {
      if(resources.includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  async getMainInfos() {
    const { channel, page } = this;

    console.log('\x1b[33m', 'Searching for key information...');

    // navegação para a url contida da variavel channel
    // waitUntil: 'networkidle2 : basicamente espera a pagina carregar até seguir com o código
    await page.goto(channel, { waitUntil: 'networkidle2' });

    // se quisermos acessar o console do navegador, utilizados o método evaluate
    const infos = await page.evaluate(async () => {
      const $channelName = document.querySelector('#channel-name');

      // caso não encontre o nome do canal, retorna null
      if (!$channelName) {
        return null;
      }

      const $verified = document.querySelector('#channel-name yt-icon');
      const $subscribers = document.querySelector('#subscriber-count');
      
      // técnica para encontrar link do menu correto
      const menuList = Array.from(document.querySelectorAll('paper-tab div'));
      const $menuAbout = menuList.find(i => 
        i.innerText.toLowerCase().trim() === 'sobre'
        || i.innerText.toLowerCase().trim() === 'about');

      // preenchendo as váriaveis com as informações encontradas
      const channelName = $channelName ? $channelName.innerText.trim() : null;
      const verified = $verified ? true : false;
      const subscribers = $subscribers ? $subscribers.innerText : null;
      
      // se por algum motivo o valor vinher vazio, retorna null
      if (channelName === '') {
        return null;
      }


      let description = null;
      let createdAt = null;
      let views = null;
      
      // caso encontre o link do menu equivalente a sessão "sobre"
      if ($menuAbout) {
        // click no elemento (nativo do browser)
        $menuAbout.click();
        /**
         * bloqueia por 3 segundos até continuar a execução (tempo para carregar as informaçoes da sessão)
         * essa forma não e recomendada, mas deixei assim para você ter um desafio de melhorar essa parte
         */
        await new Promise(resolve => setTimeout(resolve, 3000));

        const $description = document.querySelector('#left-column #description');
        const $createdAt = document.querySelector('#right-column span:nth-child(2)');
        const $views = document.querySelector('#right-column yt-formatted-string:nth-child(3)');

        description = $description && $description.innerText
          ? $description.innerText.trim() : null;
        createdAt = $createdAt && $createdAt.innerText
          ? $createdAt.innerText.trim() : null;
        views = $views && $views.innerText
          ? $views.innerText.trim() : null;
      }

      return {
        channelName,
        verified,
        subscribers,
        description,
        createdAt,
        views,
      }
    });

    // caso valor seja false
    !infos
      ? console.log('\x1b[31m', 'Channel not found!')
      : console.log('\x1b[32m', 'Key information obtained successfully!');
    
    return infos;
  }

  async getAllVideos() {
    const { channel, page, count } = this;

    // acessa a página do canal
    await page.goto(channel, { waitUntil: 'networkidle2' });

    console.log('\x1b[33m', `Searching for last ${count} videos...`);

    /**
     * novamente uma técnica, para descobrir qual e o elemento referente ao link do menu para vídeos
     * mas dessa vez eu quero descobrir o index do elemento (apenas para exemplificar uma outra forma)
     */
    const menuVideoIndex = await page.evaluate(async () => {
      const menuList = Array.from(document.querySelectorAll('paper-tab div'));
      return menuList.findIndex(i => 
        i.innerText.toLowerCase().trim() === 'vídeos'
        || i.innerText.toLowerCase().trim() === 'videos');
    });

    /**
     * Caso encontre o link do menu referente aos vídeos
     * iremos coletar a lista dos últimos vídeos do canal 
     * de acordo com o count
     * Se não encontrar, apenas retornaremos a lista vazio com um aviso.
     */
    if (menuVideoIndex !== -1) {
      // Usando o evento de click do puppeteer, utilizando o seletor css + index do elemento
      await page.click(`#tabsContent paper-tab:nth-of-type(${menuVideoIndex + 1})`);
      
      /**
       * Esperar um pouco para deixar os elementos dessa tela serem carregados
       * O ideal e selecionar um elemento unico que irá ter naquela tela
       * assim não ficamos com um valor marretado. Deixo isso como desafio para vocês
       */
      await page.waitFor(3000);

      // Lista inicial da quantidade de videos encontrada no primeiro momento (para mim sempre e 30)
      let videosList = await page.$$("#contents #items > ytd-grid-video-renderer");
      // iremos usar essa variavel como uma flag, mais abaixo
      let lastVideosListLength = 0;

      // loop para coletar os vídeos até a quantidade que o usuário deseja
      while (videosList.length < count) {
        /**
         * lembre-se que o evaluate executa um comando no console do navegador,
         * nesse caso eu executo sempre o scrollTo para descer a tela, assim ativamos o carregamento
         * de mais vídeos
         */
        await page.evaluate(`window.scrollTo(0, document.body.scrollHeight || document.documentElement.scrollHeight);`);
        /**
         * bloqueia por 3 segundos, para esperar os vídeos carregados
         * aparecer depois daquele evento de scroll
         * mais uma vez: o ideal e ter um elemento na tela para você saber quando seguir com o loop
         * em vez de ter um numero marretado.
         * deixo como desafio: pesquise nos docs do puppeteer por page.waitForSelector
         * você pode usar aquele elemento de "loading" que aparece sempre que executamos o scroll
         * atualmente o seletor dele é: '#spinnerContainer.style-scope.paper-spinner'
         * faça uma lógica para que espere esse elemento ficar invisivel na tela, para poder
         * seguir com o loop
         */
        await page.waitFor(1000 * 3);

        // pega a lista atualizada de elementos
        videosList = await page.$$("#contents #items > ytd-grid-video-renderer");

        /**
         * basicamente e uma verificação para ver se chegamos no fim da tela
         * caso o canal não tenham mais vídeos para fazer o scroll
         * assim paramos o loop
         */
        if (lastVideosListLength === videosList.length) break;

        // atualiza o valor da quantidade de videos já capturados
        lastVideosListLength = videosList.length;
      }

      /**
       * agora que já temos a quantidade necessária pedida pelo usuário
       * podemos formatar os dados e retornar um array de objetos 
       */
      let videos  =  await Promise.all(videosList.map(async (video) => ({
        title: await video.$eval('#video-title', el => el.innerText.trim()),
        thumbnail: await video.$eval('#img', el => el.getAttribute('src')),
        url: await video.$eval('#thumbnail', el => el.getAttribute('href')),
        views: await video.$eval(
          '#metadata-line span:nth-child(1)',
          el => el.innerText.trim()),
          uploadDate: await video.$eval(
          '#metadata-line span:nth-child(2)',
          el => el.innerText.trim()),
      })));

      console.log('\x1b[32m', 'Videos list obtained successfully!');

      /**
       * pode ocorrer de vim um pouco mais de vídeos do que o usuário pediu
       * então cortamos essa parte, e só enviamos o que realmente foi pedido
       */
      return videos.slice(0, count);
    } else {
      console.log('\x1b[31m', 'Cannot found menu video button!')
      return [];
    }
  }

  async close() {
    await this.browser.close();
  }
}

module.exports = Scraping;
