const express = require('express');
const { protect, adminOnly } = require('../middleware/auth');
const Job = require('../models/Job');
const User = require('../models/User');
const RoundResult = require('../models/RoundResult');
const eliminationEngine = require('../services/eliminationEngine');
const emailService = require('../services/emailService');
const router = express.Router();

// POST /api/jobs - Create a new job
router.post('/', protect, adminOnly, async (req, res) => {
    try {
        const job = await Job.create({
            ...req.body,
            createdBy: req.user._id
        });
        res.status(201).json(job);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/jobs - Get all jobs
router.get('/', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/jobs/:id - Get single job
router.get('/:id', async (req, res) => {
    try {
        const job = await Job.findById(req.params.id).populate('applicants', 'name email');
        if (!job) return res.status(404).json({ message: 'Job not found' });
        res.json(job);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/jobs/:id - Update job
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!job) return res.status(404).json({ message: 'Job not found' });
        res.json(job);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/jobs/:id - Delete job
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const job = await Job.findByIdAndDelete(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found' });
        res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// POST /api/jobs/:id/advance - Advance job to next round
router.post('/:id/advance', protect, adminOnly, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        const roundOrder = ['accepting', 'ats', 'aptitude', 'technical', 'gd', 'interview', 'completed'];
        const currentIndex = roundOrder.indexOf(job.currentRound);

        if (currentIndex >= roundOrder.length - 1) {
            return res.status(400).json({ message: 'All rounds completed' });
        }

        const round = job.currentRound;
        const nextRound = roundOrder[currentIndex + 1];

        console.log(`🚀 Advancing Job: ${job.title} | ${round} -> ${nextRound}`);

        // 1. Process elimination and send emails if it's an evaluating round
        let report = null;
        let processed = [];

        if (round !== 'accepting' && round !== 'completed') {
            const results = await RoundResult.find({ jobId: job._id, round }).populate('userId', 'name email');
            console.log(`📊 Found ${results.length} results for round ${round}`);

            if (results.length > 0) {
                // Calculate how many to keep
                const keepCount = eliminationEngine.calculateKeepCount(
                    results.length,
                    job.totalPositions,
                    job.eliminationRatios[round] || 50,
                    round
                );
                console.log(`⚖️ Elimination Rule: Keeping top ${keepCount} out of ${results.length}`);

                // Eliminate by score
                processed = eliminationEngine.eliminateByScore(
                    results.filter(r => r.userId).map(r => ({
                        userId: r.userId._id,
                        candidateName: r.userId?.name,
                        email: r.userId?.email,
                        score: r.score,
                        resultId: r._id
                    })),
                    keepCount
                );

                // Update results and user statuses
                for (const item of processed) {
                    try {
                        await RoundResult.findByIdAndUpdate(item.resultId, { passed: item.passed });

                        const userToUpdate = await User.findById(item.userId);
                        if (userToUpdate) {
                            const appliedJob = userToUpdate.appliedJobs.find(j => j.jobId.toString() === job._id.toString());
                            if (appliedJob) {
                                appliedJob.status = item.passed ? `${round}_passed` : `${round}_failed`;
                                appliedJob.currentRound = item.passed ? nextRound : round;
                                appliedJob.scores[round] = item.score;
                                userToUpdate.markModified('appliedJobs');
                            }
                            await userToUpdate.save();
                            console.log(`🧑‍💻 Advanced user ${userToUpdate.name} (${item.userId}) to ${item.passed ? 'passed' : 'failed'} for ${round}`);

                            // Send email to candidate
                            await emailService.sendRoundResult(userToUpdate, job.title, round, item.passed, item.score,
                                item.passed ? 'Congratulations! You have qualified for the next round.' : 'Thank you for your participation.');
                        }
                    } catch (err) {
                        console.error(`❌ Error processing candidate ${item.userId}:`, err.message);
                    }
                }
                
                // Also advance any candidates who were in this round but have no results (fail them by default as they likely missed the test)
                const missedUsers = await User.find({ 
                    'appliedJobs.jobId': job._id, 
                    'appliedJobs.currentRound': round,
                    'appliedJobs.status': { $ne: `${round}_passed`, $ne: `${round}_failed` }
                });

                for (const u of missedUsers) {
                    const app = u.appliedJobs.find(j => j.jobId.toString() === job._id.toString() && j.currentRound === round);
                    if (app) {
                        app.status = `${round}_failed`; // Treat as failed if they missed the test
                        app.feedback = 'Did not complete the evaluation round.';
                        u.markModified('appliedJobs');
                        await u.save();
                    }
                }

                // Generate and send admin report
                report = eliminationEngine.generateReport(processed, round);
                await emailService.sendAdminReport(process.env.ADMIN_EMAIL || req.user.email, job.title, round, processed);
            } else {
                // If no results for current round, advance qualified users' currentRound and status
                const usersToUpdate = await User.find({ 'appliedJobs.jobId': job._id, 'appliedJobs.currentRound': round });
                for (const u of usersToUpdate) {
                    const app = u.appliedJobs.find(j => j.jobId.toString() === job._id.toString() && j.currentRound === round);
                    if (app) {
                        app.currentRound = nextRound;
                        app.status = `${round}_passed`;
                        u.markModified('appliedJobs');
                        await u.save();
                    }
                }
            }
        }

        // 2. Advance the job round
        job.currentRound = nextRound;
        job.status = nextRound === 'completed' ? 'closed' : 'in_progress';
        await job.save();

        // 3. Emit socket events
        const io = req.app.get('io');
        if (io) {
            io.emit('roundAdvanced', { jobId: job._id, round: nextRound });
            if (report) {
                io.emit('roundProcessed', { jobId: job._id, round, report });
            }
        }

        res.json({ message: `Evaluated and advanced to ${nextRound}`, job, report });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/jobs/:id/process-round - Process elimination for current round
router.post('/:id/process-round', protect, adminOnly, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        const round = job.currentRound;
        if (round === 'accepting' || round === 'completed') {
            return res.status(400).json({ message: 'No active round to process' });
        }

        // Get all results for this round
        const results = await RoundResult.find({ jobId: job._id, round }).populate('userId', 'name email');

        if (results.length === 0) {
            return res.status(400).json({ message: 'No results to process for this round' });
        }

        // Calculate how many to keep
        const keepCount = eliminationEngine.calculateKeepCount(
            results.length,
            job.totalPositions,
            job.eliminationRatios[round] || 50,
            round
        );

        // Eliminate by score
        const processed = eliminationEngine.eliminateByScore(
            results.map(r => ({
                userId: r.userId._id,
                candidateName: r.userId.name,
                email: r.userId.email,
                score: r.score,
                resultId: r._id
            })),
            keepCount
        );

        // Determine the next round after processing
        const roundOrder = ['ats', 'aptitude', 'technical', 'gd', 'interview', 'completed'];
        const currentRoundIndex = roundOrder.indexOf(round);
        const nextRound = currentRoundIndex < roundOrder.length - 1 ? roundOrder[currentRoundIndex + 1] : 'completed';

        // Update results and user statuses
        for (const item of processed) {
            await RoundResult.findByIdAndUpdate(item.resultId, { passed: item.passed });

            const userToUpdate = await User.findById(item.userId);
            if (userToUpdate) {
                const appliedJob = userToUpdate.appliedJobs.find(j => j.jobId.toString() === job._id.toString());
                if (appliedJob) {
                    if (item.passed) {
                        appliedJob.status = `${round}_passed`;
                        appliedJob.currentRound = nextRound;
                        appliedJob.scores[round] = item.score;
                    } else {
                        appliedJob.status = `${round}_failed`;
                        appliedJob.scores[round] = item.score;
                    }
                    userToUpdate.markModified('appliedJobs');
                    await userToUpdate.save();
                }
            }

            // Send email to candidate
            const candidate = await User.findById(item.userId);
            if (candidate) {
                emailService.sendRoundResult(candidate, job.title, round, item.passed, item.score,
                    item.passed ? 'Congratulations! You have qualified for the next round.' : 'Thank you for your participation.');
            }
        }

        // Generate and send admin report
        const report = eliminationEngine.generateReport(processed, round);
        emailService.sendAdminReport(process.env.ADMIN_EMAIL, job.title, round, processed);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('roundProcessed', { jobId: job._id, round, report });
        }

        res.json({ message: `Round ${round} processed`, report, results: processed });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/jobs/:id/stats - Get job statistics
router.get('/:id/stats', protect, adminOnly, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        const rounds = ['ats', 'aptitude', 'technical', 'gd', 'interview'];
        const stats = {};

        for (const round of rounds) {
            const results = await RoundResult.find({ jobId: job._id, round });
            const roundOrder = ['accepting', 'ats', 'aptitude', 'technical', 'gd', 'interview', 'completed'];
            const roundIndex = roundOrder.indexOf(round);
            const currentRoundIndex = roundOrder.indexOf(job.currentRound);

            const passed = results.filter(r => 
                r.passed === true || (r.passed === undefined && (r.score || 0) >= 50)
            ).length;
            
            let failed = 0;
            let pending = 0;

            if (roundIndex < currentRoundIndex) {
                // This is a past round - anyone who didn't pass failed
                failed = results.length - passed;
            } else if (roundIndex === currentRoundIndex) {
                // This is the current round
                failed = results.filter(r => 
                    r.passed === false || (r.passed === undefined && r.score !== undefined && r.score < 50)
                ).length;
                pending = Math.max(0, results.length - (passed + failed));
            } else {
                // Future round - everything is pending
                pending = results.length;
            }

            stats[round] = {
                total: results.length,
                passed,
                failed,
                pending,
                avgScore: results.length > 0
                    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
                    : 0
            };
        }

        const progression = eliminationEngine.calculateRoundProgression(
            job.applicants.length,
            job.totalPositions,
            job.eliminationRatios
        );

        res.json({ stats, progression, totalApplicants: job.applicants.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
