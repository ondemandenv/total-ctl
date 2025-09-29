# Back-end

This is the back-end for the total-ctl full-stack application.

## Prerequisites

- **Node.js:** v20.12.1 or higher.

## Data Storage Architecture

This backend features a **dual-storage architecture** to provide both production-grade persistence and cost-effective, high-speed development options.

1.  **DocumentDB (Default for Production)**: For production and staging environments, the application uses a persistent DocumentDB cluster. This ensures data reliability, consistency, and true stateless application behavior.

2.  **In-Memory Storage (Default for Development)**: For local development and testing, the application defaults to a lightweight in-memory data store. This provides instant startup, zero configuration, and significant cost savings.

### Data Adapter Pattern

A `DataAdapter` service provides a unified interface for all data operations, abstracting the underlying storage mechanism. This means the application code for creating, reading, updating, and deleting data is identical whether it's operating on DocumentDB or the in-memory store.

## Configuration

The storage backend is determined by environment variables, resolved in the following order of priority:

1.  **`FORCE_IN_MEMORY_DB=true`**: Overrides all other settings and forces the use of the in-memory database.
2.  **`DATABASE_TYPE`**: Explicitly set the database type. Can be `documentdb` or `in-memory`.
3.  **`MONGODB_CONNECTION_STRING`**: If this variable is present, the application will use DocumentDB.
4.  **Default Behavior**: If none of the above are set, the application will default to **in-memory storage**.

### Running with In-Memory Storage (Recommended for Local Development)

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Start the development server (no database required):
    ```bash
    npm run dev
    ```

### Running with a Local MongoDB Instance

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Create a `.env` file in this directory with the following content:
    ```
    MONGODB_CONNECTION_STRING=mongodb://localhost:27017/total-ctl-db
    ```

3.  Start the local MongoDB instance using Docker:
    ```bash
    docker compose up
    ```

4.  Start the development server:
    ```bash
    npm run dev
    ```

The server will be running in watch mode with hot-reloading.

## ⚠️ Important: Stateless Testing Limitation

When using the **in-memory** storage, be aware that it **cannot** be used to test the true stateless nature of a containerized application. Each container instance will have its own separate, ephemeral data store.

-   Data **persists only within a single container**. A container restart will result in complete data loss.
-   In a multi-container environment (like a scaled-up ECS service), each container will have different data. This can lead to inconsistent and unpredictable behavior when load balancing between them.

For true stateless testing that mimics a production environment, you must configure the application to use a persistent data store like DocumentDB.

## API Endpoints for Storage Inspection

You can inspect the current storage configuration at runtime using the following endpoints:

-   **`GET /health`**: Provides the application status and a detailed `database` object showing the active `type`, whether it's `isStatelessCapable`, and any relevant warnings or recommendations.
-   **`GET /api/data-test/info`**: Returns statistics about the data currently in the store, including the number of items in each collection.
