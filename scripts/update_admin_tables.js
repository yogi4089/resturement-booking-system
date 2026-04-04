const fs = require('fs');
const file = 'e:/New folder/resturent managment/frontend/views/admin-tables.ejs';
let content = fs.readFileSync(file, 'utf8');

const t1 = `<p><small>Customer free in</small><br><%= table.timeUntilCustomerFreeLabel %> (<%= table.customerFreeAtLabel %>)</p>`;
const r1 = `<p><small>Customer free in</small><br><span class="dynamic-wait" data-time="<%= table.customerFreeAt ? table.customerFreeAt.toISOString() : '' %>"><%= table.timeUntilCustomerFreeLabel %></span> (<%= table.customerFreeAtLabel %>)</p>`;

if (content.includes(t1)) {
  content = content.replace(t1, r1);
}

const t2 = `<p><small>Table free in</small><br><%= table.timeUntilTableFreeLabel %> (<%= table.tableFreeAtLabel %>)</p>`;
const r2 = `<p><small>Table free in</small><br><span class="dynamic-wait" data-time="<%= table.tableFreeAt ? table.tableFreeAt.toISOString() : '' %>"><%= table.timeUntilTableFreeLabel %></span> (<%= table.tableFreeAtLabel %>)</p>`;

if (content.includes(t2)) {
  content = content.replace(t2, r2);
}

const scriptBlock = `  <script>
    function updateDynamicWaitTimes() {
      const now = new Date();
      document.querySelectorAll('.dynamic-wait').forEach(el => {
        const timeAttr = el.dataset.time;
        if (!timeAttr) return;
        const targetTime = new Date(timeAttr);
        const diffMs = now - targetTime;
        if (diffMs > 0) {
          const mins = Math.floor(diffMs / 60000);
          el.textContent = '0m (+' + mins + 'm)';
        } else {
          const remains = Math.ceil(-diffMs / 60000);
          el.textContent = remains + 'm';
        }
      });
    }
    setInterval(updateDynamicWaitTimes, 60000);
    updateDynamicWaitTimes();
  </script>
</body>
</html>`;

if (content.indexOf('<script>') === -1 || !content.includes('updateDynamicWaitTimes')) {
  content = content.replace('</body>\n</html>', scriptBlock);
}

fs.writeFileSync(file, content, 'utf8');
