const fs = require('fs');

let tableModelPath = 'e:/New folder/resturent managment/backend/models/tableModel.js';
let tableModelStr = fs.readFileSync(tableModelPath, 'utf8');

tableModelStr = tableModelStr.replace(/capacity >= \$1/g, 'capacity >= $1 AND capacity < $1 + 2');

fs.writeFileSync(tableModelPath, tableModelStr);

let queueModelPath = 'e:/New folder/resturent managment/backend/models/queueModel.js';
let queueModelStr = fs.readFileSync(queueModelPath, 'utf8');

queueModelStr = queueModelStr.replace(/b\.guests \<= \$1/g, 'b.guests <= $1 AND b.guests > $1 - 2');

fs.writeFileSync(queueModelPath, queueModelStr);

console.log('Done patching models.');
