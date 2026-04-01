const mongoose = require('mongoose');
const User = require('./server/models/User');

async function test() {
    await mongoose.connect('mongodb+srv://ppk52621_db_user:HtBDwkPXPgJNrnxv@interview.afdccwt.mongodb.net/ai_interview?retryWrites=true&w=majority');
    
    const user = await User.findOne({ 'appliedJobs.0': { $exists: true } });
    const appliedJob = user.appliedJobs[0];
    
    console.log('Before Status:', appliedJob.status);
    appliedJob.status = 'ats_passed';
    appliedJob.currentRound = 'aptitude';
    
    let err = user.validateSync();
    console.log('Validation Error:', err);
    
    await user.save();
    
    const u2 = await User.findById(user._id);
    console.log('After save status:', u2.appliedJobs[0].status);
    process.exit(0);
}
test();
