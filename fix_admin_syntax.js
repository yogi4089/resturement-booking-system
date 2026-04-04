const fs = require('fs');
const path = require('path');

const ctrlPath = 'e:/New folder/resturent managment/backend/controllers/adminController.js';
let ctrlStr = fs.readFileSync(ctrlPath, 'utf8');

const errSearch = `        resetInProgress: Boolean(resetReadyAt && resetReadyAt > now)
      };
    });

    res.render("admin-tables", {`;

const errReplace = `        resetInProgress: Boolean(resetReadyAt && resetReadyAt > now)
      };
    }));

    res.render("admin-tables", {`;

ctrlStr = ctrlStr.replace(errSearch, errReplace);
fs.writeFileSync(ctrlPath, ctrlStr);
console.log('Fixed syntax error.');
