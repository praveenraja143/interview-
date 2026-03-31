const User = require('../models/User');

async function seedAdmin() {
    try {
        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: 'iqignite-yugenfest26@jkkmct.edu.in' });
        
        if (!existingAdmin) {
            await User.create({
                name: 'Admin',
                email: 'iqignite-yugenfest26@jkkmct.edu.in',
                password: 'Admin@123',
                phone: '',
                role: 'admin'
            });
            console.log('✅ Admin account created: iqignite-yugenfest26@jkkmct.edu.in');
        } else {
            console.log('✅ Admin account already exists');
        }
    } catch (error) {
        console.error('❌ Error seeding admin:', error.message);
    }
}

module.exports = seedAdmin;
