// services/database.service.ts
import mongoose from 'mongoose';
import path from 'path';

export class DatabaseService {
  public async initConnection(connectionString: string): Promise<void> {
    const options: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: 10000,
    };

    if (connectionString.includes("tls=true")) {
      const caFilePath = path.resolve(process.cwd(), "global-bundle.pem");
      options.tls = true;
      options.tlsCAFile = caFilePath;
      console.log("Using tlsCAFile:", caFilePath);
    }

    console.log("Connecting with options:", options);
    await mongoose.connect(connectionString, options);
    console.log("MongoDB connected successfully!");
  }
}
