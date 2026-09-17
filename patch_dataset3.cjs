const fs = require('fs');
const file = 'src/redqueen/core/cell.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `await this.cognition.process({
        requestId: \`req_\${observation.observationId}\`,
        type: 'UNDERSTAND',
        context: {
          contextId: \`ctx_\${Date.now()}\`,
          type: 'dataset_ingestion',
          description: 'Dataset ingestion process'
        },
        payload: {
          content: observation.content,
          metadata: {
            observationId: observation.observationId,
            timestamp: observation.timestamp,
            sourceId: observation.sourceId,
            type: observation.type
          }
        },
        originatingCellId: this.nodeId
      });`;

const replacement = `await this.cognition.executeCycle(JSON.stringify(observation.content));`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
console.log("Patched cell.ts to use this.cognition.executeCycle");
