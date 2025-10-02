// health.js
const express = require('express');
const app = express();
app.get('/', (_, res) => res.send('ok'));
app.listen(process.env.PORT || 3000);
