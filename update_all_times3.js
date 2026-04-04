const fs = require('fs');
const file = 'e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs';
let content = fs.readFileSync(file, 'utf8');

const t_script = `      function updateReadyWaitTimes() {
        const now = new Date();
        document.querySelectorAll('.ready-wait-remaining, .dynamic-wait').forEach(td => {
          const timeAttr = td.dataset.waitingTill || td.dataset.time;
          if (!timeAttr) return;
          const targetTime = new Date(timeAttr);
          const diffMs = now - targetTime;
          if (diffMs > 0) {
            const mins = Math.floor(diffMs / 60000);
            td.textContent = '0m (+' + mins + 'm)';
          } else if (td.classList.contains('ready-wait-remaining')) {
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
            td.textContent = '0m (+' + mins + 'm)';
          } else {
            const remains = Math.ceil(-diffMs / 60000);
            td.textContent = remains + 'm';
          }
        });
      }
      setInterval(updateReadyWaitTimes, 60000);
      updateReadyWaitTimes();`;

if (content.includes(t_script)) {
  content = content.replace(t_script, r_script);
}

fs.writeFileSync(file, content, 'utf8');
