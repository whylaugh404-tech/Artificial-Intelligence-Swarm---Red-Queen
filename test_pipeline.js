const { CognitionPipeline } = require('./dist/server.cjs').__cognition || {};
// wait, we can't easily require it if it's compiled as a monolith without exports.

// Let's just run tsx on a quick script.
