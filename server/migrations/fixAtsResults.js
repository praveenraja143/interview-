// Migration script to fix existing ATS results
// Run this once to update all existing ATS results with correct pass/fail status

require('dotenv').config();
const mongoose = require('mongoose');
const RoundResult = require('./models/RoundResult');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/interview-platform';

async function fixAtsResults() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get all ATS results
        const atsResults = await RoundResult.find({ round: 'ats' });
        console.log(`Found ${atsResults.length} ATS results to process`);

        let updatedCount = 0;

        for (const result of atsResults) {
            // Determine pass/fail based on score (50% threshold)
            const passed = result.score >= 50;

            // Update RoundResult
            if (result.passed !== passed) {
                result.passed = passed;
                await result.save();

                // Update User's application status
                const user = await User.findById(result.userId);
                if (user) {
                    const appliedJob = user.appliedJobs.find(
                        j => j.jobId.toString() === result.jobId.toString()
                    );
                    if (appliedJob) {
                        appliedJob.status = passed ? 'ats_passed' : 'ats_failed';
                        appliedJob.scores.ats = result.score;
                        user.markModified('appliedJobs');
                        await user.save();
                        console.log(`Updated user ${user.name}: score=${result.score}, status=${appliedJob.status}`);
                    }
                }
                updatedCount++;
            }
        }

        console.log(`\n✅ Migration complete! Updated ${updatedCount} records.`);

        // Show summary
        const passedCount = await RoundResult.countDocuments({ round: 'ats', passed: true });
        const failedCount = await RoundResult.countDocuments({ round: 'ats', passed: false });
        console.log(`Summary: ${passedCount} passed, ${failedCount} failed`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

fixAtsResults();