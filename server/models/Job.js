const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    company: { type: String, default: 'Our Company' },
    requiredSkills: [String],
    experience: { type: Number, default: 0 },
    education: { type: String },
    totalPositions: { type: Number, required: true },
    maxApplicants: { type: Number, default: 100 },
    eliminationRatios: {
        ats: { type: Number, default: 50 },         // Keep top 50% after ATS
        aptitude: { type: Number, default: 60 },     // Keep top 60% after aptitude
        technical: { type: Number, default: 50 },    // Keep top 50% after technical
        gd: { type: Number, default: 50 },           // Keep top 50% after GD
        interview: { type: Number, default: 100 }    // Final selection
    },
    status: { type: String, enum: ['open', 'in_progress', 'closed'], default: 'open' },
    currentRound: { 
        type: String, 
        enum: ['accepting', 'ats', 'aptitude', 'technical', 'gd', 'interview', 'completed'],
        default: 'accepting'
    },
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    selectedCandidates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    aptitudeQuestions: [{
        question: String,
        options: [String],
        correctAnswer: Number,
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
    }],
    technicalQuestions: [{
        question: String,
        options: [String],
        correctAnswer: Number,
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
        topic: String
    }],
    gdTopics: [String],
    interviewQuestions: [String],
    timeLimit: {
        aptitude: { type: Number, default: 30 },    // minutes
        technical: { type: Number, default: 45 },   // minutes
        gd: { type: Number, default: 15 },          // minutes
        interview: { type: Number, default: 20 }    // minutes
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Job', jobSchema);
