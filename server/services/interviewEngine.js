// Interview Engine - One-on-One Interview AI Analysis
// Evaluates facial confidence, body language, answer quality, communication

const Sentiment = require('sentiment');
const sentiment = new Sentiment();

class InterviewEngine {
    constructor() {
        this.weights = {
            facialConfidence: 0.20,
            bodyLanguage: 0.15,
            answerQuality: 0.35,
            communicationSkill: 0.20,
            overallImpression: 0.10
        };

        // Common interview questions for AI interviewer to ask
        this.questionBank = {
            general: [
                "Tell me about yourself and your background.",
                "Why are you interested in this position?",
                "What are your greatest strengths?",
                "Where do you see yourself in 5 years?",
                "Tell me about a challenging situation you faced and how you handled it.",
                "Why should we hire you?",
                "What motivates you to do your best work?",
                "How do you handle pressure and stressful situations?",
                "What is your greatest professional achievement?",
                "Do you have any questions for us?"
            ],
            technical: [
                "Explain a complex technical concept from your field in simple terms.",
                "How do you stay updated with the latest technologies?",
                "Describe a technical project you're most proud of.",
                "How do you approach debugging a difficult problem?",
                "What development methodologies are you familiar with?"
            ],
            behavioral: [
                "Describe a time when you had to work with a difficult team member.",
                "Tell me about a time you made a mistake and how you corrected it.",
                "Give an example of a goal you reached and how you achieved it.",
                "How do you prioritize your work when you have multiple deadlines?"
            ],
            // Technology-specific questions (extracted from resume)
            react: [
                "What is the difference between functional components and class components in React?",
                "How does React's virtual DOM work and why is it efficient?",
                "What are React Hooks, and which ones have you used most often?",
                "Explain the concept of state management in a large-scale React application."
            ],
            javascript: [
                "What is the difference between 'let', 'const', and 'var'?",
                "Explain the concept of closures in JavaScript with an example.",
                "What is the event loop and how does it handle asynchronous code?",
                "What are the differences between ES6 arrow functions and regular functions?"
            ],
            nodejs: [
                "How does Node.js handle concurrency despite being single-threaded?",
                "What is Middleware in Express.js and how does it work?",
                "Explain the role of the 'package.json' file in a Node project.",
                "How do you handle error management in an asynchronous Node.js application?"
            ],
            mongodb: [
                "What is the difference between a Relational database and NoSQL like MongoDB?",
                "How do you perform indexing in MongoDB to improve query performance?",
                "Explain the concept of 'Aggregations' in MongoDB.",
                "What is Mongoose and how does it help in interacting with MongoDB?"
            ],
            python: [
                "What are decorators in Python and how are they used?",
                "Explain the difference between a list and a tuple.",
                "How does Python manage memory (garbage collection)?",
                "What is the difference between deep copy and shallow copy?"
            ]
        };
    }

    analyzeInterview(interviewData) {
        // interviewData: { answers[], faceData, duration }
        const facialConfidence = this.analyzeFacialConfidence(interviewData.faceData);
        const bodyLanguage = this.analyzeBodyLanguage(interviewData.faceData);
        const answerQuality = this.analyzeAnswerQuality(interviewData.answers);
        const communicationSkill = this.analyzeCommunicationSkill(interviewData.answers);
        const overallImpression = this.calculateOverallImpression(
            facialConfidence, bodyLanguage, answerQuality, communicationSkill
        );

        const totalScore = Math.round(
            (facialConfidence * this.weights.facialConfidence) +
            (bodyLanguage * this.weights.bodyLanguage) +
            (answerQuality * this.weights.answerQuality) +
            (communicationSkill * this.weights.communicationSkill) +
            (overallImpression * this.weights.overallImpression)
        );

        return {
            score: Math.min(Math.max(totalScore, 0), 100),
            details: {
                facialConfidence: Math.round(facialConfidence),
                bodyLanguage: Math.round(bodyLanguage),
                answerQuality: Math.round(answerQuality),
                communicationSkill: Math.round(communicationSkill),
                overallImpression: Math.round(overallImpression)
            },
            feedback: this.generateFeedback(facialConfidence, bodyLanguage, answerQuality, communicationSkill)
        };
    }

