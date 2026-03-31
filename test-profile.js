const fetch = require('node-fetch'); // wait I will use native fetch

async function testProfile() {
    const resAdmin = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'iqignite-yugenfest26@jkkmct.edu.in', password: 'Admin@123' })
    });
    const adminToken = (await resAdmin.json()).token;

    const resProfile = await fetch('http://localhost:3000/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log(await resProfile.json());
}
testProfile();
