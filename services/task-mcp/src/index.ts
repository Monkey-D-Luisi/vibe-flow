import { TaskMCPServer } from './mcp/tools.js';

const server = new TaskMCPServer();
server.start().catch(console.error);

