const fs = require('fs');
const path = require('path');

async function test() {
    try {
        console.log("Registering user...");
        const res1 = await fetch('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Test User",
                email: "testuser" + Date.now() + "@example.com",
                password: "password123",
                role: "candidate"
            })
        });
        const user = await res1.json();
        const token = user.token;

        console.log("Admin login...");
        const resAdmin = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'iqignite-yugenfest26@jkkmct.edu.in', password: 'Admin@123' })
        });
        const adminUser = await resAdmin.json();
        const adminToken = adminUser.token;

        console.log("Creating job...");
        const reqJob = await fetch('http://localhost:3000/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({
                title: 'Python Developer',
                description: 'test',
                company: 'test',
                totalPositions: 2,
                maxApplicants: 100,
                requiredSkills: 'python, django',
                experience: 1,
                education: 'bachelor',
                eliminationRatios: { ats: 50, aptitude: 50, technical: 50, gd: 50 }
            })
        });
        const job = await reqJob.json();
        console.log("Job created:", job._id);

        fs.writeFileSync('dummy.txt', 'I am a python developer with 2 years of experience in django.');
        
        console.log("Uploading resume...");

        const form = new FormData();
        const fileContent = fs.readFileSync('dummy.txt');
        const fileBlob = new Blob([fileContent], { type: 'text/plain' });
        form.append('resume', fileBlob, 'dummy.txt');

        const reqUpload = await fetch(`http://localhost:3000/api/resume/upload/${job._id}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: form
        });
        
        const uploadRes = await reqUpload.json();
        console.log("Upload result:", uploadRes);

    } catch (e) {
        console.error("Test failed", e);
    }
}
test();
