const fs = require('fs');

const files = [
  'e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs',
  'e:/New folder/resturent managment/frontend/views/admin-tables.ejs'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // We want to replace the `remains + 'm'` calculation with the formatting one.
  // In admin-waiting-list.ejs:
  const search1 = `const remains = Math.ceil(-diffMs / 60000);
            td.textContent = remains + 'm';`;
  const replace1 = `const remains = Math.ceil(-diffMs / 60000);
            if (remains >= 60) {
              const h = Math.floor(remains / 60);
              const m = remains % 60;
              td.textContent = m ? h + 'h ' + m + 'm' : h + 'h';
            } else {
              td.textContent = remains + 'm';
            }`;

  if (content.includes(search1)) {
    content = content.replace(search1, replace1);
  }

  // In admin-tables.ejs:
  const search2 = `const remains = Math.ceil(-diffMs / 60000);
          el.textContent = remains + 'm';`;
  const replace2 = `const remains = Math.ceil(-diffMs / 60000);
          if (remains >= 60) {
            const h = Math.floor(remains / 60);
            const m = remains % 60;
            el.textContent = m ? h + 'h ' + m + 'm' : h + 'h';
          } else {
            el.textContent = remains + 'm';
          }`;

  if (content.includes(search2)) {
    content = content.replace(search2, replace2);
  }

  fs.writeFileSync(file, content, 'utf8');
}
console.log('patched scripts');
