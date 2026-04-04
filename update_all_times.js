const fs = require('fs');
const file = 'e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs';
let content = fs.readFileSync(file, 'utf8');

const t_waiting = `                <td><%= row.scheduleLabel %></td>
                <td><%= row.waitRemainingLabel %></td>`;

const r_waiting = `                <td><%= row.scheduleLabel %></td>
                <td class="dynamic-wait" data-time="<%= row.waitingTill ? row.waitingTill.toISOString() : '' %>"><%= row.waitRemainingLabel %></td>`;

if (content.includes(t_waiting)) {
  content = content.replace(t_waiting, r_waiting);
}

const t_booked = `                <td><%= row.expectedFreeAtLabel %></td>
                <td><%= row.remainingLabel %></td>`;

const r_booked = `                <td><%= row.expectedFreeAtLabel %></td>
                <td class="dynamic-wait" data-time="<%= row.expectedFreeAt ? row.expectedFreeAt.toISOString() : '' %>"><%= row.remainingLabel %></td>`;

if (content.includes(t_booked)) {
  content = content.replace(t_booked, r_booked);
}

const t_script = `      function updateReadyWaitTimes() {
        const now = new Date();
        document.querySelectorAll('.ready-wait-remaining').forEach(td => {
          const waitingTill = new Date(td.dataset.waitingTill);
          const diffMs = now - waitingTill;
          if (diffMs > 0) {
            const mins = Math.floor(diffMs / 60000);
            td.textContent = '0m (+' + mins + 'm)';
          } else {
            td.textContent = '0m';
          }
        });
      }
      setInterval(updateReadyWaitTimes, 60000);
      updateReadyWaitTimes();`;

const r_script = `      function updateReadyWaitTimes() {
        const now = new Date();
        document.querySelectorAll('.ready-wait-remaining, .dynamic-wait').forEach(td => {
          const timeAttr = td.dataset.waitingTill || td.dataset.time;
          if (!timeAttr) return;
          const targetTime = new Date(timeAttr);
          const diffMs = now - targetTime;
          if (diffMs > 0) {
            const mins = Math.floor(diffMs / 60000);
            td.innerHTML = '0m <span class="text-muted">(+' + mins + 'm)</span>';
          }
        });
      }
      setInterval(updateReadyWaitTimes, 60000);
      updateReadyWaitTimes();`;

if (content.includes(t_script)) {
  content = content.replace(t_script, r_script);
}

fs.writeFileSync(file, content, 'utf8');
console.log('done updating admin-waiting-list');
