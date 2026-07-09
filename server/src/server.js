import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`\n  ICKU API  →  http://localhost:${env.port}/api/v1`);
  console.log(`  env: ${env.nodeEnv}  ·  CORS origin: ${env.corsOrigin}\n`);
});
