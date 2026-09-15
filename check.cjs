const fs = require('fs');
const content = fs.readFileSync('test/p9_5_collective_cognition.test.ts', 'utf8');
let depth = 0;
for(let i=0; i<content.length; i++) {
  if (content[i] === '{') depth++;
  if (content[i] === '}') {
    depth--;
    if (depth < 0) {
      console.log('Extra } at index ' + i + ', line: ' + content.substring(0, i).split('\n').length);
      depth = 0;
    }
  }
}
console.log('Final depth:', depth);
