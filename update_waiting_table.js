const fs = require('fs');
const file = 'e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs';
let content = fs.readFileSync(file, 'utf8');

const target = `                <td><span class="badge text-bg-dark"><%= row.priority_label %></span></td>
                <td><%= row.waitRemainingLabel %></td>`;

const replacement = `                <td><span class="badge text-bg-dark"><%= row.priority_label %></span></td>
                <td class="dynamic-wait" data-time="<%= row.waitingTill ? row.waitingTill.toISOString() : '' %>"><%= row.waitRemainingLabel %></td>`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully updated the Waiting List table.');
} else {
  console.log('Target string not found.');
}
