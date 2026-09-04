const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Allow seamless connections from tunnels and local IPs
const io = new Server(server, {
    cors: { origin: "*" }
});

const DB_FILE = path.join(__dirname, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure storage folders and database exist
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

// Serve public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Setup Multer for safe image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
        cb(null, 'cicada-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// Endpoint to upload images
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// Socket.io Real-time engine
io.on('connection', (socket) => {
    // 1. Send chat history to new connection
    try {
        const history = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        socket.emit('loadHistory', history);
    } catch (e) {
        socket.emit('loadHistory', []);
    }

    // 2. Typing indicator broadcast
    socket.on('typing', (data) => {
        socket.broadcast.emit('userTyping', data);
    });

    // 3. New message broadcast
    socket.on('sendMessage', (msgData) => {
        const message = {
            id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            username: msgData.username || 'ANONYMOUS',
            avatarSeed: msgData.avatarSeed || msgData.username,
            text: msgData.text || '',
            image: msgData.image || null,
            isClassified: !!msgData.isClassified,
            replyTo: msgData.replyTo || null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        // Persist to database file
        try {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
            data.push(message);
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Error writing to DB:', e);
        }

        io.emit('newMessage', message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[CICADA 3301 NETWORK] Online at port: ${PORT}`);
});