#!/usr/bin/env node

import os from 'os';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Resolve SQLite Database Path
function resolveDbPath(): string {
  if (process.env.DECKIFY_DB_PATH) {
    console.error(`Using database path from env DECKIFY_DB_PATH: ${process.env.DECKIFY_DB_PATH}`);
    return process.env.DECKIFY_DB_PATH;
  }

  const home = os.homedir();
  let defaultPath = '';

  switch (process.platform) {
    case 'darwin':
      defaultPath = path.join(home, 'Library', 'Application Support', 'Deckify', 'deckify.db');
      break;
    case 'win32':
      defaultPath = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Deckify', 'deckify.db');
      break;
    default:
      defaultPath = path.join(home, '.config', 'Deckify', 'deckify.db');
      break;
  }

  if (fs.existsSync(defaultPath)) {
    console.error(`Found Deckify database at default location: ${defaultPath}`);
    return defaultPath;
  }

  // Check lowercase deckify directory
  let altDefaultPath = '';
  switch (process.platform) {
    case 'darwin':
      altDefaultPath = path.join(home, 'Library', 'Application Support', 'deckify', 'deckify.db');
      break;
    case 'win32':
      altDefaultPath = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'deckify', 'deckify.db');
      break;
    default:
      altDefaultPath = path.join(home, '.config', 'deckify', 'deckify.db');
      break;
  }

  if (fs.existsSync(altDefaultPath)) {
    console.error(`Found Deckify database at alt default location: ${altDefaultPath}`);
    return altDefaultPath;
  }

  const fallbackPath = path.join(process.cwd(), 'deckify.db');
  console.error(`Database not found in standard locations. Falling back to: ${fallbackPath}`);
  return fallbackPath;
}

// Initialize SQLite database
const dbPath = resolveDbPath();
// Create parent directories if they don't exist
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: {
  prepare: (sql: string) => {
    all: (...params: any[]) => any[];
    run: (...params: any[]) => { changes: number; lastInsertRowid?: number | bigint };
    get: (...params: any[]) => any;
  };
  exec: (sql: string) => void;
};

try {
  if (typeof (globalThis as any).Bun !== 'undefined') {
    console.error('Running under Bun runtime. Using built-in bun:sqlite.');
    // @ts-ignore
    const { Database } = await import('bun:sqlite');
    const bunDb = new Database(dbPath);
    bunDb.exec('PRAGMA journal_mode = WAL;');
    
    db = {
      exec: (sql: string) => bunDb.exec(sql),
      prepare: (sql: string) => {
        const query = bunDb.query(sql);
        return {
          all: (...params: any[]) => query.all(...params),
          run: (...params: any[]) => query.run(...params) as any,
          get: (...params: any[]) => query.get(...params),
        };
      }
    };
  } else {
    console.error('Running under Node.js runtime. Using better-sqlite3.');
    const { default: Database } = await import('better-sqlite3');
    const nodeDb = new Database(dbPath);
    nodeDb.exec('PRAGMA journal_mode = WAL;');
    
    db = {
      exec: (sql: string) => nodeDb.exec(sql),
      prepare: (sql: string) => {
        const stmt = nodeDb.prepare(sql);
        return {
          all: (...params: any[]) => stmt.all(...params),
          run: (...params: any[]) => stmt.run(...params),
          get: (...params: any[]) => stmt.get(...params),
        };
      }
    };
  }
  console.error('SQLite database initialized successfully in WAL mode.');
} catch (err) {
  console.error(`Failed to open SQLite database at ${dbPath}:`, err);
  process.exit(1);
}

// Create tables and verify schema
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      createdAt INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      title TEXT,
      description TEXT,
      startDate TEXT,
      duration INTEGER,
      plannedStartDate TEXT,
      plannedDuration INTEGER,
      progress INTEGER,
      status TEXT,
      steps TEXT,
      taskTypeId TEXT
  );

  CREATE TABLE IF NOT EXISTS task_types (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      name TEXT,
      color TEXT
  );

  CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT,
      createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS board_tasks (
      id TEXT PRIMARY KEY,
      boardId TEXT,
      taskId TEXT,
      addedAt INTEGER,
      UNIQUE(boardId, taskId)
  );