    analyzeFacialConfidence(faceData) {
        if (!faceData) return 50; // Default if no face data

        let score = 50;

        // Eye contact (looking at camera)
        if (faceData.eyeContact) {
            const eyeContactRatio = faceData.eyeContact / 100;
            if (eyeContactRatio > 0.7) score += 25;
            else if (eyeContactRatio > 0.5) score += 15;
            else if (eyeContactRatio > 0.3) score += 5;
            else score -= 10;
        }

        // Smile detection (measured value)
        if (faceData.smileFrequency) {
            if (faceData.smileFrequency > 30) score += 10;
            else if (faceData.smileFrequency > 15) score += 5;
        }

        // Face visibility (not hiding, face clearly visible)
        if (faceData.faceVisibility) {
            if (faceData.faceVisibility > 90) score += 15;
            else if (faceData.faceVisibility > 70) score += 10;
            else score -= 5;
        }

        return Math.min(Math.max(score, 0), 100);
    }

    analyzeBodyLanguage(faceData) {
        if (!faceData) return 50;

        let score = 55;

        // Head stability (not too much movement = composure)
        if (faceData.headStability) {
            if (faceData.headStability > 80) score += 20;
            else if (faceData.headStability > 60) score += 10;
            else score -= 5;
        }

        // Posture (upright = confident)
        if (faceData.postureScore) {
            if (faceData.postureScore > 80) score += 15;
            else if (faceData.postureScore > 60) score += 10;
        }

        // Gesturing (natural hand movements)
        if (faceData.gestureScore) {
            score += Math.min(faceData.gestureScore / 5, 10);
        }

        return Math.min(Math.max(score, 0), 100);
    }

    analyzeAnswerQuality(answers) {
        if (!answers || answers.length === 0) return 0;

        let totalScore = 0;

        for (const answer of answers) {
            let answerScore = 30; // Base score for attempting

            const text = answer.text || '';
            const words = text.split(/\s+/).filter(w => w.length > 0);
            
            // Length — too short is bad, too long can be bad too
            if (words.length >= 50 && words.length <= 200) answerScore += 20;
            else if (words.length >= 30) answerScore += 15;
            else if (words.length >= 15) answerScore += 10;
            else if (words.length < 5) answerScore -= 10;

            // Relevance — check if answer contains question keywords
            if (answer.question) {
                const questionWords = answer.question.toLowerCase().split(/\s+/)
                    .filter(w => w.length > 3);
                let relevance = 0;
                for (const qw of questionWords) {
                    if (text.toLowerCase().includes(qw)) relevance++;
                }
                const relevanceRatio = questionWords.length > 0 ? relevance / questionWords.length : 0;
                answerScore += Math.round(relevanceRatio * 15);
            }

            // Sentiment — professional and positive
            const sentimentResult = sentiment.analyze(text);
            if (sentimentResult.score > 0) answerScore += 10;
            else if (sentimentResult.score === 0) answerScore += 5;

            // Structure — uses complete sentences
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
            if (sentences.length >= 3) answerScore += 10;
            else if (sentences.length >= 1) answerScore += 5;

            // STAR method detection (Situation, Task, Action, Result)
            const starKeywords = ['situation', 'task', 'action', 'result', 'challenge', 'approach', 
                'outcome', 'learned', 'achieved', 'implemented', 'managed', 'led', 'responsible'];
            let starCount = 0;
            for (const keyword of starKeywords) {
                if (text.toLowerCase().includes(keyword)) starCount++;
            }
            answerScore += Math.min(starCount * 3, 15);

            totalScore += Math.min(Math.max(answerScore, 0), 100);
        }

        return Math.round(totalScore / answers.length);
    }

