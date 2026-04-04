const fs = require('fs');

const files = [
  'e:/New folder/resturent managment/frontend/views/admin-tables.ejs',
  'e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs',
  'e:/New folder/resturent managment/frontend/views/admin-dashboard.ejs'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('sse-client')) {
    content = content.replace('</body>', '  <%- include(\'partials/sse-client\') %>\n</body>');
    fs.writeFileSync(file, content);
  }
}
console.log('Frontend patched.');
