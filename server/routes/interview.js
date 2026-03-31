const express = require('express');
const { protect } = require('../middleware/auth');
const Job = require('../models/Job');
const RoundResult = require('../models/RoundResult');
const User = require('../models/User');
const interviewEngine = require('../services/interviewEngine');
const aiService = require('../services/aiService');
const router = express.Router();

// GET /api/interview/:jobId/questions - Get interview questions
router.get('/:jobId/questions', protect, async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in interview round
        if (job.currentRound !== 'interview') {
            return res.status(403).json({ message: 'Interview round is not currently active' });
        }

        const existing = await RoundResult.findOne({
            userId: req.user._id, jobId: job._id, round: 'interview'
        });
        if (existing) {
            return res.status(400).json({ message: 'Already completed', score: existing.score });
        }

        let questions = job.interviewQuestions;
        if (!questions || questions.length === 0) {
            // Get candidate skills from user profile
            const candidate = await User.findById(req.user._id);
            const skills = candidate.resumeData?.skills || [];
            
            // Try AI-generated questions first (unique per candidate)
            const aiQuestions = await aiService.generateInterviewQuestions(
                skills, job.title, job.requiredSkills, 5
            );
            
            if (aiQuestions) {
                questions = aiQuestions;
            } else {
                // Fallback to local question bank
                questions = interviewEngine.getQuestions('general', 5, skills);
            }
        }

        res.json({
            questions,
            timeLimit: job.timeLimit.interview,
            instructions: "Answer each question clearly. The AI will analyze your facial confidence, body language, answer quality, and communication skills through video analysis."
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/interview/:jobId/submit - Submit interview performance
router.post('/:jobId/submit', protect, async (req, res) => {
    try {
        const { answers, faceData } = req.body;
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in interview round
        if (job.currentRound !== 'interview') {
            return res.status(403).json({ message: 'Interview round is not currently active' });
        }

        const existing = await RoundResult.findOne({
            userId: req.user._id, jobId: job._id, round: 'interview'
        });
        if (existing) {
            return res.status(400).json({ message: 'Already submitted' });
        }

        // Try AI-powered evaluation first
        let analysis;
        const candidate = await User.findById(req.user._id);
        const skills = candidate.resumeData?.skills || [];

        // Evaluate each answer with AI
        let aiAnswerScores = [];
        if (answers && answers.length > 0) {
            for (const ans of answers) {
                if (ans.text && ans.text.trim().length > 0) {
                    const aiEval = await aiService.evaluateInterviewAnswer(
                        ans.question, ans.text, skills
                    );
                    if (aiEval) {
                        aiAnswerScores.push(aiEval);
                    }
                }
            }
        }

        if (aiAnswerScores.length > 0) {
            // Use AI scores combined with face data
            const avgAIScore = Math.round(
                aiAnswerScores.reduce((sum, s) => sum + s.overallScore, 0) / aiAnswerScores.length
            );
            const faceAnalysis = interviewEngine.analyzeFacialConfidence(faceData || {});
            const bodyAnalysis = interviewEngine.analyzeBodyLanguage(faceData || {});

            const finalScore = Math.round(avgAIScore * 0.6 + faceAnalysis * 0.2 + bodyAnalysis * 0.2);
            const aiFeedback = aiAnswerScores.map(s => s.feedback).filter(f => f).join(' ');

            analysis = {
                score: Math.min(Math.max(finalScore, 0), 100),
                details: {
                    facialConfidence: Math.round(faceAnalysis),
                    bodyLanguage: Math.round(bodyAnalysis),
                    answerQuality: avgAIScore,
                    communicationSkill: Math.round(
                        aiAnswerScores.reduce((s, a) => s + (a.clarity || 70), 0) / aiAnswerScores.length
                    ),
                    overallImpression: finalScore
                },
                feedback: aiFeedback || 'AI evaluation completed.'
            };
            console.log(`🤖 AI evaluated interview: ${finalScore}%`);
        } else {
            // Fallback to local NLP engine
            analysis = interviewEngine.analyzeInterview({
                answers: answers || [],
                faceData: faceData || {},
                duration: req.body.duration || 0
            });
        }

        const result = await RoundResult.create({
            userId: req.user._id,
            jobId: job._id,
            round: 'interview',
            score: analysis.score,
            details: analysis.details,
            feedback: analysis.feedback
        });

        await User.updateOne(
            { _id: req.user._id, 'appliedJobs.jobId': job._id },
            { $set: { 'appliedJobs.$.scores.interview': analysis.score } }
        );

        const io = req.app.get('io');
        if (io) {
            io.emit('interviewCompleted', { jobId: job._id, userId: req.user._id, score: analysis.score });
        }

        res.json({
            message: 'Interview submitted',
            score: analysis.score,
            details: analysis.details,
            feedback: analysis.feedback
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
