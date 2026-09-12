const fs = require('fs');
let code = fs.readFileSync('src/redqueen/cognition/representation/graph.ts', 'utf8');

// Find restore() and add dangling relation cleanup
const restoreTarget = `
      for (const entry of entries) {
        if (!entry.content) continue;
        switch (entry.type) {
`;
const replacement = `
      const danglingRelations: string[] = [];

      for (const entry of entries) {
        if (!entry.content) continue;
        switch (entry.type) {
`;
code = code.replace(restoreTarget, replacement);

const relTarget = `
          case 'COGNITIVE_RELATION': {
            const parsed = CognitiveRelationSchema.safeParse(entry.content);
            if (parsed.success) {
              const rel = parsed.data;
              this.relations.set(rel.relationId, rel);
`;
const relReplacement = `
          case 'COGNITIVE_RELATION': {
            const parsed = CognitiveRelationSchema.safeParse(entry.content);
            if (parsed.success) {
              const rel = parsed.data;
              // Check for dangling relations
              if (!this.concepts.has(rel.subjectConceptId) || !this.concepts.has(rel.objectConceptId)) {
                danglingRelations.push(rel.relationId);
                // Keep it in relations for now, we will clean it up later in second pass, or we can just ignore it
              } else {
                this.relations.set(rel.relationId, rel);
              }
`;
code = code.replace(relTarget, relReplacement);

const endTarget = `
        }
      }

      logger.info(this.component, 'cognitive_graph_restored', {
`;
const endReplacement = `
        }
      }

      // Re-evaluate relations and clean up dangling ones
      for (const [relId, rel] of this.relations.entries()) {
         if (!this.concepts.has(rel.subjectConceptId) || !this.concepts.has(rel.objectConceptId)) {
            danglingRelations.push(relId);
            this.relations.delete(relId);
         }
      }

      // Actually delete from MemoryStore
      for (const relId of danglingRelations) {
         try {
           await this.memory.delete(relId);
         } catch(e) {}
      }

      logger.info(this.component, 'cognitive_graph_restored', {
`;
code = code.replace(endTarget, endReplacement);

fs.writeFileSync('src/redqueen/cognition/representation/graph.ts', code);
console.log('Graph updated');
