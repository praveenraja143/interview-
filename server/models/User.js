const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, enum: ['candidate', 'admin'], default: 'candidate' },
    resumeFile: { type: String },
    resumeData: {
        skills: [String],
        experience: Number,
        education: String,
        rawText: String,
        score: Number
    },
    appliedJobs: [{
        jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
        status: { 
            type: String, 
            enum: ['applied', 'ats_passed', 'ats_failed', 'aptitude_passed', 'aptitude_failed', 
                   'technical_passed', 'technical_failed', 'gd_passed', 'gd_failed', 
                   'interview_passed', 'interview_failed', 'selected', 'rejected'],
            default: 'applied'
        },
        currentRound: { 
            type: String, 
            enum: ['ats', 'aptitude', 'technical', 'gd', 'interview', 'completed'],
            default: 'ats'
        },
        scores: {
            ats: { type: Number, default: 0 },
            aptitude: { type: Number, default: 0 },
            technical: { type: Number, default: 0 },
            gd: { type: Number, default: 0 },
            interview: { type: Number, default: 0 },
            total: { type: Number, default: 0 }
        },
        appliedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.index({ email: 1 });
userSchema.index({ 'appliedJobs.jobId': 1 });
userSchema.index({ 'appliedJobs.status': 1 });

module.exports = mongoose.model('User', userSchema);
