const fs = require('fs');
const lines = fs.readFileSync('e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs', 'utf-8').split('\n');
console.log(lines.slice(115, 140).join('\n'));
console.log('-----------------');
console.log(lines.slice(83, 105).join('\n'));
