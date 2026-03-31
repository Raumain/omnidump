import { join } from "node:path";
// @ts-ignore - Output provided from production Vite build
import handler from "../dist/server/server.js";

const port = process.env.PORT || 3000;
const clientDir = join(process.cwd(), "dist/client");

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    
    if (url.pathname !== "/") {
      const staticFilePath = join(clientDir, url.pathname);
      const file = Bun.file(staticFilePath);
      
      
      if (await file.exists()) {
        return new Response(file);
      }
    }

    
    return handler.fetch(req);
  },
});

const stopServer = async () => {
	console.log("\nArrêt du serveur OmniDump...");
	
	process.exit(0);
};

process.on("SIGINT", stopServer); 
process.on("SIGTERM", stopServer);

console.log(`🚀 OmniDump Production Server running globally on HTTP port ${port}`);
