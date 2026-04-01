const mongoose = require('mongoose');
const User = require('./server/models/User');
const Job = require('./server/models/Job');

async function test() {
    await mongoose.connect('mongodb+srv://ppk52621_db_user:HtBDwkPXPgJNrnxv@interview.afdccwt.mongodb.net/ai_interview?retryWrites=true&w=majority');
    const job = await Job.findOne({ title: 'Python developer' });
    const user = await User.findById(job.applicants[0]);
    console.log('User ID:', user._id);
    console.log('Job ID:', job._id);
    
    // reset state
    user.appliedJobs[0].status = 'applied';
    user.appliedJobs[0].currentRound = 'ats';
    await user.save();
    
    let res = await User.updateOne(
        { _id: user._id, 'appliedJobs.jobId': job._id },
        {
            $set: {
                'appliedJobs.$.status': 'ats_passed',
                'appliedJobs.$.currentRound': 'aptitude'
            }
        }
    );
    console.log('Update result:', res);
    
    const u2 = await User.findById(user._id);
    console.log('Final status:', u2.appliedJobs[0].status);
    console.log('Final round:', u2.appliedJobs[0].currentRound);
    process.exit(0);
}
test();
