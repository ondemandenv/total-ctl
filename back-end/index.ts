import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { CredentialService } from "./services/credential-service";
import { DatabaseConfigService } from "./services/database-config.service";
import { inMemoryDataStore } from "./services/in-memory-data.service";
import VideoAnalyzerRoutes from "./routes/video-analyzer.routes";
import DataTestRoutes from "./routes/data-test.routes";

dotenv.config();

// Initialize database configuration service (this will show warnings/info)
const dbConfig = DatabaseConfigService.getInstance();
const credentialsService = new CredentialService();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Enhanced healthcheck that includes storage type and configuration warnings
app.get("/health", (_req, res) => {
  const configSummary = dbConfig.getConfigSummary();
  const stats = dbConfig.isUsingInMemory() ? inMemoryDataStore.getStats() : {};
  
  res.json({ 
    status: "ok", 
    database: {
      type: configSummary.databaseType,
      environment: configSummary.environment,
      isStatelessCapable: configSummary.isStatelessCapable,
      warnings: configSummary.warnings,
      recommendations: configSummary.recommendations
    },
    timestamp: new Date().toISOString(),
    ...(dbConfig.isUsingInMemory() && { inMemoryStats: stats })
  });
});

app.get("/api", (_req, res) => {
  const configSummary = dbConfig.getConfigSummary();
  res.json({ 
    ok: true,
    database: {
      type: configSummary.databaseType,
      isStatelessCapable: configSummary.isStatelessCapable
    }
  });
});

// mount routes under /api/moderation/video
app.use("/api/moderation/video", VideoAnalyzerRoutes(credentialsService));

// mount data test routes under /api/data-test (for testing the new storage system)
app.use("/api/data-test", DataTestRoutes());

const port = parseInt(process.env.API_PORT || "3001");

async function start() {
  try {
    const connectionString = dbConfig.getConnectionString();
    
    if (dbConfig.isUsingDocumentDB() && connectionString) {
      await mongoose.connect(connectionString, {
        serverSelectionTimeoutMS: 10000,
        tls: true,
        tlsCAFile: `./global-bundle.pem`,
      } as any);
      console.log("✅ DocumentDB connected successfully");
    } else {
      console.log("🧠 Using in-memory data storage");
    }
    
    app.listen(port, () => {
      console.log(`\n🚀 Server running on: http://localhost:${port}`);
      console.log(`📊 Database: ${dbConfig.getDatabaseType().toUpperCase()}`);
      console.log(`🔧 Health check: http://localhost:${port}/health`);
      console.log(`🧪 Test APIs: http://localhost:${port}/api/data-test/info`);
      
      if (dbConfig.isUsingInMemory()) {
        console.log(`\n⚠️  REMINDER: In-memory storage cannot test stateless ECS behavior`);
        console.log(`   Set DATABASE_TYPE=documentdb for stateless testing\n`);
      }
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();