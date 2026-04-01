const mongoose = require('mongoose');
const Job = require('./server/models/Job');
const User = require('./server/models/User');
const RoundResult = require('./server/models/RoundResult');
const eliminationEngine = require('./server/services/eliminationEngine');

async function test() {
    await mongoose.connect('mongodb+srv://ppk52621_db_user:HtBDwkPXPgJNrnxv@interview.afdccwt.mongodb.net/ai_interview?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true });
    
    const job = await Job.findOne({ currentRound: 'ats' });
    if (!job) {
        console.log("No job in ATS round found.");
        process.exit(1);
    }
    console.log("Found Job:", job._id, job.title, job.currentRound);
    
    const results = await RoundResult.find({ jobId: job._id, round: job.currentRound }).populate('userId', 'name email');
    console.log("Total Results:", results.length);
    if(results.length > 0) {
        console.log("Scores:", results.map(r => r.score));
        const keepCount = eliminationEngine.calculateKeepCount(
            results.length,
            job.totalPositions,
            job.eliminationRatios[job.currentRound] || 50,
            job.currentRound
        );
        console.log("Keep count:", keepCount);
        
        const processed = eliminationEngine.eliminateByScore(
            results.map(r => ({
                userId: r.userId ? r.userId._id : null,
                candidateName: r.userId ? r.userId.name : 'Unknown',
                email: r.userId ? r.userId.email : 'Unknown',
                score: r.score,
                resultId: r._id
            })),
            keepCount
        );
        console.log("Processed:", processed.map(p => ({ user: p.candidateName, passed: p.passed })));
    }
    
    process.exit(0);
}
test();
