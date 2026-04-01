const mongoose = require('mongoose');
const Job = require('./server/models/Job');
const User = require('./server/models/User');

async function test() {
    await mongoose.connect('mongodb+srv://ppk52621_db_user:HtBDwkPXPgJNrnxv@interview.afdccwt.mongodb.net/ai_interview?retryWrites=true&w=majority');
    const job = await Job.findOne({ title: 'Python developer' });
    const user = await User.findById(job.applicants[0]);
    console.log('Query:', { _id: user._id, 'appliedJobs.jobId': job._id });
    
    let res = await User.updateOne(
        { _id: user._id, 'appliedJobs.jobId': job._id },
        {
            $set: {
                'appliedJobs.$.status': 'ats_passed',
                'appliedJobs.$.currentRound': 'aptitude'
            }
        }
    );
    console.log('Result:', res);
    const u = await User.findById(job.applicants[0]);
    console.log('User status after:', u.appliedJobs[0].status);
    process.exit(0);
}
test();
