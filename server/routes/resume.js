const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Job = require('../models/Job');
const RoundResult = require('../models/RoundResult');
const atsEngine = require('../services/atsEngine');
const emailService = require('../services/emailService');
const router = express.Router();

// Configure multer for resume uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `resume_${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'));
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// POST /api/resume/upload/:jobId - Upload resume and apply for job
router.post('/upload/:jobId', protect, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Please upload a resume file' });
        }

        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });
        if (job.currentRound !== 'accepting') {
            return res.status(400).json({ message: 'Job is no longer accepting applications' });
        }

        // Check applicant limit
        if (job.applicants.length >= job.maxApplicants) {
            return res.status(400).json({ message: `Application limit reached. This job accepts only ${job.maxApplicants} applicants.` });
        }

        // Check if already applied
        const user = await User.findById(req.user._id);
        const alreadyApplied = user.appliedJobs.find(
            j => j.jobId.toString() === job._id.toString()
        );
        if (alreadyApplied) {
            return res.status(400).json({ message: 'You have already applied for this job' });
        }

        // Parse resume
        let resumeText = '';
        const filePath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();

        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            
            try {
                // Support for pdf-parse v2.4.5+ (mehmet-kozan)
                const PDFParseClass = pdfParse.PDFParse || (typeof pdfParse === 'function' ? null : pdfParse.default);
                
                if (PDFParseClass && typeof PDFParseClass === 'function') {
                    const parser = new PDFParseClass({ data: dataBuffer });
                    const result = await parser.getText();
                    resumeText = result.text;
                    if (parser.destroy) await parser.destroy();
                } else if (typeof pdfParse === 'function') {
                    // Support for older pdf-parse (v1.1.1)
                    const data = await pdfParse(dataBuffer);
                    resumeText = data.text;
                } else {
                    throw new Error('No valid PDF parser found');
                }
            } catch (err) {
                console.error('PDF Parse Error:', err);
                resumeText = "PDF parsing failed. Please ensure the file is not corrupted.";
            }
        } else if (ext === '.txt') {
            resumeText = fs.readFileSync(filePath, 'utf-8');
        } else {
            // For DOC/DOCX, try to read as text
            try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ path: filePath });
                resumeText = result.value;
            } catch (e) {
                resumeText = await fs.promises.readFile(filePath, 'utf-8');
            }
        }

        // ATS Analysis
        const atsResult = atsEngine.analyzeResume(resumeText, job);

        // Extract basic info from resume
        const skills = extractSkills(resumeText);
        const experience = extractExperience(resumeText);

        // Update user
        user.resumeFile = req.file.filename;
        user.resumeData = {
            skills,
            experience,
            rawText: resumeText.substring(0, 5000),
            score: atsResult.score
        };
        user.appliedJobs.push({
            jobId: job._id,
            status: 'applied',
            currentRound: 'ats',
            scores: { ats: atsResult.score }
        });
        await user.save();

        // Add to job applicants
        job.applicants.push(user._id);
        await job.save();

        // Save ATS result
        await RoundResult.create({
            userId: user._id,
            jobId: job._id,
            round: 'ats',
            score: atsResult.score,
            details: atsResult.details,
            feedback: atsResult.feedback
        });

        // Send welcome email
        emailService.sendWelcome(user, job.title);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('newApplication', { 
                jobId: job._id, 
                candidateName: user.name,
                atsScore: atsResult.score 
            });
        }

        res.status(201).json({
            message: 'Resume uploaded and analyzed successfully',
            atsScore: atsResult.score,
            details: atsResult.details,
            feedback: atsResult.feedback
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Helper functions
function extractSkills(text) {
    const commonSkills = [
        'javascript', 'python', 'java', 'c++', 'react', 'node', 'angular', 'vue',
        'html', 'css', 'sql', 'mongodb', 'aws', 'docker', 'git', 'typescript',
        'machine learning', 'data science', 'ai', 'deep learning', 'tensorflow',
        'communication', 'leadership', 'teamwork', 'problem solving', 'management',
        'excel', 'powerpoint', 'marketing', 'sales', 'finance', 'analytics',
        'php', 'ruby', 'swift', 'kotlin', 'flutter', 'django', 'flask', 'spring',
        'linux', 'devops', 'kubernetes', 'ci/cd', 'agile', 'scrum'
    ];

    const found = [];
    const lowerText = text.toLowerCase();
    for (const skill of commonSkills) {
        if (lowerText.includes(skill)) found.push(skill);
    }
    return found;
}

function extractExperience(text) {
    const patterns = [
        /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:experience|exp)/gi,
        /experience\s*:?\s*(\d+)\+?\s*(?:years?|yrs?)/gi
    ];

    let maxExp = 0;
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const exp = parseInt(match[1]);
            if (exp > maxExp && exp < 50) maxExp = exp;
        }
    }
    return maxExp;
}

module.exports = router;
