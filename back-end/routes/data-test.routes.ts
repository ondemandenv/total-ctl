import { Router, Request, Response } from "express";
import { SandboxDataService } from "../services/sandbox-data.service";
import { DatabaseConfigService } from "../services/database-config.service";
import { inMemoryDataStore } from "../services/in-memory-data.service";

export const DataTestRoutes = () => {
  const dataService = new SandboxDataService();
  const dbConfig = DatabaseConfigService.getInstance();
  const router = Router();

  // Get storage info and stats with configuration details
  router.get("/info", async (req: Request, res: Response) => {
    try {
      const stats = await dataService.getStorageStats();
      const configSummary = dbConfig.getConfigSummary();
      
      const response = {
        ...stats,
        configuration: configSummary,
        configurationHelp: {
          environmentVariables: {
            DATABASE_TYPE: 'Set to "documentdb" or "in-memory" to override auto-detection',
            FORCE_IN_MEMORY_DB: 'Set to "true" to force in-memory storage regardless of other settings',
            MONGODB_CONNECTION_STRING: 'Provide DocumentDB connection string to enable persistent storage',
            NODE_ENV: 'Current environment setting'
          },
          examples: {
            forceDocumentDB: 'DATABASE_TYPE=documentdb',
            forceInMemory: 'DATABASE_TYPE=in-memory',
            testMode: 'FORCE_IN_MEMORY_DB=true'
          }
        }
      };
      
      // Add in-memory specific stats if using in-memory storage
      if (dbConfig.isUsingInMemory()) {
        const inMemoryStats = inMemoryDataStore.getStats();
        response.inMemoryCollections = inMemoryStats;
      }
      
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get storage info', details: error });
    }
  });

  // Seed sample data
  router.post("/seed", async (req: Request, res: Response) => {
    try {
      const result = await dataService.seedSampleData();
      res.json({
        message: 'Sample data seeded successfully',
        data: result
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to seed data', details: error });
    }
  });

  // Clear all data (in-memory only)
  router.delete("/clear", async (req: Request, res: Response) => {
    try {
      if (!dbConfig.isUsingInMemory()) {
        return res.status(400).json({ 
          error: 'Clear operation only available for in-memory storage',
          currentDatabase: dbConfig.getDatabaseType(),
          hint: 'Set DATABASE_TYPE=in-memory to enable data clearing'
        });
      }

      await inMemoryDataStore.clearAll();
      res.json({ 
        message: 'In-memory data cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear data', details: error });
    }
  });

  // Get all users
  router.get("/users", async (req: Request, res: Response) => {
    try {
      const { limit, skip, isActive } = req.query;
      const options: any = {};
      
      if (limit) options.limit = parseInt(limit as string);
      if (skip) options.skip = parseInt(skip as string);
      if (isActive !== undefined) options.isActive = isActive === 'true';

      const users = await dataService.getUsers(options);
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get users', details: error });
    }
  });

  // Create a user
  router.post("/users", async (req: Request, res: Response) => {
    try {
      const { username, email, roles, isActive } = req.body;
      
      if (!username || !email) {
        return res.status(400).json({ 
          error: 'Username and email are required' 
        });
      }

      const user = await dataService.createUser({
        username,
        email,
        roles,
        isActive
      });

      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user', details: error });
    }
  });

  // Get user by ID
  router.get("/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await dataService.getUserById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user', details: error });
    }
  });

  // Update user
  router.put("/users/:id", async (req: Request, res: Response) => {
    try {
      const { username, email, roles, isActive } = req.body;
      const user = await dataService.updateUser(req.params.id, {
        username,
        email,
        roles,
        isActive
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user', details: error });
    }
  });

  // Delete user
  router.delete("/users/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await dataService.deleteUser(req.params.id);
      
      if (!deleted) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user', details: error });
    }
  });

  // Get holograms for a user
  router.get("/users/:id/holograms", async (req: Request, res: Response) => {
    try {
      const holograms = await dataService.getHologramsByUser(req.params.id);
      res.json(holograms);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get holograms', details: error });
    }
  });

  // Create a hologram
  router.post("/holograms", async (req: Request, res: Response) => {
    try {
      const { name, url, thumbnailUrl, userId, metadata } = req.body;
      
      if (!name || !url || !userId) {
        return res.status(400).json({ 
          error: 'Name, URL, and userId are required' 
        });
      }

      const hologram = await dataService.createHologram({
        name,
        url,
        thumbnailUrl,
        userId,
        metadata
      });

      res.status(201).json(hologram);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create hologram', details: error });
    }
  });

  return router;
};

export default DataTestRoutes;