const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod = null;

const connectDB = async () => {
    try {
        if (process.env.MONGODB_URI) {
            console.log('🔄 Connecting to Real MongoDB for PERSISTENCE...');
            try {
                await mongoose.connect(process.env.MONGODB_URI);
                console.log(`✅ MongoDB Connected successfully. Data will be saved.`);
            } catch (err) {
                console.log(`❌ Failed to connect to Real MongoDB: ${err.message}`);
                console.log('🔄 Fallback: Starting volatile IN-MEMORY database (Data WILL be lost on restart)...');
                mongod = await MongoMemoryServer.create();
                await mongoose.connect(mongod.getUri());
                console.log(`✅ MongoDB Connected (In-Memory, VOLATILE)`);
            }
        } else {
            console.log('⚠️ WARNING: No MONGODB_URI found in .env.');
            console.log('🔄 Starting volatile IN-MEMORY database (Data WILL be lost on restart)...');
            console.log('💡 TIP: To fix data loss, add a MongoDB URI to your .env file or install MongoDB locally');
            
            mongod = await MongoMemoryServer.create();
            const uri = mongod.getUri();
            await mongoose.connect(uri);
            console.log(`✅ MongoDB Connected (In-Memory, VOLATILE)`);
        }
        
        // Handle connection errors after initial connect
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });

    } catch (error) {
        console.error(`❌ MongoDB Error: ${error.message}`);
        process.exit(1);
    }
};

// Cleanup on exit
const cleanup = async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        if (mongod) {
            await mongod.stop();
        }
    } catch (e) {
        // ignore
    }
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

module.exports = connectDB;
