/**
 * Virtual Office -- Frontend Entrypoint
 *
 * Initializes the Canvas 2D engine, connects to the gateway WebSocket,
 * and starts the game loop rendering the pixel-art virtual office.
 */

const canvas = document.getElementById('office-canvas') as HTMLCanvasElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const ctx = canvas.getContext('2d');

if (!ctx) {
  throw new Error('Canvas 2D context not available');
}

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

// Hide loading, show canvas
loading.style.display = 'none';

// Placeholder rendering -- will be replaced by the full engine in task 0129
ctx.imageSmoothingEnabled = false;

const TILE = 16;
const ZOOM = 3;
const SCALED = TILE * ZOOM;

// Draw a simple placeholder office grid
function drawPlaceholder(): void {
  if (!ctx) return;

  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cols = 20;
  const rows = 12;
  const offsetX = Math.floor((canvas.width - cols * SCALED) / 2);
  const offsetY = Math.floor((canvas.height - rows * SCALED) / 2);

  // Floor tiles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * SCALED;
      const y = offsetY + r * SCALED;
      const isWall = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      ctx.fillStyle = isWall ? '#3d3d5c' : '#4a4a6a';
      ctx.fillRect(x, y, SCALED - 1, SCALED - 1);
    }
  }

  // Agent desks and placeholders
  const agents = [
    { id: 'pm',        label: 'PM',  col: 3,  row: 2,  color: '#6366f1' },
    { id: 'tech-lead', label: 'TL',  col: 6,  row: 2,  color: '#8b5cf6' },
    { id: 'po',        label: 'PO',  col: 9,  row: 2,  color: '#ec4899' },
    { id: 'designer',  label: 'DSG', col: 12, row: 2,  color: '#f59e0b' },
    { id: 'back-1',    label: 'BE',  col: 3,  row: 6,  color: '#10b981' },
    { id: 'front-1',   label: 'FE',  col: 6,  row: 6,  color: '#3b82f6' },
    { id: 'qa',        label: 'QA',  col: 9,  row: 6,  color: '#ef4444' },
    { id: 'devops',    label: 'DO',  col: 12, row: 6,  color: '#14b8a6' },
  ];

  for (const agent of agents) {
    const x = offsetX + agent.col * SCALED;
    const y = offsetY + agent.row * SCALED;

    // Desk
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(x - 4, y + SCALED + 2, SCALED + 8, SCALED / 2);

    // Agent placeholder (colored square)
    ctx.fillStyle = agent.color;
    ctx.fillRect(x + 4, y + 4, SCALED - 8, SCALED - 8);

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.floor(SCALED / 3)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(agent.label, x + SCALED / 2, y + SCALED / 2);
  }

  // Title
  ctx.fillStyle = '#6366f1';
  ctx.font = '16px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Virtual Office - OpenClaw', canvas.width / 2, offsetY - 20);
  ctx.fillStyle = '#888';
  ctx.font = '12px "Courier New", monospace';
  ctx.fillText('Canvas engine loading in Task 0129...', canvas.width / 2, offsetY + rows * SCALED + 30);
}

drawPlaceholder();
window.addEventListener('resize', drawPlaceholder);
