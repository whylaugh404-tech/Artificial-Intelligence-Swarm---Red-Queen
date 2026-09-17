const fs = require('fs');
const file = 'src/redqueen/cognition/computation/fabric.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `const result = await localExecutor(subtask, resolvedInputs, targetCell) as any;`;
content = content.replace(`const result = await localExecutor(subtask, resolvedInputs, targetCell);`, replacement);

fs.writeFileSync(file, content);