`);

// Initialize MCP Server
const server = new Server(
  {
    name: 'deckify-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register list of tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_projects',
        description: 'Get a list of all projects in Deckify.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_project',
        description: 'Create a new project in Deckify.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name of the new project',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_tasks',
        description: 'Get a list of tasks, optionally filtered by project or status.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Filter tasks by project UUID',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'progress', 'hold', 'done'],
              description: 'Filter tasks by status',
            },
          },
        },
      },
      {
        name: 'get_task',
        description: 'Get a specific task by its UUID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The task UUID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'create_task',
        description: 'Create a new task in a project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project UUID to associate the task with',
            },
            title: {
              type: 'string',
              description: 'Title of the task',
            },
            description: {
              type: 'string',
              description: 'Detailed description of the task',
            },
            startDate: {
              type: 'string',
              description: 'Start date of the task in YYYY-MM-DD format',
            },
            duration: {
              type: 'number',
              description: 'Duration of the task in days',
            },
            plannedStartDate: {
              type: 'string',
              description: 'Planned start date of the task in YYYY-MM-DD format. Defaults to startDate.',
            },
            plannedDuration: {
              type: 'number',
              description: 'Planned duration of the task in days. Defaults to duration.',
            },
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Task progress percentage (0-100). Defaults to 0.',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'progress', 'hold', 'done'],
              description: 'Current status of the task. Defaults to backlog.',
            },
            steps: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Sub-steps or checklist items for the task',
            },
            taskTypeId: {
              type: 'string',
              description: 'UUID of the task type/category (color label)',
            },
          },
          required: ['projectId', 'title', 'startDate', 'duration'],
        },
      },
      {
        name: 'update_task',
        description: 'Update an existing task by its UUID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The task UUID',
            },
            title: {
              type: 'string',
              description: 'Updated title of the task',
            },
            description: {
              type: 'string',
              description: 'Updated description',
            },
            startDate: {
              type: 'string',
              description: 'Updated start date (YYYY-MM-DD)',
            },
            duration: {
              type: 'number',
              description: 'Updated duration in days',
            },
            plannedStartDate: {
              type: 'string',
              description: 'Updated planned start date (YYYY-MM-DD)',
            },
            plannedDuration: {
              type: 'number',
              description: 'Updated planned duration in days',
            },
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Updated progress percentage (0-100)',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'progress', 'hold', 'done'],
              description: 'Updated status',
            },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  completed: { type: 'boolean' }
                },
                required: ['id', 'text', 'completed']
              },
              description: 'Complete list of task steps to replace the current steps',
            },
            taskTypeId: {
              type: 'string',
              description: 'Updated task type UUID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'delete_task',
        description: 'Delete a task by its UUID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The task UUID to delete',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_task_types',
        description: 'Get task types / color labels available in Deckify.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Optional project UUID to filter by (includes global types)',
            },
          },
        },
      },
      {
        name: 'create_task_type',
        description: 'Create a new task type / color label.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the task type',
            },
            color: {
              type: 'string',
              description: 'Color code or CSS name (e.g. #ef4444, blue)',
            },
            projectId: {
              type: 'string',
              description: 'Optional project UUID to restrict this type to. If omitted, it is global.',
            },
          },
          required: ['name', 'color'],
        },
      },
      {
        name: 'list_boards',
        description: 'Get a list of all boards.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_board',
        description: 'Create a new Kanban board.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name of the new board',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'add_task_to_board',
        description: 'Add a task to a Kanban board.',
        inputSchema: {
          type: 'object',
          properties: {
            boardId: {
              type: 'string',
              description: 'The board UUID',
            },
            taskId: {
              type: 'string',
              description: 'The task UUID',
            },
          },
          required: ['boardId', 'taskId'],
        },
      },
      {
        name: 'remove_task_from_board',
        description: 'Remove a task from a Kanban board.',
        inputSchema: {
          type: 'object',
          properties: {
            boardId: {
              type: 'string',
              description: 'The board UUID',
            },
            taskId: {
              type: 'string',
              description: 'The task UUID',
            },
          },
          required: ['boardId', 'taskId'],
        },
      },
    ],
  };
});

// Handle tool executions
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_projects': {
        const stmt = db.prepare('SELECT * FROM projects ORDER BY createdAt DESC');
        const projects = stmt.all();
        return {
          content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
        };
      }

      case 'create_project': {
        const { name: projName } = args as { name: string };
        const id = uuidv4();
        const createdAt = Date.now();
        const stmt = db.prepare('INSERT INTO projects (id, name, createdAt) VALUES (?, ?, ?)');
        stmt.run(id, projName, createdAt);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ id, name: projName, createdAt }, null, 2),
            },
          ],
        };
      }

      case 'list_tasks': {
        const { projectId, status } = (args || {}) as { projectId?: string; status?: string };
        let query = 'SELECT * FROM tasks';
        const params: any[] = [];
        
        if (projectId || status) {
          query += ' WHERE';
          const conditions: string[] = [];
          if (projectId) {
            conditions.push(' projectId = ?');
            params.push(projectId);
          }
          if (status) {
            conditions.push(' status = ?');
            params.push(status);
          }
          query += conditions.join(' AND');
        }
        
        const stmt = db.prepare(query);
        const tasks = stmt.all(...params);
        
        // Parse JSON steps before returning
        const processedTasks = tasks.map((task: any) => ({
          ...task,
          steps: task.steps ? JSON.parse(task.steps) : [],
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(processedTasks, null, 2) }],
        };
      }

      case 'get_task': {
        const { id } = args as { id: string };
        const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
        const task = stmt.get(id) as any;
        if (!task) {
          throw new Error(`Task with UUID ${id} not found.`);
        }
        if (task.steps) {
          task.steps = JSON.parse(task.steps);
        } else {
          task.steps = [];
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
        };
      }

      case 'create_task': {
        const taskArgs = args as {
          projectId: string;
          title: string;
          description?: string;
          startDate: string;
          duration: number;
          plannedStartDate?: string;
          plannedDuration?: number;
          progress?: number;
          status?: string;
          steps?: string[];
          taskTypeId?: string;
        };

        const id = uuidv4();
        const description = taskArgs.description || '';
        const plannedStartDate = taskArgs.plannedStartDate || taskArgs.startDate;
        const plannedDuration = taskArgs.plannedDuration !== undefined ? taskArgs.plannedDuration : taskArgs.duration;
        const progress = taskArgs.progress !== undefined ? taskArgs.progress : 0;
        const status = taskArgs.status || 'backlog';
        const taskTypeId = taskArgs.taskTypeId || null;

        // Map simple string array to step structure
        const stepsObj = (taskArgs.steps || []).map((text) => ({
          id: uuidv4(),
          text,
          completed: false,
        }));
        const steps = JSON.stringify(stepsObj);

        const stmt = db.prepare(`
          INSERT INTO tasks (
            id, projectId, title, description, startDate, duration, 
            plannedStartDate, plannedDuration, progress, status, steps, taskTypeId
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          id,
          taskArgs.projectId,
          taskArgs.title,
          description,
          taskArgs.startDate,
          taskArgs.duration,
          plannedStartDate,
          plannedDuration,
          progress,
          status,
          steps,
          taskTypeId
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id,
                  projectId: taskArgs.projectId,
                  title: taskArgs.title,
                  description,
                  startDate: taskArgs.startDate,
                  duration: taskArgs.duration,
                  plannedStartDate,
                  plannedDuration,
                  progress,
                  status,
                  steps: stepsObj,
                  taskTypeId,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'update_task': {
        const updateArgs = args as {
          id: string;
          title?: string;
          description?: string;
          startDate?: string;
          duration?: number;
          plannedStartDate?: string;
          plannedDuration?: number;
          progress?: number;
          status?: string;
          steps?: Array<{ id: string; text: string; completed: boolean }>;
          taskTypeId?: string;
        };

        // Check if task exists
        const checkStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
        const task = checkStmt.get(updateArgs.id) as any;
        if (!task) {
          throw new Error(`Task with UUID ${updateArgs.id} not found.`);
        }

        const keys = Object.keys(updateArgs).filter((k) => k !== 'id');
        if (keys.length === 0) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ message: 'No fields to update', task }, null, 2) }],
          };
        }

        const setClause = keys.map((k) => `${k} = ?`).join(', ');
        const values = keys.map((k) => {
          const val = (updateArgs as any)[k];
          if (k === 'steps') {
            return JSON.stringify(val);
          }
          return val;
        });
        values.push(updateArgs.id);

        const updateStmt = db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`);
        updateStmt.run(...values);

        // Fetch updated task
        const updatedTask = checkStmt.get(updateArgs.id) as any;
        if (updatedTask.steps) {
          updatedTask.steps = JSON.parse(updatedTask.steps);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(updatedTask, null, 2) }],
        };
      }

      case 'delete_task': {
        const { id } = args as { id: string };
        const checkStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
        const task = checkStmt.get(id);
        if (!task) {
          throw new Error(`Task with UUID ${id} not found.`);
        }

        // Delete references in board_tasks
        const deleteBoardRefs = db.prepare('DELETE FROM board_tasks WHERE taskId = ?');
        deleteBoardRefs.run(id);

        // Delete the task itself
        const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');
        deleteStmt.run(id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ message: `Task ${id} successfully deleted.` }, null, 2),
            },
          ],
        };
      }

      case 'list_task_types': {
        const { projectId } = (args || {}) as { projectId?: string };
        let stmt;
        let types;
        if (projectId) {
          stmt = db.prepare('SELECT * FROM task_types WHERE projectId = ? OR projectId IS NULL');
          types = stmt.all(projectId);
        } else {
          stmt = db.prepare('SELECT * FROM task_types');
          types = stmt.all();
        }
        
        return {
          content: [{ type: 'text', text: JSON.stringify(types, null, 2) }],
        };
      }

      case 'create_task_type': {
        const typeArgs = args as { name: string; color: string; projectId?: string };
        const id = uuidv4();
        const projectId = typeArgs.projectId || null;
        
        const stmt = db.prepare('INSERT INTO task_types (id, projectId, name, color) VALUES (?, ?, ?, ?)');
        stmt.run(id, projectId, typeArgs.name, typeArgs.color);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ id, projectId, name: typeArgs.name, color: typeArgs.color }, null, 2),
            },
          ],
        };
      }

      case 'list_boards': {
        const stmt = db.prepare('SELECT * FROM boards ORDER BY createdAt DESC');
        const boards = stmt.all();
        return {
          content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }],
        };
      }

      case 'create_board': {
        const { name: boardName } = args as { name: string };
        const id = uuidv4();
        const createdAt = Date.now();
        
        const stmt = db.prepare('INSERT INTO boards (id, name, createdAt) VALUES (?, ?, ?)');
        stmt.run(id, boardName, createdAt);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ id, name: boardName, createdAt }, null, 2),
            },
          ],
        };
      }

      case 'add_task_to_board': {
        const { boardId, taskId } = args as { boardId: string; taskId: string };
        const id = uuidv4();
        const addedAt = Date.now();

        try {
          const stmt = db.prepare('INSERT INTO board_tasks (id, boardId, taskId, addedAt) VALUES (?, ?, ?, ?)');
          stmt.run(id, boardId, taskId, addedAt);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ id, boardId, taskId, addedAt }, null, 2),
              },
            ],
          };
        } catch (e: any) {
          if (e.message && e.message.includes('UNIQUE constraint failed')) {
            // Fetch existing
            const stmt = db.prepare('SELECT * FROM board_tasks WHERE boardId = ? AND taskId = ?');
            const existing = stmt.get(boardId, taskId);
            return {
              content: [{ type: 'text', text: JSON.stringify({ message: 'Task already on board', existing }, null, 2) }],
            };
          }
          throw e;
        }
      }

      case 'remove_task_from_board': {
        const { boardId, taskId } = args as { boardId: string; taskId: string };
        const stmt = db.prepare('DELETE FROM board_tasks WHERE boardId = ? AND taskId = ?');
        const result = stmt.run(boardId, taskId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: result.changes > 0 
                    ? `Task ${taskId} removed from board ${boardId}.` 
                    : `Task ${taskId} was not found on board ${boardId}.`,
                  changes: result.changes,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Tool ${name} not found.`);
    }
  } catch (error: any) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: ${error.message || error}`,
        },
      ],
    };
  }
});

// Run Stdio Transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Deckify MCP Server running on Stdio transport.');
}

run().catch((error) => {
  console.error('Fatal error in Deckify MCP Server:', error);
  process.exit(1);
});
