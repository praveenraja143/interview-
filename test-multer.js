const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer({ dest: 'uploads/' });

app.post('/test', (req, res, next) => { console.log('first'); next(); }, upload.single('resume'), (req, res) => {
    res.json({ ok: 1 });
});

app.use((err, req, res, next) => {
    console.log("ERR:", err.stack);
    res.status(500).json({ message: err.message });
});

app.listen(3001, async () => {
    try {
        const fetch = require('node-fetch'); // Native fetch in v22
    } catch(e) {}
    
    const FormData = global.FormData;
    const form = new FormData();
    form.append('resume', new Blob(['test']), 'test.txt');

    const res = await fetch('http://localhost:3001/test', {
        method: 'POST',
        body: form
    });
    console.log(await res.json());
    process.exit(0);
});
