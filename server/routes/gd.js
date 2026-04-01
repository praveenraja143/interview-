const express = require('express');
const { protect } = require('../middleware/auth');
const Job = require('../models/Job');
const RoundResult = require('../models/RoundResult');
const User = require('../models/User');
const gdEngine = require('../services/gdEngine');
const aiService = require('../services/aiService');
const router = express.Router();

// GET /api/gd/:jobId/topic - Get GD topic
router.get('/:jobId/topic', protect, async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in GD round
        if (job.currentRound !== 'gd') {
            return res.status(403).json({ message: 'Group Discussion round is not currently active' });
        }

        const existing = await RoundResult.findOne({
            userId: req.user._id, jobId: job._id, round: 'gd'
        });
        if (existing) {
            return res.status(400).json({ message: 'Already completed GD round', score: existing.score });
        }

        let topics = job.gdTopics;
        if (!topics || topics.length === 0) {
            topics = [
                "Should AI replace human jobs?",
                "Is remote work better than office work?",
                "Impact of social media on society",
                "Is technology making us less creative?",
                "Should coding be mandatory in schools?",
                "Digital privacy vs national security",
                "Climate change and corporate responsibility"
            ];
        }

        const topic = topics[Math.floor(Math.random() * topics.length)];

        res.json({
            topic,
            timeLimit: job.timeLimit.gd,
            instructions: "Express your views on the given topic. The AI will analyze your speaking confidence, response speed, content quality, and participation level."
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/gd/:jobId/submit - Submit GD performance
router.post('/:jobId/submit', protect, async (req, res) => {
    try {
        const { speechText, duration, responseTime, totalSessionTime, disqualified } = req.body;
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in GD round
        if (job.currentRound !== 'gd') {
            return res.status(403).json({ message: 'Group Discussion round is not currently active' });
        }

        const existing = await RoundResult.findOne({
            userId: req.user._id, jobId: job._id, round: 'gd'
        });
        if (existing) {
            return res.status(400).json({ message: 'Already submitted' });
        }

        // Try AI-powered evaluation first
        let analysis;
        const aiGDEval = await aiService.evaluateGDSpeech(
            req.body.topic || 'General Discussion', speechText
        );

        if (aiGDEval && aiGDEval.overallScore !== undefined) {
            analysis = {
                score: aiGDEval.overallScore,
                details: {
                    contentQuality: aiGDEval.contentQuality || 70,
                    communication: aiGDEval.communication || 70,
                    relevance: aiGDEval.relevance || 70,
                    leadership: aiGDEval.leadership || 60,
                    confidence: aiGDEval.confidence || 70
                },
                feedback: aiGDEval.feedback || 'AI evaluation completed.'
            };
            console.log(`🤖 AI evaluated GD: ${analysis.score}%`);
        } else {
            // Fallback to local NLP engine
            analysis = gdEngine.analyzeSpeech({
                text: speechText,
                duration: duration || 0,
                responseTime: responseTime || 5,
                totalSessionTime: totalSessionTime || 900
            });
        }
        
        // Handle disqualification
        if (disqualified) {
            analysis = {
                score: 0,
                details: {
                    contentQuality: 0,
                    communication: 0,
                    relevance: 0,
                    leadership: 0,
                    confidence: 0,
                    participationLevel: 0,
                    speakingTime: 0
                },
                feedback: 'Disqualified due to malpractice (tab switching or other violations).'
            };
            console.log('🚫 DISQUALIFIED: GD score set to 0');
        }

        const result = await RoundResult.create({
            userId: req.user._id,
            jobId: job._id,
            round: 'gd',
            score: analysis.score,
            details: analysis.details,
            feedback: analysis.feedback
        });

        const user = await User.findById(req.user._id);
        const application = user.appliedJobs.find(j => j.jobId.toString() === job._id.toString());
        if (application) {
            application.scores.gd = analysis.score;
            application.status = 'gd_completed';
            await user.save();
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('gdCompleted', { jobId: job._id, userId: req.user._id, score: analysis.score });
        }

        res.json({
            message: 'GD round submitted',
            score: analysis.score,
            passed: analysis.score >= 50,
            details: analysis.details,
            feedback: analysis.feedback
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
