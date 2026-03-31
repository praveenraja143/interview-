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

        // 1. Process elimination and send emails if it's an evaluating round
        let report = null;
        let processed = [];

        if (round !== 'accepting' && round !== 'completed') {
            const results = await RoundResult.find({ jobId: job._id, round }).populate('userId', 'name email');

            if (results.length > 0) {
                // Calculate how many to keep
                const keepCount = eliminationEngine.calculateKeepCount(
                    results.length,
                    job.totalPositions,
                    job.eliminationRatios[round] || 50,
                    round
                );

                // Eliminate by score
                processed = eliminationEngine.eliminateByScore(
                    results.map(r => ({
                        userId: r.userId._id,
                        candidateName: r.userId.name,
                        email: r.userId.email,
                        score: r.score,
                        resultId: r._id
                    })),
                    keepCount
                );

                // Update results and user statuses
                for (const item of processed) {
                    await RoundResult.findByIdAndUpdate(item.resultId, { passed: item.passed });

                    if (item.passed) {
                        await User.updateOne(
                            { _id: item.userId, 'appliedJobs.jobId': job._id },
                            {
                                $set: {
                                    'appliedJobs.$.status': `${round}_passed`,
                                    'appliedJobs.$.currentRound': nextRound,
                                    [`appliedJobs.$.scores.${round}`]: item.score
                                }
                            }
                        );
                    } else {
                        await User.updateOne(
                            { _id: item.userId, 'appliedJobs.jobId': job._id },
                            {
                                $set: {
                                    'appliedJobs.$.status': `${round}_failed`,
                                    [`appliedJobs.$.scores.${round}`]: item.score
                                }
                            }
                        );
                    }

                    // Send email to candidate
                    const candidate = await User.findById(item.userId);
                    if (candidate) {
                        emailService.sendRoundResult(candidate, job.title, round, item.passed, item.score,
                            item.passed ? 'Congratulations! You have qualified for the next round.' : 'Thank you for your participation.');
                    }
                }
                
                // Generate and send admin report
                report = eliminationEngine.generateReport(processed, round);
                emailService.sendAdminReport(process.env.ADMIN_EMAIL, job.title, round, processed);
            } else {
                // If no results for current round, advance qualified users' currentRound and status
                await User.updateMany(
                    { 'appliedJobs.jobId': job._id, 'appliedJobs.currentRound': round },
                    { 
                        $set: { 
                            'appliedJobs.$.currentRound': nextRound,
                            'appliedJobs.$.status': `${round}_passed`
                        } 
                    }
                );
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

            // Update user's job application status AND advance currentRound for passed candidates
            if (item.passed) {
                await User.updateOne(
                    { _id: item.userId, 'appliedJobs.jobId': job._id },
                    {
                        $set: {
                            'appliedJobs.$.status': `${round}_passed`,
                            'appliedJobs.$.currentRound': nextRound,
                            [`appliedJobs.$.scores.${round}`]: item.score
                        }
                    }
                );
            } else {
                await User.updateOne(
                    { _id: item.userId, 'appliedJobs.jobId': job._id },
                    {
                        $set: {
                            'appliedJobs.$.status': `${round}_failed`,
                            [`appliedJobs.$.scores.${round}`]: item.score
                        }
                    }
                );
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
            stats[round] = {
                total: results.length,
                passed: results.filter(r => r.passed).length,
                failed: results.filter(r => !r.passed).length,
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
