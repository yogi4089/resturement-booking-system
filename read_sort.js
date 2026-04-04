const fs = require('fs');
const content = fs.readFileSync('e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs', 'utf8');
const lines = content.split('\n');
const selIdx = lines.findIndex(l => l.includes('name="queueSort"'));
if (selIdx >= 0) {
  console.log(lines.slice(selIdx-2, selIdx+10).join('\n'));
}

const c2 = fs.readFileSync('e:/New folder/resturent managment/backend/controllers/adminController.js', 'utf8');
const l2 = c2.split('\n');
const s2 = l2.findIndex(l => l.includes('queueSort = req.query.queueSort'));
if (s2 >= 0) {
  console.log(l2.slice(s2-5, s2+15).join('\n'));
}
