require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const seedAdmin = require('./config/seed');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Make io available to routes
app.set('io', io);

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/aptitude', require('./routes/aptitude'));
app.use('/api/technical', require('./routes/technical'));
app.use('/api/gd', require('./routes/gd'));
app.use('/api/interview', require('./routes/interview'));

// Socket.IO
io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    socket.on('joinJob', (jobId) => {
        socket.join(`job_${jobId}`);
        console.log(`📋 User ${socket.id} joined job ${jobId}`);
    });

    socket.on('adminMonitor', () => {
        socket.join('admin_room');
        console.log(`👤 Admin connected: ${socket.id}`);
    });

    socket.on('tabSwitch', (data) => {
        console.log(`⚠️ Tab switch detected: Job ${data.jobId}, Round ${data.round}, Count ${data.count}`);
        io.to('admin_room').emit('proctorAlert', data);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.id}`);
    });
});

// Serve frontend - catch all non-API routes
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ==========================================
// GLOBAL ERROR HANDLER — prevents server crash
// ==========================================
app.use((err, req, res, next) => {
    console.error('❌ Global Error:', err.message);
    console.error(err.stack);
    res.status(500).json({ message: err.message || 'Internal server error' });
});

// ==========================================
// CRASH PROTECTION — keep server alive
// ==========================================
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception (server NOT crashed):', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection (server NOT crashed):', reason);
});

// Start server after DB connection
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await connectDB();
        await seedAdmin();
        server.listen(PORT, () => {
            console.log(`
    ╔══════════════════════════════════════════╗
    ║   🤖 AI Interview Platform Running!      ║
    ║   📡 Port: ${PORT}                          ║
    ║   🌐 http://localhost:${PORT}               ║
    ║   🛡️  Crash protection: ENABLED           ║
    ╚══════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer();
