const fs = require('fs');
const errs = fs.readFileSync('err.log', 'utf8');
console.log(errs);
