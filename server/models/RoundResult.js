const mongoose = require('mongoose');

const roundResultSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    round: { 
        type: String, 
        enum: ['ats', 'aptitude', 'technical', 'gd', 'interview'],
        required: true 
    },
    score: { type: Number, required: true },
    maxScore: { type: Number, default: 100 },
    percentage: { type: Number },
    passed: { type: Boolean, default: false },
    details: {
        // ATS details
        skillMatch: { type: Number },
        experienceMatch: { type: Number },
        educationMatch: { type: Number },
        keywordScore: { type: Number },
        
        // Aptitude details
        totalQuestions: { type: Number },
        correctAnswers: { type: Number },
        timeTaken: { type: Number },
        
        // Technical details
        codeScore: { type: Number },
        conceptScore: { type: Number },
        
        // GD details
        confidenceScore: { type: Number },
        responseSpeed: { type: Number },
        contentQuality: { type: Number },
        participationLevel: { type: Number },
        speakingTime: { type: Number },
        
        // Interview details
        facialConfidence: { type: Number },
        bodyLanguage: { type: Number },
        answerQuality: { type: Number },
        communicationSkill: { type: Number },
        overallImpression: { type: Number }
    },
    feedback: { type: String },
    completedAt: { type: Date, default: Date.now }
});

roundResultSchema.pre('save', function() {
    if (this.score && this.maxScore) {
        this.percentage = Math.round((this.score / this.maxScore) * 100);
    }
});

roundResultSchema.index({ jobId: 1, round: 1 });
roundResultSchema.index({ userId: 1, jobId: 1 });

module.exports = mongoose.model('RoundResult', roundResultSchema);
