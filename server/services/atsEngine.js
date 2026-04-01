// ATS Engine - Automated Resume Screening
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

class ATSEngine {
    constructor() {
        this.weights = {
            skills: 0.40,
            experience: 0.25,
            education: 0.20,
            keywords: 0.15
        };
    }

    analyzeResume(resumeText, job) {
        const text = resumeText.toLowerCase();
        
        // 1. Basic Local Validation: Is this actually a resume?
        const isResume = this.validateIsResume(text);
        if (!isResume) {
            return {
                score: 10,
                details: { skillMatch: 0, experienceMatch: 0, educationMatch: 0, keywordScore: 10 },
                feedback: "⚠️ Detected as non-resume content. Please upload a professional CV/Resume."
            };
        }

        const tokens = tokenizer.tokenize(text);

        const skillScore = this.calculateSkillMatch(tokens, job.requiredSkills);
        const experienceScore = this.calculateExperienceMatch(text, job.experience);
        const educationScore = this.calculateEducationMatch(text, job.education);
        const keywordScore = this.calculateKeywordScore(text, job);

        const totalScore = Math.round(
            (skillScore * this.weights.skills) +
            (experienceScore * this.weights.experience) +
            (educationScore * this.weights.education) +
            (keywordScore * this.weights.keywords)
        );

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
        // Look for common resume sections
        const sections = [
            'experience', 'education', 'skills', 'projects', 'objective', 
            'summary', 'employment', 'certificates', 'languages', 'contact',
            'email', 'phone', 'university', 'college', 'school'
        ];
        
        let foundCount = 0;
        for (const section of sections) {
            if (text.includes(section)) foundCount++;
        }

        // A typical task PDF might have "skills" or "projects" but rarely "experience" + "education" + "contact info"
        // We require at least 3-4 section markers to be considered a resume locally
        return foundCount >= 4;
    }

    calculateSkillMatch(tokens, requiredSkills) {
        if (!requiredSkills || requiredSkills.length === 0) return 50;
        
        let matched = 0;
        const tokenSet = new Set(tokens);
        
        for (const skill of requiredSkills) {
            const skillTokens = skill.toLowerCase().split(/[\s,.-]+/);
            const isMatched = skillTokens.some(st => {
                return tokenSet.has(st) || tokens.some(t => {
                    return natural.JaroWinklerDistance(t, st) > 0.85;
                });
            });
            if (isMatched) matched++;
        }

        return (matched / requiredSkills.length) * 100;
    }

    calculateExperienceMatch(text, requiredExperience) {
        if (!requiredExperience || requiredExperience === 0) return 70;
        
        const expPatterns = [
            /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:experience|exp)/gi,
            /experience\s*:?\s*(\d+)\+?\s*(?:years?|yrs?)/gi,
            /(\d+)\+?\s*(?:years?|yrs?)\s*(?:in|of|working)/gi
        ];

        let maxExp = 0;
        for (const pattern of expPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const exp = parseInt(match[1]);
                if (exp > maxExp && exp < 50) maxExp = exp;
            }
        }

        if (maxExp === 0) return 30;
        if (maxExp >= requiredExperience) return 100;
        return (maxExp / requiredExperience) * 100;
    }

    calculateEducationMatch(text, requiredEducation) {
        if (!requiredEducation) return 60;
        
        const educationLevels = {
            'phd': 100, 'doctorate': 100, 'ph.d': 100,
            'master': 90, 'mba': 90, 'mtech': 90, 'ms': 90, 'mca': 90, 'me': 85,
            'bachelor': 80, 'btech': 80, 'be': 80, 'bca': 75, 'bsc': 75, 'ba': 70, 'bba': 75,
            'diploma': 60,
            'higher secondary': 40, '12th': 40, 'hsc': 40,
            'secondary': 30, '10th': 30, 'sslc': 30
        };

        const reqLevel = requiredEducation.toLowerCase();
        let reqScore = 50;
        for (const [key, score] of Object.entries(educationLevels)) {
            if (reqLevel.includes(key)) { reqScore = score; break; }
        }

        let candidateScore = 0;
        for (const [key, score] of Object.entries(educationLevels)) {
            if (text.includes(key)) {
                candidateScore = Math.max(candidateScore, score);
            }
        }

        if (candidateScore >= reqScore) return 100;
        if (candidateScore > 0) return (candidateScore / reqScore) * 100;
        return 30;
    }

    calculateKeywordScore(text, job) {
        const keywords = [
            ...job.title.toLowerCase().split(/\s+/),
            ...(job.description ? job.description.toLowerCase().split(/\s+/).filter(w => w.length > 3) : [])
        ];

        const uniqueKeywords = [...new Set(keywords)].filter(k => 
            !['and', 'the', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'been', 'more'].includes(k)
        );

        if (uniqueKeywords.length === 0) return 50;

        let matched = 0;
        for (const keyword of uniqueKeywords) {
            if (text.includes(keyword)) matched++;
        }

        return (matched / uniqueKeywords.length) * 100;
    }

    generateFeedback(skillScore, experienceScore, educationScore, keywordScore) {
        const feedbacks = [];
        if (skillScore >= 80) feedbacks.push("Excellent skill match!");
        else if (skillScore >= 50) feedbacks.push("Good skill match, some gaps noted.");
        else feedbacks.push("Limited skill match with job requirements.");

        if (experienceScore >= 80) feedbacks.push("Strong experience profile.");
        else if (experienceScore >= 50) feedbacks.push("Moderate experience level.");
        else feedbacks.push("Experience may not meet requirements.");

        if (educationScore >= 80) feedbacks.push("Education qualifications met.");
        else feedbacks.push("Education background could be stronger.");

        return feedbacks.join(' ');
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
