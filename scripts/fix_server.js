const fs = require('fs');
const path = require('path');

const bDir = 'e:/New folder/resturent managment/backend';
const srvPath = path.join(bDir, 'server.js');
let srvStr = fs.readFileSync(srvPath, 'utf8');

srvStr = srvStr.replace("const { autoAssignReadyTables } = require('./utils/queueUtils');\n", "");
srvStr = srvStr.replace('const app = require("./app");', 'const app = require("./app");\nconst { autoAssignReadyTables } = require("./utils/queueUtils");');

fs.writeFileSync(srvPath, srvStr);
console.log('Fixed server.js');
