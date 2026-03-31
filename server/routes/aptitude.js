const express = require('express');
const { protect } = require('../middleware/auth');
const Job = require('../models/Job');
const User = require('../models/User');
const RoundResult = require('../models/RoundResult');
const router = express.Router();

// GET /api/aptitude/:jobId/questions - Get aptitude questions
router.get('/:jobId/questions', protect, async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in aptitude round
        if (job.currentRound !== 'aptitude') {
            return res.status(403).json({ message: 'Aptitude round is not currently active for this job' });
        }

        // Check if user qualified for this round
        const user = await User.findById(req.user._id);
        const application = user.appliedJobs.find(j => j.jobId.toString() === job._id.toString());
        if (!application) return res.status(403).json({ message: 'You have not applied for this job' });

        // Check if candidate passed ATS round
        if (application.currentRound !== 'aptitude' || !application.status.includes('passed')) {
            return res.status(403).json({ message: 'You have not qualified for the aptitude round' });
        }

        // Check if already completed
        const existingResult = await RoundResult.findOne({
            userId: user._id, jobId: job._id, round: 'aptitude'
        });
        if (existingResult) {
            return res.status(400).json({ message: 'You have already completed this round', score: existingResult.score });
        }

        let questions = job.aptitudeQuestions;
        if (!questions || questions.length === 0) {
            questions = generateDefaultAptitudeQuestions();
        }

        // Send questions without correct answers
        const safeQuestions = questions.map((q, i) => ({
            id: i,
            question: q.question,
            options: q.options,
            difficulty: q.difficulty
        }));

        res.json({
            questions: safeQuestions,
            timeLimit: job.timeLimit.aptitude,
            totalQuestions: safeQuestions.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/aptitude/:jobId/submit - Submit aptitude answers  
router.post('/:jobId/submit', protect, async (req, res) => {
    try {
        const { answers, timeTaken } = req.body;
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in aptitude round
        if (job.currentRound !== 'aptitude') {
            return res.status(403).json({ message: 'Aptitude round is not currently active' });
        }

        // Check if already submitted
        const existing = await RoundResult.findOne({
            userId: req.user._id, jobId: job._id, round: 'aptitude'
        });
        if (existing) {
            return res.status(400).json({ message: 'Already submitted' });
        }

        let questions = job.aptitudeQuestions;
        if (!questions || questions.length === 0) {
            questions = generateDefaultAptitudeQuestions();
        }

        // Grade answers
        let correct = 0;
        for (let i = 0; i < questions.length; i++) {
            if (answers[i] !== undefined && answers[i] === questions[i].correctAnswer) {
                correct++;
            }
        }

        const score = Math.round((correct / questions.length) * 100);

        // Save result
        const result = await RoundResult.create({
            userId: req.user._id,
            jobId: job._id,
            round: 'aptitude',
            score,
            details: {
                totalQuestions: questions.length,
                correctAnswers: correct,
                timeTaken: timeTaken || 0
            },
            feedback: `Answered ${correct}/${questions.length} correctly (${score}%)`
        });

        // Update user scores
        await User.updateOne(
            { _id: req.user._id, 'appliedJobs.jobId': job._id },
            { $set: { 'appliedJobs.$.scores.aptitude': score } }
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('aptitudeCompleted', {
                jobId: job._id,
                userId: req.user._id,
                score
            });
        }

        res.json({
            message: 'Aptitude test submitted',
            score,
            passed: score >= 50,
            correct,
            total: questions.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

function generateDefaultAptitudeQuestions() {
    return [
        {
            question: "If a train travels 360 km in 4 hours, what is its speed in km/h?",
            options: ["80 km/h", "90 km/h", "100 km/h", "70 km/h"],
            correctAnswer: 1,
            difficulty: "easy"
        },
        {
            question: "What comes next in the series: 2, 6, 18, 54, ?",
            options: ["108", "162", "148", "180"],
            correctAnswer: 1,
            difficulty: "medium"
        },
        {
            question: "A shopkeeper sells an item at 20% profit. If cost price is Rs.500, what is selling price?",
            options: ["Rs.550", "Rs.600", "Rs.650", "Rs.700"],
            correctAnswer: 1,
            difficulty: "easy"
        },
        {
            question: "If 5 workers can complete a task in 12 days, how many days will 10 workers take?",
            options: ["24 days", "6 days", "8 days", "10 days"],
            correctAnswer: 1,
            difficulty: "easy"
        },
        {
            question: "Which number is the odd one out: 3, 5, 11, 14, 17, 21?",
            options: ["__(21)", "14", "__(3)", "11"],
            correctAnswer: 1,
            difficulty: "medium"
        },
        {
            question: "A clock shows 3:15. What is the angle between the hour and minute hands?",
            options: ["0°", "7.5°", "15°", "22.5°"],
            correctAnswer: 1,
            difficulty: "hard"
        },
        {
            question: "If APPLE is coded as 50, what is MANGO coded as?",
            options: ["45", "57", "52", "60"],
            correctAnswer: 1,
            difficulty: "medium"
        },
        {
            question: "The average of 5 numbers is 20. If one number is removed, average becomes 15. What is the removed number?",
            options: ["35", "40", "25", "30"],
            correctAnswer: 1,
            difficulty: "medium"
        },
        {
            question: "In a race of 1000m, A beats B by 50m and B beats C by 40m. By how much does A beat C?",
            options: ["88m", "90m", "92m", "85m"],
            correctAnswer: 0,
            difficulty: "hard"
        },
        {
            question: "Complete the pattern: 1, 1, 2, 3, 5, 8, ?",
            options: ["11", "13", "15", "10"],
            correctAnswer: 1,
            difficulty: "easy"
        }
    ];
}

module.exports = router;
