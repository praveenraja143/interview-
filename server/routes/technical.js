const express = require('express');
const { protect } = require('../middleware/auth');
const Job = require('../models/Job');
const User = require('../models/User');
const RoundResult = require('../models/RoundResult');
const aiService = require('../services/aiService');
const router = express.Router();

// GET /api/technical/:jobId/questions
router.get('/:jobId/questions', protect, async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in technical round
        if (job.currentRound !== 'technical') {
            return res.status(403).json({ message: 'Technical round is not currently active for this job' });
        }

        const existing = await RoundResult.findOne({
            userId: req.user._id, jobId: job._id, round: 'technical'
        });
        if (existing) {
            return res.status(400).json({ message: 'Already completed', score: existing.score });
        }

        // Get candidate's resume skills for personalized questions
        const candidate = await User.findById(req.user._id);
        const candidateSkills = candidate.resumeData?.skills || [];

        let questions = job.technicalQuestions;
        if (!questions || questions.length === 0) {
            const combinedSkills = [...new Set([...job.requiredSkills, ...candidateSkills])];
            
            // Try AI-generated questions first (unique per candidate)
            const [aiMCQs, aiCoding] = await Promise.all([
                aiService.generateTechnicalMCQs(combinedSkills, 7),
                aiService.generateCodingQuestions(combinedSkills, 3)
            ]);
            
            if (aiMCQs || aiCoding) {
                questions = [...(aiMCQs || []), ...(aiCoding || [])];
                console.log(`🤖 AI generated ${questions.length} unique technical questions`);
            }
            
            // Fallback to local question bank
            if (!questions || questions.length === 0) {
                questions = generateSkillBasedTechnicalQuestions(combinedSkills, 10);
            }
        }

        const safeQuestions = questions.map((q, i) => ({
            id: i,
            type: q.type || 'mcq',
            question: q.question,
            options: q.type === 'coding' ? undefined : q.options,
            difficulty: q.difficulty,
            topic: q.topic,
            starterCode: q.starterCode || undefined,
            language: q.language || undefined,
            expectedOutput: q.expectedOutput || undefined
        }));

        res.json({
            questions: safeQuestions,
            timeLimit: job.timeLimit.technical,
            totalQuestions: safeQuestions.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/technical/:jobId/submit
router.post('/:jobId/submit', protect, async (req, res) => {
    try {
        const { answers, codeAnswers, timeTaken, disqualified } = req.body;
        const job = await Job.findById(req.params.jobId);
        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Check if job is in technical round
        if (job.currentRound !== 'technical') {
            return res.status(403).json({ message: 'Technical round is not currently active' });
        }

        const existing = await RoundResult.findOne({
            userId: req.user._id, jobId: job._id, round: 'technical'
        });
        if (existing) {
            return res.status(400).json({ message: 'Already submitted' });
        }

        let questions = job.technicalQuestions;
        if (!questions || questions.length === 0) {
            const candidate = await User.findById(req.user._id);
            const candidateSkills = candidate.resumeData?.skills || [];
            const combinedSkills = [...new Set([...job.requiredSkills, ...candidateSkills])];
            questions = generateSkillBasedTechnicalQuestions(combinedSkills, 10);
        }

        // Separate MCQ and coding questions
        const mcqQuestions = questions.filter(q => (q.type || 'mcq') === 'mcq');
        const codingQuestions = questions.filter(q => q.type === 'coding');

        // Score MCQ questions
        let mcqCorrect = 0;
        let mcqTotal = mcqQuestions.length;
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if ((q.type || 'mcq') === 'mcq') {
                if (answers[i] !== undefined && answers[i] === q.correctAnswer) {
                    mcqCorrect++;
                }
            }
        }

        // Score coding questions (AI-powered or local fallback)
        let codeScore = 0;
        let codingTotal = codingQuestions.length;
        const codeAnswers = req.body.codeAnswers || {};
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (q.type === 'coding' && codeAnswers[i]) {
                // Try AI code evaluation first
                const aiCodeEval = await aiService.evaluateCode(
                    codeAnswers[i], q.question, q.language || 'javascript'
                );
                if (aiCodeEval && aiCodeEval.overallScore !== undefined) {
                    codeScore += aiCodeEval.overallScore;
                    console.log(`🤖 AI code eval: ${aiCodeEval.overallScore}% - ${aiCodeEval.feedback}`);
                } else {
                    // Fallback to local keyword evaluation
                    codeScore += evaluateCode(codeAnswers[i], q);
                }
            }
        }
        const avgCodeScore = codingTotal > 0 ? Math.round(codeScore / codingTotal) : 0;

        // Combined score: weighted average
        const mcqScore = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : 0;
        let finalScore;
        if (mcqTotal > 0 && codingTotal > 0) {
            finalScore = Math.round(mcqScore * 0.4 + avgCodeScore * 0.6); // 60% coding weight
        } else if (codingTotal > 0) {
            finalScore = avgCodeScore;
        } else {
            finalScore = mcqScore;
        }

        if (disqualified) {
            finalScore = 0;
            console.log('🚫 DISQUALIFIED: Technical score set to 0');
        }

        let parsedTimeTaken = 0;
        if (typeof timeTaken === 'string' && timeTaken.includes(':')) {
            const parts = timeTaken.split(':');
            const timeLeftSecs = parseInt(parts[0] || '0') * 60 + parseInt(parts[1] || '0');
            const timeLimitSecs = (job.timeLimit?.technical || 45) * 60;
            parsedTimeTaken = Math.max(0, timeLimitSecs - timeLeftSecs);
        } else if (!isNaN(timeTaken)) {
            parsedTimeTaken = Number(timeTaken);
        }

        const passed = finalScore >= 50;

        const result = await RoundResult.create({
            userId: req.user._id,
            jobId: job._id,
            round: 'technical',
            score: finalScore,
            details: {
                totalQuestions: questions.length,
                mcqCorrect,
                mcqTotal,
                mcqScore,
                codingTotal,
                codeScore: avgCodeScore,
                timeTaken: parsedTimeTaken
            },
            feedback: `MCQ: ${mcqCorrect}/${mcqTotal} (${mcqScore}%) | Coding: ${avgCodeScore}% | Final: ${finalScore}%`
        });

        const user = await User.findById(req.user._id);
        const application = user.appliedJobs.find(j => j.jobId.toString() === job._id.toString());
        if (application) {
            application.scores.technical = finalScore;
            application.status = 'technical_completed';
            await user.save();
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('technicalCompleted', { jobId: job._id, userId: req.user._id, score: finalScore });
        }

        res.json({
            message: 'Technical test submitted',
            score: finalScore,
            passed: finalScore >= 50,
            correct: mcqCorrect,
            total: questions.length,
            details: { mcqScore, codeScore: avgCodeScore }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

function generateSkillBasedTechnicalQuestions(skills = [], count = 10) {
    // Skill-specific question banks
    const skillQuestionBank = {
        react: [
            {
                question: "In React, what hook is used to manage side effects?",
                options: ["useState", "useEffect", "useRef", "useMemo"],
                correctAnswer: 1, difficulty: "easy", topic: "React"
            },
            {
                question: "What is the Virtual DOM in React?",
                options: ["A direct copy of the browser DOM", "A lightweight JS representation of the real DOM", "A CSS rendering engine", "A database layer"],
                correctAnswer: 1, difficulty: "easy", topic: "React"
            },
            {
                question: "Which method is used to pass data from parent to child component in React?",
                options: ["State", "Props", "Context", "Refs"],
                correctAnswer: 1, difficulty: "easy", topic: "React"
            },
            {
                question: "What does React.memo() do?",
                options: ["Stores data in memory", "Prevents unnecessary re-renders of functional components", "Creates a new component", "Handles routing"],
                correctAnswer: 1, difficulty: "medium", topic: "React"
            },
            {
                question: "What is the purpose of useReducer in React?",
                options: ["To fetch API data", "To manage complex state logic", "To create animations", "To handle routing"],
                correctAnswer: 1, difficulty: "medium", topic: "React"
            }
        ],
        javascript: [
            {
                question: "What is a closure in JavaScript?",
                options: ["A way to close the browser", "A function with access to its outer scope variables", "A CSS property", "A loop termination"],
                correctAnswer: 1, difficulty: "medium", topic: "JavaScript"
            },
            {
                question: "What is the difference between '==' and '===' in JavaScript?",
                options: ["No difference", "'===' checks type and value, '==' only value", "'==' is faster", "'===' is deprecated"],
                correctAnswer: 1, difficulty: "easy", topic: "JavaScript"
            },
            {
                question: "What does 'async/await' do in JavaScript?",
                options: ["Makes code run faster", "Handles promises in a synchronous-looking way", "Creates new threads", "Compiles the code"],
                correctAnswer: 1, difficulty: "medium", topic: "JavaScript"
            },
            {
                question: "What is the Event Loop in JavaScript?",
                options: ["A for-each loop for events", "A mechanism that handles async callbacks in a single-threaded environment", "A CSS animation loop", "A timer function"],
                correctAnswer: 1, difficulty: "hard", topic: "JavaScript"
            },
            {
                question: "What is 'hoisting' in JavaScript?",
                options: ["Moving elements in the DOM", "Variable and function declarations moved to top of scope before execution", "Raising errors", "Importing modules"],
                correctAnswer: 1, difficulty: "medium", topic: "JavaScript"
            }
        ],
        nodejs: [
            {
                question: "What is Node.js built on?",
                options: ["Python Engine", "Chrome's V8 JavaScript Engine", "Java Virtual Machine", "Ruby Interpreter"],
                correctAnswer: 1, difficulty: "easy", topic: "Node.js"
            },
            {
                question: "What is middleware in Express.js?",
                options: ["A database layer", "Functions that execute during req-res cycle", "A CSS framework", "A testing tool"],
                correctAnswer: 1, difficulty: "easy", topic: "Node.js"
            },
            {
                question: "How does Node.js handle concurrency?",
                options: ["Multi-threading", "Single-threaded event loop with non-blocking I/O", "Forking processes", "Using GPU"],
                correctAnswer: 1, difficulty: "medium", topic: "Node.js"
            },
            {
                question: "What is the 'package.json' file used for?",
                options: ["Storing user data", "Managing project dependencies and metadata", "Database configuration", "CSS styles"],
                correctAnswer: 1, difficulty: "easy", topic: "Node.js"
            },
            {
                question: "What is the purpose of 'process.env' in Node.js?",
                options: ["To process images", "To access environment variables", "To create child processes", "To handle file uploads"],
                correctAnswer: 1, difficulty: "easy", topic: "Node.js"
            }
        ],
        'node.js': [], // alias - will be merged with nodejs
        mongodb: [
            {
                question: "What type of database is MongoDB?",
                options: ["Relational (SQL)", "Document-based NoSQL", "Graph database", "Key-value store"],
                correctAnswer: 1, difficulty: "easy", topic: "MongoDB"
            },
            {
                question: "What is a 'Collection' in MongoDB?",
                options: ["A table", "A group of documents (equivalent to a table)", "A database", "An index"],
                correctAnswer: 1, difficulty: "easy", topic: "MongoDB"
            },
            {
                question: "What is the Aggregation Pipeline in MongoDB?",
                options: ["A way to insert data", "A framework for data processing and transformation", "A backup tool", "A replication method"],
                correctAnswer: 1, difficulty: "medium", topic: "MongoDB"
            },
            {
                question: "What does 'mongoose' provide in a Node.js application?",
                options: ["A CSS framework", "ODM (Object Data Modeling) for MongoDB", "A testing library", "A routing system"],
                correctAnswer: 1, difficulty: "easy", topic: "MongoDB"
            },
            {
                question: "How does MongoDB store data?",
                options: ["In rows and columns", "In BSON (Binary JSON) documents", "In XML files", "In plain text"],
                correctAnswer: 1, difficulty: "easy", topic: "MongoDB"
            }
        ],
        python: [
            {
                question: "What is a decorator in Python?",
                options: ["A CSS class", "A function that modifies another function's behavior", "A data type", "A loop construct"],
                correctAnswer: 1, difficulty: "medium", topic: "Python"
            },
            {
                question: "What is the difference between a list and a tuple in Python?",
                options: ["No difference", "Lists are mutable, tuples are immutable", "Tuples are faster than lists", "Lists can only store numbers"],
                correctAnswer: 1, difficulty: "easy", topic: "Python"
            },
            {
                question: "What is a Python generator?",
                options: ["A code compiler", "A function that yields values lazily using 'yield'", "A random number generator", "A class constructor"],
                correctAnswer: 1, difficulty: "medium", topic: "Python"
            },
            {
                question: "What does 'self' represent in a Python class?",
                options: ["The class itself", "The current instance of the class", "A global variable", "A built-in function"],
                correctAnswer: 1, difficulty: "easy", topic: "Python"
            }
        ],
        java: [
            {
                question: "What is the JVM in Java?",
                options: ["Java Version Manager", "Java Virtual Machine that runs bytecode", "Java Visual Module", "Java Vendor Management"],
                correctAnswer: 1, difficulty: "easy", topic: "Java"
            },
            {
                question: "What is the difference between an Interface and an Abstract class in Java?",
                options: ["No difference", "Interface has only method signatures, abstract class can have implementations", "Abstract class is faster", "Interface supports inheritance"],
                correctAnswer: 1, difficulty: "medium", topic: "Java"
            },
            {
                question: "What is garbage collection in Java?",
                options: ["Deleting files", "Automatic memory management that reclaims unused objects", "A sorting algorithm", "A design pattern"],
                correctAnswer: 1, difficulty: "medium", topic: "Java"
            }
        ],
        sql: [
            {
                question: "What is a JOIN in SQL?",
                options: ["Combining two strings", "Combining rows from two or more tables based on a related column", "Creating a new table", "Deleting duplicate rows"],
                correctAnswer: 1, difficulty: "easy", topic: "SQL"
            },
            {
                question: "What is the difference between WHERE and HAVING in SQL?",
                options: ["No difference", "WHERE filters rows before grouping, HAVING filters after grouping", "HAVING is faster", "WHERE works only with numbers"],
                correctAnswer: 1, difficulty: "medium", topic: "SQL"
            },
            {
                question: "What is normalization in databases?",
                options: ["Making data normal", "Organizing data to reduce redundancy and improve integrity", "Encrypting data", "Compressing data"],
                correctAnswer: 1, difficulty: "medium", topic: "SQL"
            }
        ],
        express: [
            {
                question: "What is Express.js?",
                options: ["A database", "A minimal web framework for Node.js", "A CSS library", "A testing tool"],
                correctAnswer: 1, difficulty: "easy", topic: "Express"
            },
            {
                question: "What is routing in Express.js?",
                options: ["Network configuration", "Defining URL endpoints and their handlers", "CSS animations", "Database queries"],
                correctAnswer: 1, difficulty: "easy", topic: "Express"
            }
        ],
        html: [
            {
                question: "What does HTML stand for?",
                options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Markup Logic", "Home Tool Markup Language"],
                correctAnswer: 0, difficulty: "easy", topic: "HTML"
            }
        ],
        css: [
            {
                question: "What is Flexbox in CSS?",
                options: ["A JavaScript library", "A layout model for distributing space among items in a container", "A font family", "A color scheme"],
                correctAnswer: 1, difficulty: "easy", topic: "CSS"
            }
        ]
    };

    // Merge node.js alias
    skillQuestionBank['node.js'] = skillQuestionBank.nodejs;

    // Generic fallback questions (DSA, System Design, etc.)
    const genericQuestions = [
        {
            question: "What is the time complexity of binary search?",
            options: ["O(n)", "O(log n)", "O(n²)", "O(1)"],
            correctAnswer: 1, difficulty: "easy", topic: "DSA"
        },
        {
            question: "Which data structure uses FIFO principle?",
            options: ["Stack", "Queue", "Tree", "Graph"],
            correctAnswer: 1, difficulty: "easy", topic: "DSA"
        },
        {
            question: "What does REST stand for?",
            options: ["Representational State Transfer", "Remote Execution Server Technology", "Real-time Event Stream Transfer", "Reactive State Transition"],
            correctAnswer: 0, difficulty: "easy", topic: "Web"
        },
        {
            question: "Which HTTP method is idempotent?",
            options: ["POST", "PUT", "PATCH", "None of these"],
            correctAnswer: 1, difficulty: "medium", topic: "Web"
        },
        {
            question: "What is the purpose of an index in a database?",
            options: ["Store data", "Speed up queries", "Create backups", "Encrypt data"],
            correctAnswer: 1, difficulty: "easy", topic: "Database"
        },
        {
            question: "What is polymorphism in OOP?",
            options: ["Multiple inheritance", "Same interface, different implementations", "Data hiding", "Code reuse"],
            correctAnswer: 1, difficulty: "medium", topic: "OOP"
        },
        {
            question: "What is the purpose of a load balancer?",
            options: ["Increase storage", "Distribute network traffic", "Encrypt data", "Compress files"],
            correctAnswer: 1, difficulty: "medium", topic: "System Design"
        }
    ];

    // Collect questions matching candidate skills
    let selectedQuestions = [];
    const normalizedSkills = skills.map(s => s.toLowerCase().trim());

    for (const skill of normalizedSkills) {
        const questions = skillQuestionBank[skill];
        if (questions && questions.length > 0) {
            selectedQuestions.push(...questions);
        }
    }

    // Remove duplicates
    const seen = new Set();
    selectedQuestions = selectedQuestions.filter(q => {
        if (seen.has(q.question)) return false;
        seen.add(q.question);
        return true;
    });

    // If we have enough skill-based questions, use them
    if (selectedQuestions.length >= count) {
        // Shuffle and return
        return selectedQuestions.sort(() => Math.random() - 0.5).slice(0, count);
    }

    // Fill remaining with generic questions
    for (const q of genericQuestions) {
        if (!seen.has(q.question)) {
            selectedQuestions.push(q);
            seen.add(q.question);
        }
        if (selectedQuestions.length >= count) break;
    }

    return selectedQuestions.sort(() => Math.random() - 0.5).slice(0, count);
}

// ==========================================
// CODE EVALUATION ENGINE
// ==========================================
function evaluateCode(code, question) {
    if (!code || code.trim().length === 0) return 0;

    let score = 20; // Base score for attempting
    const codeLC = code.toLowerCase();

    // 1. Check for required keywords/patterns
    if (question.requiredKeywords && question.requiredKeywords.length > 0) {
        let matched = 0;
        for (const keyword of question.requiredKeywords) {
            if (codeLC.includes(keyword.toLowerCase())) matched++;
        }
        const keywordRatio = matched / question.requiredKeywords.length;
        score += Math.round(keywordRatio * 30); // Up to 30 points for keywords
    }

    // 2. Check code structure (has function definition, return statement, etc.)
    const hasFunction = /function\s+\w+|const\s+\w+\s*=\s*(\(|function)|def\s+\w+|public\s+(static\s+)?/.test(code);
    const hasReturn = /return\s+/.test(code);
    const hasLoop = /for\s*\(|while\s*\(|\.forEach|\.map|\.reduce|\.filter|for\s+\w+\s+in/.test(code);
    const hasConditional = /if\s*\(|switch\s*\(|if\s+\w+:|ternary|\?.*:/.test(code);

    if (hasFunction) score += 10;
    if (hasReturn) score += 5;
    if (hasLoop) score += 5;
    if (hasConditional) score += 5;

    // 3. Code length (not too short)
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    if (lines.length >= 5) score += 10;
    else if (lines.length >= 3) score += 5;

    // 4. Check for comments (good practice)
    if (code.includes('//') || code.includes('#') || code.includes('/*')) score += 5;

    // 5. Penalty for empty/placeholder code
    if (codeLC.includes('todo') || codeLC.includes('pass') || code.trim() === question.starterCode?.trim()) {
        score = Math.max(score - 20, 10);
    }

    return Math.min(Math.max(score, 0), 100);
}

// ==========================================
// CODING QUESTION BANKS (per skill)
// ==========================================
const codingQuestionBanks = {
    react: [
        {
            type: 'coding', topic: 'React', difficulty: 'medium', language: 'javascript',
            question: "Write a React functional component 'Counter' that displays a count and has buttons to increment and decrement it using useState.",
            starterCode: "import React, { useState } from 'react';\n\nfunction Counter() {\n  // Your code here\n\n}\n\nexport default Counter;",
            requiredKeywords: ['useState', 'onClick', 'return', 'button'],
            expectedOutput: 'A working Counter component with increment/decrement buttons'
        }
    ],
    javascript: [
        {
            type: 'coding', topic: 'JavaScript', difficulty: 'medium', language: 'javascript',
            question: "Write a function 'reverseString' that takes a string and returns it reversed without using the built-in reverse() method.",
            starterCode: "function reverseString(str) {\n  // Your code here\n\n}",
            requiredKeywords: ['function', 'return', 'for', 'length'],
            expectedOutput: "reverseString('hello') should return 'olleh'"
        },
        {
            type: 'coding', topic: 'JavaScript', difficulty: 'medium', language: 'javascript',
            question: "Write a function 'findDuplicates' that takes an array and returns an array of duplicate elements.",
            starterCode: "function findDuplicates(arr) {\n  // Your code here\n\n}",
            requiredKeywords: ['function', 'return', 'filter', 'indexOf'],
            expectedOutput: "findDuplicates([1,2,3,2,4,3]) should return [2,3]"
        }
    ],
    nodejs: [
        {
            type: 'coding', topic: 'Node.js', difficulty: 'medium', language: 'javascript',
            question: "Write an Express.js route handler for GET /api/users that returns a JSON array of users. Include error handling with try-catch.",
            starterCode: "const express = require('express');\nconst router = express.Router();\n\n// Your code here\n\nmodule.exports = router;",
            requiredKeywords: ['router.get', 'req', 'res', 'json', 'try', 'catch'],
            expectedOutput: 'A GET route that returns user data with error handling'
        }
    ],
    'node.js': [],
    mongodb: [
        {
            type: 'coding', topic: 'MongoDB', difficulty: 'medium', language: 'javascript',
            question: "Write a Mongoose schema for a 'Product' with fields: name (String, required), price (Number, required), category (String), and inStock (Boolean, default true). Also write a function to find all products under a given price.",
            starterCode: "const mongoose = require('mongoose');\n\n// Define schema and model here\n\n// Write findCheapProducts function here",
            requiredKeywords: ['Schema', 'mongoose', 'model', 'find', 'price'],
            expectedOutput: 'A Product schema and a query function'
        }
    ],
    python: [
        {
            type: 'coding', topic: 'Python', difficulty: 'medium', language: 'python',
            question: "Write a Python function 'fibonacci' that returns the first N numbers of the Fibonacci sequence as a list.",
            starterCode: "def fibonacci(n):\n    # Your code here\n    pass",
            requiredKeywords: ['def', 'return', 'append', 'for'],
            expectedOutput: "fibonacci(6) should return [0, 1, 1, 2, 3, 5]"
        }
    ],
    java: [
        {
            type: 'coding', topic: 'Java', difficulty: 'medium', language: 'java',
            question: "Write a Java method 'isPalindrome' that checks if a given string is a palindrome (reads the same forwards and backwards).",
            starterCode: "public class Solution {\n    public static boolean isPalindrome(String str) {\n        // Your code here\n    }\n}",
            requiredKeywords: ['public', 'boolean', 'return', 'charAt', 'length'],
            expectedOutput: 'isPalindrome("racecar") should return true'
        }
    ],
    sql: [
        {
            type: 'coding', topic: 'SQL', difficulty: 'medium', language: 'sql',
            question: "Write a SQL query to find the top 5 highest-paid employees from an 'employees' table (columns: id, name, salary, department). Order by salary descending.",
            starterCode: "-- Write your SQL query here\nSELECT ",
            requiredKeywords: ['SELECT', 'FROM', 'ORDER BY', 'LIMIT'],
            expectedOutput: 'A query returning top 5 employees by salary'
        }
    ]
};

// Merge coding question banks into the main function
const _originalGenerate = generateSkillBasedTechnicalQuestions;
generateSkillBasedTechnicalQuestions = function(skills, count) {
    // First get MCQ questions (70% of count)
    const mcqCount = Math.ceil(count * 0.7);
    const codingCount = count - mcqCount;

    const mcqQuestions = _originalGenerate(skills, mcqCount);

    // Now get coding questions from candidate skills
    let codingQuestions = [];
    const normalizedSkills = skills.map(s => s.toLowerCase().trim());

    // Merge node.js alias
    codingQuestionBanks['node.js'] = codingQuestionBanks.nodejs;

    for (const skill of normalizedSkills) {
        const questions = codingQuestionBanks[skill];
        if (questions && questions.length > 0) {
            codingQuestions.push(...questions);
        }
    }

    // Remove duplicates and shuffle
    const seen = new Set(mcqQuestions.map(q => q.question));
    codingQuestions = codingQuestions.filter(q => {
        if (seen.has(q.question)) return false;
        seen.add(q.question);
        return true;
    });

    codingQuestions = codingQuestions.sort(() => Math.random() - 0.5).slice(0, codingCount);

    // Combine: MCQs first, then coding
    return [...mcqQuestions, ...codingQuestions];
};

module.exports = router;
