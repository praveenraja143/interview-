// ATS Engine - Automated Resume Screening (High Accuracy Version)
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

class ATSEngine {
    constructor() {
        this.weights = {
            skills: 0.50,        // Skills are most important
            experience: 0.30,    // Experience is second
            education: 0.15,     // Education is third
            keywords: 0.05       // Generic keywords are least important
        };
    }

    analyzeResume(resumeText, job) {
        const text = resumeText.toLowerCase();
        
        // 1. Basic Local Validation: Is this actually a resume?
        const isResume = this.validateIsResume(text);
        if (!isResume) {
            return {
                score: 5, // Lower than before
                details: { skillMatch: 0, experienceMatch: 0, educationMatch: 0, keywordScore: 0 },
                feedback: "⚠️ This document does not follow a standard professional resume/CV structure. Please ensure you are uploading your CV."
            };
        }

        const tokens = tokenizer.tokenize(text);

        // 2. Strict Scoring
        const skillScore = this.calculateSkillMatch(text, job.requiredSkills);
        const experienceScore = this.calculateExperienceMatch(text, job.experience);
        const educationScore = this.calculateEducationMatch(text, job.education);
        const keywordScore = this.calculateKeywordScore(text, job);

        // Calculate weighted score
        let totalScore = Math.round(
            (skillScore * this.weights.skills) +
            (experienceScore * this.weights.experience) +
            (educationScore * this.weights.education) +
            (keywordScore * this.weights.keywords)
        );

        // Harsh penalty if zero skills match
        if (skillScore === 0) {
            totalScore = Math.round(totalScore * 0.5); // Chop in half if no skills
        }

        return {
            score: Math.min(totalScore, 100),
            details: {
                skillMatch: Math.round(skillScore),
                experienceMatch: Math.round(experienceScore),
                educationMatch: Math.round(educationScore),
                keywordScore: Math.round(keywordScore)
            },
            feedback: this.generateFeedback(skillScore, experienceScore, educationScore, keywordScore)
        };
    }

    validateIsResume(text) {
        // Essential resume markers
        const essentialMarkers = [
            /\bexperience\b/i, /\beducation\b/i, /\bskills\b/i, 
            /\bprojects\b/i, /\bobjective\b/i, /\bsummary\b/i,
            /\bphone\b/i, /\bemail\b/i, /\bcontact\b/i,
            /\buniversity\b/i, /\bcollege\b/i, /\baddress\b/i
        ];
        
        let foundCount = 0;
        for (const marker of essentialMarkers) {
            if (marker.test(text)) foundCount++;
        }

        // Must have at least 5 markers to be considered a real professional resume
        return foundCount >= 5;
    }

    calculateSkillMatch(text, requiredSkills) {
        if (!requiredSkills || requiredSkills.length === 0) return 0;
        
        let matched = 0;
        for (const skill of requiredSkills) {
            const cleanSkill = skill.trim();
            if (!cleanSkill) continue;

            // Use exact word boundary matching for high accuracy
            // Prevents "C" matching "Cat" or "React" matching "Reaction"
            const escapedSkill = cleanSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedSkill}\\b`, 'i');
            
            if (regex.test(text)) {
                matched++;
            }
        }

        return (matched / requiredSkills.length) * 100;
    }

    calculateExperienceMatch(text, requiredExperience) {
        if (!requiredExperience) requiredExperience = 0;
        
        const expPatterns = [
            /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:experience|exp)/gi,
            /experience\s*:?\s*(\d+)\+?\s*(?:years?|yrs?)/gi,
            /(\d+)[\-\s]years?\s*at\s*/gi,
            /total\s*experience\s*:?\s*(\d+)/gi
        ];

        let maxExp = 0;
        let matchFound = false;
        for (const pattern of expPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                matchFound = true;
                const exp = parseInt(match[1]);
                if (exp > maxExp && exp < 50) maxExp = exp;
            }
        }

        if (!matchFound) return 0; // Return 0 instead of baseline if none found
        if (maxExp >= requiredExperience) return 100;
        return (maxExp / requiredExperience) * 100;
    }

    calculateEducationMatch(text, requiredEducation) {
        // Strict mapping for education
        const degrees = {
            phd: ['phd', 'ph.d', 'doctorate', 'doctor of philosophy'],
            master: ['master', 'mtech', 'm.tech', ' mba ', ' mca ', ' ms ', 'm.e', 'master of'],
            bachelor: ['bachelor', 'btech', 'b.tech', ' be ', 'b.e', ' bca ', ' bsc ', ' b.sc ', ' ba ', ' b.a ', 'bba', 'degree'],
            diploma: ['diploma', 'polytechnic'],
            school: ['school', 'higher secondary', 'hsc', 'sslc', '12th', '10th']
        };

        let candidateLevel = -1;
        const levels = ['school', 'diploma', 'bachelor', 'master', 'phd'];
        
        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const keywords = degrees[level];
            for (const key of keywords) {
                const regex = key.includes(' ') ? new RegExp(key, 'i') : new RegExp(`\\b${key.trim()}\\b`, 'i');
                if (regex.test(text)) {
                    candidateLevel = Math.max(candidateLevel, i);
                    break;
                }
            }
        }

        if (!requiredEducation) return 50; // Partial score if job education not defined
        
        let requiredLevel = 2; // Default to bachelor
        const reqStr = requiredEducation.toLowerCase();
        if (reqStr.includes('phd') || reqStr.includes('doctor')) requiredLevel = 4;
        else if (reqStr.includes('master') || reqStr.includes('mca') || reqStr.includes('mba')) requiredLevel = 3;
        else if (reqStr.includes('diploma')) requiredLevel = 1;
        else if (reqStr.includes('school')) requiredLevel = 0;

        if (candidateLevel === -1) return 0;
        if (candidateLevel >= requiredLevel) return 100;
        return (candidateLevel / requiredLevel) * 100;
    }

    calculateKeywordScore(text, job) {
        // Only look for job-specific relevant keywords
        const keywords = [
            ...job.title.toLowerCase().split(/\s+/).filter(w => w.length > 2)
        ];

        if (keywords.length === 0) return 20;

        let matched = 0;
        for (const keyword of keywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(text)) matched++;
        }

        return (matched / keywords.length) * 100;
    }

    generateFeedback(skillScore, experienceScore, educationScore, keywordScore) {
        if (skillScore < 20) return "❌ Skill match is critical. Your technical skills do not align with the job requirements.";
        if (experienceScore < 30) return "⚠️ Your years of experience appear to be significantly lower than required.";
        
        const feedbacks = [];
        if (skillScore >= 80) feedbacks.push("Excellent skill match!");
        else if (skillScore >= 50) feedbacks.push("Good skill alignment.");
        
        if (experienceScore >= 80) feedbacks.push("Solid experience profile.");
        
        if (educationScore >= 80) feedbacks.push("Education criteria satisfied.");
        
        return feedbacks.length > 0 ? feedbacks.join(' ') : "Profile partially matches requirements. Focus on missing skills.";
    }

    rankCandidates(candidates, keepCount) {
        const sorted = [...candidates].sort((a, b) => b.score - a.score);
        return sorted.map((c, i) => ({
            ...c,
            rank: i + 1,
            passed: i < keepCount
        }));
    }
}

module.exports = new ATSEngine();
