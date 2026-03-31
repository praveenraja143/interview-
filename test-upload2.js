const fs = require('fs');

async function test() {
    try {
        console.log("Registering user");
        const res1 = await fetch('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: "U3", email: "u3" + Date.now() + "@a.com", password: "p", role: "candidate" })
        });
        const token = (await res1.json()).token;

        const resAdmin = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'iqignite-yugenfest26@jkkmct.edu.in', password: 'Admin@123' })
        });
        const adminToken = (await resAdmin.json()).token;

        const reqJob = await fetch('http://localhost:3000/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({
                title: 'Python Dev', description: 'test', company: 'test',
                totalPositions: 2, maxApplicants: 100,
                requiredSkills: ['python', 'django'], // CORRECTLY PASSING ARRAY HERE!
                experience: 1, education: 'bachelor'
            })
        });
        const job = await reqJob.json();
        console.log("Job:", job._id);

        fs.writeFileSync('dummy2.txt', 'test content python');
        const form = new FormData();
        form.append('resume', new Blob([fs.readFileSync('dummy2.txt')]), 'dummy2.txt');

        const uploadReq = await fetch(`http://localhost:3000/api/resume/upload/${job._id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        
        console.log("Upload:", await uploadReq.json());
    } catch (e) { console.error(e); }
}
test();
