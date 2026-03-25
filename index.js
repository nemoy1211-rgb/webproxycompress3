const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');

const app = express();

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const WHITELIST = process.env.WHITELIST ? process.env.WHITELIST.split(',').map(d => d.trim()) : [];

app.get('/:protocol//:url(*)', async (req, res) => {
    const targetUrl = `${req.params.protocol}//${req.params.url}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
    try {
        const parsedUrl = new URL(targetUrl);
        if (!WHITELIST.some(d => parsedUrl.hostname === d || parsedUrl.hostname.endsWith(`.${d}`))) {
            return res.status(403).send('F');
        }

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            httpAgent,
            httpsAgent,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            // Включаем автоматическую распаковку! 
            // Теперь Node.js сам превратит сжатый "мусор" в текст.
            decompress: true, 
            timeout: 20000
        });

        // УДАЛЯЕМ заголовок content-encoding от оригинального сайта,
        // так как Node.js уже распаковал данные.
        res.setHeader('Content-Type', response.headers['content-type'] || 'text/html');
        res.removeHeader('Content-Encoding'); 
        res.setHeader('Transfer-Encoding', 'chunked');

        response.data.pipe(res);

    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.listen(process.env.PORT || 3000);