    analyzeCommunicationSkill(answers) {
        if (!answers || answers.length === 0) return 0;

        let totalScore = 0;

        for (const answer of answers) {
            let comScore = 40;
            const text = answer.text || '';
            const words = text.split(/\s+/).filter(w => w.length > 0);

            // Vocabulary richness
            const uniqueWords = new Set(words.map(w => w.toLowerCase()));
            const richness = words.length > 0 ? uniqueWords.size / words.length : 0;
            if (richness > 0.7) comScore += 20;
            else if (richness > 0.5) comScore += 10;

            // Filler words
            const fillerWords = ['um', 'uh', 'like', 'you know', 'basically', 'actually'];
            let fillerCount = 0;
            for (const filler of fillerWords) {
                const regex = new RegExp(`\\b${filler}\\b`, 'gi');
                const matches = text.match(regex);
                if (matches) fillerCount += matches.length;
            }
            if (fillerCount === 0) comScore += 15;
            else if (fillerCount <= 2) comScore += 5;
            else comScore -= 10;

            // Professional language
            const professionalTerms = ['experience', 'skills', 'team', 'project', 'achieve', 
                'develop', 'collaborate', 'strategy', 'improve', 'solution', 'growth', 'opportunity'];
            let profCount = 0;
            for (const term of professionalTerms) {
                if (text.toLowerCase().includes(term)) profCount++;
            }
            comScore += Math.min(profCount * 3, 20);

            // Clarity — moderate sentence length
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const avgSentenceLength = sentences.length > 0 
                ? words.length / sentences.length 
                : words.length;
            if (avgSentenceLength >= 10 && avgSentenceLength <= 25) comScore += 10;

            totalScore += Math.min(Math.max(comScore, 0), 100);
        }

        return Math.round(totalScore / answers.length);
    }

    calculateOverallImpression(facial, body, answer, communication) {
        // Weighted average of all aspects
        return Math.round((facial * 0.2 + body * 0.15 + answer * 0.4 + communication * 0.25));
    }

    getQuestions(type = 'general', count = 5, candidateSkills = []) {
        let questions = [];
        
        // 1. First, try to get questions based on candidate's skills
        if (candidateSkills && candidateSkills.length > 0) {
            const skillQuestions = [];
            candidateSkills.forEach(skill => {
                const s = skill.toLowerCase();
                if (this.questionBank[s]) {
                    skillQuestions.push(...this.questionBank[s]);
                } else {
                    // Generic questions for unmatched skills
                    skillQuestions.push(`Can you explain your experience with ${skill}?`);
                    skillQuestions.push(`What are some of the biggest challenges you've faced while working with ${skill}?`);
                }
            });
            
            if (skillQuestions.length > 0) {
                // Shuffle skill-based questions and take some
                const shuffledSkills = [...new Set(skillQuestions)].sort(() => Math.random() - 0.5);
                questions.push(...shuffledSkills.slice(0, Math.floor(count * 0.6))); // 60% skill-based
            }
        }

        // 2. Fill the rest with general/round-type questions
        const typeQuestions = this.questionBank[type] || this.questionBank.general;
        const shuffledType = [...typeQuestions].sort(() => Math.random() - 0.5);
        
        while (questions.length < count && shuffledType.length > 0) {
            const q = shuffledType.pop();
            if (!questions.includes(q)) {
                questions.push(q);
            }
        }

        // 3. If still not enough, fallback to general
        if (questions.length < count) {
            const generalShuffled = [...this.questionBank.general].sort(() => Math.random() - 0.5);
            while (questions.length < count && generalShuffled.length > 0) {
                const q = generalShuffled.pop();
                if (!questions.includes(q)) questions.push(q);
            }
        }

        // Final shuffle and slice
        return questions.sort(() => Math.random() - 0.5).slice(0, count);
    }

    generateFeedback(facial, body, answer, communication) {
        const feedbacks = [];
        
        if (facial >= 70) feedbacks.push("Excellent facial confidence and eye contact.");
        else if (facial >= 50) feedbacks.push("Decent facial expressions.");
        else feedbacks.push("Needs to improve eye contact and facial confidence.");

        if (body >= 70) feedbacks.push("Good body language and composure.");
        else feedbacks.push("Body language could be improved.");

        if (answer >= 70) feedbacks.push("Strong, well-structured answers.");
        else if (answer >= 50) feedbacks.push("Answers are adequate but could be more detailed.");
        else feedbacks.push("Answer quality needs significant improvement.");

        if (communication >= 70) feedbacks.push("Excellent communication skills.");
        else feedbacks.push("Communication skills need development.");

        return feedbacks.join(' ');
    }
}

module.exports = new InterviewEngine();
