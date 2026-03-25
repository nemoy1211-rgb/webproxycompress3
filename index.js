const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');

const app = express();

// 1. Агенты для повторного использования соединений (Keep-Alive)
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const WHITELIST = process.env.WHITELIST ? process.env.WHITELIST.split(',').map(d => d.trim()) : [];

app.get('/:protocol//:url(*)', async (req, res) => {
    const targetUrl = `${req.params.protocol}//${req.params.url}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
    try {
        const parsedUrl = new URL(targetUrl);
        const targetHostname = parsedUrl.hostname;

        const isAllowed = WHITELIST.some(allowedDomain => 
            targetHostname === allowedDomain || targetHostname.endsWith(`.${allowedDomain}`)
        );

        if (!isAllowed) {
            return res.status(403).send('F');
        }

        // 2. Запрос к источнику
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            httpAgent,
            httpsAgent,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                // РАЗРЕШАЕМ источнику присылать сжатые данные
                'Accept-Encoding': 'gzip, deflate, br' 
            },
            // ВАЖНО: Отключаем автоматическую распаковку в Axios, 
            // чтобы пробрасывать сжатые байты "как есть"
            decompress: false, 
            timeout: 10000,
            validateStatus: () => true // Пропускаем любые статусы (404, 500 и т.д.)
        });

        // 3. Проброс критических заголовков
        // Если источник прислал Content-Encoding (gzip/br), отдаем его клиенту
        if (response.headers['content-encoding']) {
            res.setHeader('Content-Encoding', response.headers['content-encoding']);
        }
        
        res.setHeader('Content-Type', response.headers['content-type'] || 'text/html');
        
        // Удаляем заголовок content-length, так как при стриминге 
        // размер может измениться или быть неизвестен заранее
        res.removeHeader('Content-Length');
        res.setHeader('Transfer-Encoding', 'chunked');

        // 4. Передача потока
        response.data.pipe(res);

        // Обработка обрыва соединения клиентом
        req.on('close', () => {
            response.data.destroy();
        });

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).send(`E`);
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Passthrough Proxy running on port ${PORT}`));
