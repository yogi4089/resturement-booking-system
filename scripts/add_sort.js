const fs = require('fs');

// Patch adminController.js
let ctrlPath = 'e:/New folder/resturent managment/backend/controllers/adminController.js';
let ctrlStr = fs.readFileSync(ctrlPath, 'utf8');

const sortSearch = `    case "wait_desc":
      return cloned.sort((a, b) => {
        const waitDiff = safeNumber(b.waitRemainingMinutes) - safeNumber(a.waitRemainingMinutes);
        if (waitDiff !== 0) return waitDiff;
        return safeNumber(b.priority_score) - safeNumber(a.priority_score);
      });`;

const sortAdd = `    case "wait_desc":
      return cloned.sort((a, b) => {
        const waitDiff = safeNumber(b.waitRemainingMinutes) - safeNumber(a.waitRemainingMinutes);
        if (waitDiff !== 0) return waitDiff;
        return safeNumber(b.priority_score) - safeNumber(a.priority_score);
      });
    case "excess_time_desc":
      return cloned.sort((a, b) => {
        const waitDiff = safeNumber(a.waitRemainingMinutes) - safeNumber(b.waitRemainingMinutes);
        if (waitDiff !== 0) return waitDiff;
        return safeNumber(b.priority_score) - safeNumber(a.priority_score);
      });`;

if (ctrlStr.includes(sortSearch) && !ctrlStr.includes('excess_time_desc')) {
  ctrlStr = ctrlStr.replace(sortSearch, sortAdd);
  fs.writeFileSync(ctrlPath, ctrlStr);
}

// Patch admin-waiting-list.ejs
let ejsPath = 'e:/New folder/resturent managment/frontend/views/admin-waiting-list.ejs';
let ejsStr = fs.readFileSync(ejsPath, 'utf8');

const optSearch = `<option value="priority_arrival" <%= readyControls.sort === 'priority_arrival' ? 'selected' : '' %>>Priority then arrival</option>`;
const optAdd = `<option value="priority_arrival" <%= readyControls.sort === 'priority_arrival' ? 'selected' : '' %>>Priority then arrival</option>
          <option value="excess_time_desc" <%= readyControls.sort === 'excess_time_desc' ? 'selected' : '' %>>Wait exceeded (longest first)</option>`;

// Notice that there are multiple select names (wSort, rSort, bSort)
// We just want to add it to the rSort one. Let's find exactly rSort.
const searchBlock = `        <select class="form-select luxury-input" name="rSort">
          <option value="priority_arrival" <%= readyControls.sort === 'priority_arrival' ? 'selected' : '' %>>Priority then arrival</option>`;

const replaceBlock = `        <select class="form-select luxury-input" name="rSort">
          <option value="excess_time_desc" <%= readyControls.sort === 'excess_time_desc' ? 'selected' : '' %>>Wait exceeded (longest first)</option>
          <option value="priority_arrival" <%= readyControls.sort === 'priority_arrival' ? 'selected' : '' %>>Priority then arrival</option>`;

if (ejsStr.includes(searchBlock)) {
  ejsStr = ejsStr.replace(searchBlock, replaceBlock);
  fs.writeFileSync(ejsPath, ejsStr);
}
console.log('patched sorting feature');
