import { QualityMCPServer } from './mcp/tools.js';

const server = new QualityMCPServer();
server.start().catch(console.error);